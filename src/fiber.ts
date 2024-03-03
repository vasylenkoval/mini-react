import { Element, Props, FC } from './jsx.js';
import DOM from './dom.js';
import { CleanupFunc, EffectFunc, Hooks, processHooks, collectEffectCleanups } from './hooks.js';

/**
 * Effect tags used to determine what to do with the fiber after a render.
 */
enum EffectTag {
    /**
     * Add a new node to the DOM.
     */
    add,
    /**
     * Update an existing node in the DOM.
     */
    update,
    /**
     * Delete a node from the DOM.
     */
    delete,
}

const APP_ROOT = 'root' as const;

type Fiber<T extends string | FC = string | FC> = {
    /**
     * A string if it's a DOM node, a function if it's a component.
     */
    type: T;
    /**
     * The parent fiber.
     */
    parent?: Fiber;
    /**
     * The first child fiber.
     */
    child?: Fiber;
    /**
     * The next sibling fiber.
     */
    sibling?: Fiber;
    /**
     * The alternate fiber. Used to compare old and new trees. Contains a reference to the
     * old fiber that was replaced.
     */
    alternate?: Fiber;
    /**
     * When TRUE indicates that the fiber is an alternate of some other fiber.
     */
    isAlternate?: boolean;
    /**
     * When TRUE indicates that the fiber work is done.
     */
    isDone: boolean;
    /**
     * The dom node of the fiber. Only set for DOM (non-component) fibers.
     */
    dom?: Node;
    /**
     * Hooks, set if the fiber is a component.
     */
    hooks?: Hooks;
    /**
     * The effect tag of the fiber. Used to determine what to do with the fiber after a render.
     */
    effectTag?: EffectTag;
    /**
     * The props of the fiber.
     */
    props: Props;
    /**
     * Version of the fiber node. Incremented each time the same fiber is recreated.
     */
    version: number;
    /**
     * Same as props.children for dom nodes, computed from render for component nodes.
     */
    childElements?: Element[];

    /**
     * Reference to the element that created this fiber.
     */
    fromElement: Element;
};

type MaybeFiber = Fiber | undefined;

let nextUnitOfWork: MaybeFiber;
let componentRenderQueue: Fiber[] = [];
let wipRoot: MaybeFiber;
let currentRoot: MaybeFiber;
let deletions: Fiber[] = [];
let effectsToRun: EffectFunc[] = [];
let effectCleanupsToRun: CleanupFunc[] = [];
let isTestEnv = globalThis.process && globalThis.process.env.NODE_ENV === 'test';
let scheduler = isTestEnv
    ? function mockTestRequestIdleCallback(callback: IdleRequestCallback): number {
          callback({ timeRemaining: () => 100, didTimeout: false });
          return 0;
      }
    : window.requestIdleCallback;

/**
 * Creates app root and kicks off the first render.
 * @param root - The topmost DOM node to attach elements to.
 * @param element - The JSX element to render.
 * @param options - Options for the render.
 */
export function createRoot(root: Node, element: Element) {
    wipRoot = {
        type: APP_ROOT,
        dom: root,
        version: 0,
        fromElement: element,
        isDone: false,
        props: {
            children: [element],
        },
    };
    nextUnitOfWork = wipRoot;
    scheduler(workloop);
}

/**
 * Schedules a component to be re-rendered.
 * @param fiber - The component element to re-render.
 */
function addToComponentRenderQueue(fiber: Fiber) {
    if (!componentRenderQueue.includes(fiber)) {
        componentRenderQueue.push(fiber);
        if (isTestEnv) {
            scheduler(workloop);
        }
    }
}

/**
 * Commits changes to the DOM after a render cycle has completed.
 */
function commitRoot() {
    for (const fiberToDelete of deletions) {
        commitWork(fiberToDelete);
    }
    deletions = [];
    if (wipRoot) {
        commitWork(wipRoot);
    }

    if (wipRoot) {
        if (wipRoot.type === APP_ROOT) {
            // first mount
            currentRoot = wipRoot;
        } else {
            // subsequent renders
            const originalFiber = wipRoot.alternate;
            const parent = wipRoot.parent!;
            let nextChild = parent.child!;

            if (nextChild === originalFiber) {
                parent.child = wipRoot;
            } else {
                while (nextChild) {
                    if (nextChild.sibling === originalFiber) {
                        nextChild.sibling = wipRoot;
                        break;
                    }
                    nextChild = nextChild.sibling!;
                }
            }
        }
    }

    wipRoot = undefined;

    // Running effects in the reverse order. Leaf fibers run their effects first.
    for (let i = effectCleanupsToRun.length - 1; i >= 0; i--) {
        effectCleanupsToRun[i]();
    }
    effectCleanupsToRun.splice(0);

    for (let i = effectsToRun.length - 1; i >= 0; i--) {
        effectsToRun[i]();
    }
    effectsToRun.splice(0);
}

/**
 * Recursively commits fibers by attaching their DOM nodes to parent's and adding new props.
 * New subtrees are mounted at once.
 * Removes nodes marked to be deleted.
 * @param fiber - Fiber to commit.
 */
function commitWork(fiber: Fiber) {
    const runAfterCommit: (() => void)[] = [];

    if (fiber.dom && fiber.parent) {
        // Find closest parent that's not a component.
        let parentWithDom: MaybeFiber = fiber.parent;
        while (!parentWithDom.dom) {
            parentWithDom = parentWithDom.parent!;
        }

        switch (fiber.effectTag) {
            case EffectTag.add: {
                if (fiber.props) {
                    DOM.addProps(fiber.dom, fiber.props);
                }

                const parent = parentWithDom.dom;
                const child = fiber.dom;

                // Attach the entire tree at once when possible.
                const noSiblings = !fiber.sibling;
                const isParentRoot = parentWithDom.type === APP_ROOT;
                const isNewSubtree =
                    fiber.effectTag === EffectTag.add &&
                    parentWithDom?.effectTag === EffectTag.update;

                if ((isParentRoot || isNewSubtree) && noSiblings) {
                    // @TODO: do the check one level down, and use prepend instead?
                    // remove runAfterCommit array as only 1 operation is possible after a commit.
                    runAfterCommit.push(() => DOM.appendChild(parent, child));
                } else {
                    DOM.appendChild(parent, child);
                }

                break;
            }
            case EffectTag.update: {
                DOM.addProps(fiber.dom, fiber.props, fiber.alternate?.props);
                break;
            }
            case EffectTag.delete: {
                let domToDetach = fiber.dom;
                let childFiber = fiber.child;
                while (childFiber) {
                    childFiber = nextFiber(childFiber, fiber);
                    if (childFiber) {
                        // Find the closest dom we can detach.
                        if (!domToDetach && childFiber.dom) {
                            domToDetach = childFiber.dom;
                        }
                        // Aggregate all effect cleanups to run on unmount
                        if (childFiber.hooks) {
                            collectEffectCleanups(childFiber.hooks, effectCleanupsToRun);
                        }
                    }
                }

                let childWithDom = fiber;
                while (!childWithDom.dom && fiber.child) {
                    childWithDom = fiber.child;
                }
                if (childWithDom.dom) {
                    DOM.removeChild(parentWithDom.dom, childWithDom.dom);
                }

                return;
            }
        }
    }

    if (fiber.child) {
        commitWork(fiber.child);
    }
    if (fiber.sibling) {
        commitWork(fiber.sibling);
    }

    if (runAfterCommit.length) {
        for (const action of runAfterCommit) {
            action();
        }
    }
}

/**
 * Picks the next component to render from the render queue.
 * @returns The next component to render.
 */
function pickNextComponentToRender(): MaybeFiber {
    if (!componentRenderQueue.length) {
        return;
    }
    const componentFiber = componentRenderQueue.shift()!;

    // If the component already re-rendered since it was queued we can skip the update.
    if (componentFiber.isAlternate) {
        return pickNextComponentToRender();
    }

    return {
        ...componentFiber,
        alternate: componentFiber,
        effectTag: EffectTag.update,
        version: componentFiber.version + 1,
        isDone: false,
    };
}

/**
 * The main work loop. Picks up items from the render queue.
 * @param deadline - The deadline for the current idle period.
 */
function workloop(deadline: IdleDeadline) {
    let shouldWait = false;
    while (nextUnitOfWork && !shouldWait) {
        nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
        shouldWait = deadline.timeRemaining() < 1;
    }

    if (!nextUnitOfWork && wipRoot) {
        commitRoot();
    }

    // Pick next components to render.
    const nextComponent = pickNextComponentToRender();
    if (nextComponent) {
        wipRoot = nextComponent;
        nextUnitOfWork = wipRoot;
        scheduler(workloop);
        return;
    }

    // Loop won't run continuously in test env.
    if (isTestEnv && !wipRoot) {
        return;
    }

    scheduler(workloop);
}

/**
 * Runs the component function, processes hooks and schedules effects.
 * @param fiber - The component fiber to process.
 */
function processComponentFiber(fiber: Fiber<FC>) {
    if (!fiber.hooks) {
        fiber.hooks = [];
    }

    processHooks(
        fiber.hooks,
        function notifyOnStateChange() {
            addToComponentRenderQueue(fiber);
        },
        function scheduleEffect(effect: EffectFunc, cleanup?: CleanupFunc) {
            effectsToRun.push(effect);
            if (cleanup) {
                effectCleanupsToRun.push(cleanup);
            }
        }
    );

    const element = fiber.type(fiber.props);
    fiber.childElements = [element];
}

/**
 * Processes dom fiber node before diffing children.
 * @param fiber - The dom fiber to process.
 */
function processDomFiber(fiber: Fiber<string>) {
    if (!fiber.dom) {
        fiber.dom = DOM.createNode(fiber.type as string);
    }
    fiber.childElements = fiber.props.children;
}

/**
 * Performs a single unit of work.
 * @param fiber - Fiber to do work on.
 * @returns Next unit of work or undefined if no work is left.
 */
function performUnitOfWork(fiber: Fiber): MaybeFiber {
    if (typeof fiber.type === 'string') {
        processDomFiber(fiber as Fiber<string>);
    }
    if (typeof fiber.type === 'function') {
        processComponentFiber(fiber as Fiber<FC>);
    }
    diffChildren(fiber, fiber.childElements);
    fiber.isDone = true;
    return nextFiber(fiber, wipRoot);
}

/**
 * Returns the next fiber to be processed by the unit of work.
 * @param currFiber - Current fiber that work was done on.
 * @param root - Top fiber to return to.
 * @returns Next fiber to perform work on.
 */
function nextFiber(currFiber: Fiber, root?: Fiber): MaybeFiber {
    // Visit up to the last child first.
    if (currFiber.child && !currFiber.child.isDone) {
        return currFiber.child;
    }
    let nextFiber: MaybeFiber = currFiber;
    while (nextFiber && nextFiber !== root) {
        if (nextFiber.sibling && !nextFiber.sibling.isDone) {
            return nextFiber.sibling; // Exhaust all siblings.
        } else if (nextFiber.sibling && nextFiber.sibling.isDone) {
            nextFiber = nextFiber.sibling; // If next sibling is done, skip it.
        } else {
            nextFiber = nextFiber.parent; // Go up the tree until we reach the root or undefined.
        }
    }
    return;
}

/**
 * Builds fiber children out of provided elements and reconciles DOM nodes with previous fiber tree.
 * @param wipFiberParent - Parent fiber to build children for.
 * @param elements - Child elements.
 */
function diffChildren(wipFiberParent: Fiber, elements: Element[] = []) {
    let oldFiber = wipFiberParent.alternate && wipFiberParent.alternate.child;
    let prevSibling: MaybeFiber;
    let index = 0;

    while (index < elements.length || oldFiber) {
        let newFiber: MaybeFiber;
        const childElement = elements[index] as Element | undefined;

        const isSameType = oldFiber?.type === childElement?.type;
        const isSameElement = childElement === oldFiber?.fromElement;
        if (isSameElement) {
            newFiber = oldFiber;
        }

        // Only store 2 levels.
        if (oldFiber && !isSameElement) {
            oldFiber.alternate = undefined;
            oldFiber.isAlternate = true;
        }

        // Same node, update props.
        if (!isSameElement && oldFiber && childElement && isSameType) {
            newFiber = {
                effectTag: EffectTag.update,
                type: childElement.type,
                props: childElement.props,
                parent: wipFiberParent,
                alternate: oldFiber,
                hooks: oldFiber.hooks,
                dom: oldFiber.dom,
                version: oldFiber.version + 1,
                fromElement: childElement,
                isDone: false,
            };
        }

        // Brand new node.
        if (!isSameType && childElement) {
            newFiber = {
                effectTag: EffectTag.add,
                type: childElement.type,
                props: childElement.props,
                parent: wipFiberParent,
                version: 0,
                fromElement: childElement,
                isDone: false,
            };
        }

        // Delete old node.
        if (oldFiber && !isSameType) {
            oldFiber.effectTag = EffectTag.delete;
            deletions.push(oldFiber);
        }

        // Connect siblings.
        if (index === 0) {
            wipFiberParent.child = newFiber;
        } else if (prevSibling) {
            prevSibling.sibling = newFiber;
        }
        prevSibling = newFiber;

        // Old fiber is already a child, iterate until we reach last sibling.
        if (oldFiber) {
            oldFiber = oldFiber.sibling;
        }

        index++;
    }
}
