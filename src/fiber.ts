import { JSXElement, Props, FC } from './jsx.js';
import DOM from './dom.js';
import { CleanupFunc, EffectFunc, Hooks, processHooks, collectEffectCleanups } from './hooks.js';
import { schedule } from './scheduler.js';

/**
 * Effect tags used to determine what to do with the fiber after a render.
 */
enum EffectTag {
    /**
     * Add to the DOM.
     */
    add,
    /**
     * Update in the DOM.
     */
    update,
    /**
     * Delete this node from the DOM.
     */
    delete,
    /**
     * Skip the node update.
     */
    skip,
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
    childElements?: JSXElement[];

    /**
     * Reference to the element that created this fiber.
     */
    fromElement: JSXElement;
};

type MaybeFiber = Fiber | undefined;

let nextUnitOfWork: MaybeFiber;
let componentRenderQueue: Fiber[] = [];
let wipRoot: MaybeFiber;
let currentRoot: MaybeFiber;
let deletions: Fiber[] = [];
let effectsToRun: EffectFunc[] = [];
let effectCleanupsToRun: CleanupFunc[] = [];

/**
 * Creates app root and kicks off the first render.
 * @param root - The topmost DOM node to attach elements to.
 * @param element - The JSX element to render.
 * @param options - Options for the render.
 */
export function createRoot(root: Node, element: JSXElement) {
    wipRoot = {
        type: APP_ROOT,
        dom: root,
        version: 0,
        fromElement: element,
        props: {
            children: [element],
        },
    };
    nextUnitOfWork = wipRoot;
    schedule(workloop);
}

/**
 * Schedules a component to be re-rendered.
 * @param fiber - The component element to re-render.
 */
function addToComponentRenderQueue(fiber: Fiber) {
    if (!componentRenderQueue.includes(fiber)) {
        componentRenderQueue.push(fiber);
        schedule(workloop);
    }
}

/**
 * Commits changes to the DOM after a render cycle has completed.
 */
function commitRoot() {
    for (const fiberToDelete of deletions) {
        commitFiber(fiberToDelete);
    }
    deletions = [];

    if (wipRoot) {
        commitFiber(wipRoot);

        if (wipRoot.type === APP_ROOT) {
            // first mount
            currentRoot = wipRoot;
        } else {
            // component re-renders, attaching fiber to existing root
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
function commitFiber(fiber: Fiber) {
    let afterCommit: (() => void) | undefined;

    // No work to be done here, nothing changed.
    if (fiber.effectTag === EffectTag.skip) {
        return;
    }

    if (fiber.effectTag === EffectTag.delete) {
        // Collect all of the useEffect cleanup functions to run after delete.
        let currFiber: MaybeFiber = fiber;
        while (currFiber) {
            if (fiber.hooks) {
                collectEffectCleanups(fiber.hooks, effectCleanupsToRun);
            }
            currFiber = nextFiber(currFiber, fiber);
        }
    }

    // If fiber has a dom element, we need to sync it with the fiber.
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
                    afterCommit = () => DOM.appendChild(parent, child);
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

    if (fiber.child) commitFiber(fiber.child);
    if (fiber.sibling) commitFiber(fiber.sibling);
    if (afterCommit) afterCommit();
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
    };
}

/**
 * The main work loop. Picks up items from the render queue.
 * @param timeRemaining - Function that returns the remaining time this loop has to run.
 */
function workloop(remainingMs: () => number) {
    let shouldWait = false;
    while (nextUnitOfWork && !shouldWait) {
        nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
        shouldWait = remainingMs() < 1;
    }

    if (!nextUnitOfWork && wipRoot) {
        commitRoot();
    }

    // Pick next components to render.
    const nextComponent = pickNextComponentToRender();
    if (nextComponent) {
        wipRoot = nextComponent;
        nextUnitOfWork = wipRoot;
        schedule(workloop);
        return;
    }

    if (wipRoot) {
        schedule(workloop);
    }
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
    return nextFiber(fiber, wipRoot, (f) => f.effectTag !== EffectTag.skip);
}

/**
 * Returns the next fiber to be processed by the unit of work.
 * @param currFiber - Current fiber that work was done on.
 * @param root - Top fiber to return to.
 * @returns Next fiber to perform work on.
 */
function nextFiber(
    currFiber: Fiber,
    root: MaybeFiber,
    filter: (fiber: Fiber) => boolean = () => true
): MaybeFiber {
    // Visit up to the last child first.
    if (currFiber.child && filter(currFiber.child)) {
        return currFiber.child;
    }
    let nextFiber: MaybeFiber = currFiber;
    while (nextFiber && nextFiber !== root) {
        if (nextFiber.sibling && filter(nextFiber.sibling)) {
            return nextFiber.sibling; // Exhaust all siblings.
        } else if (nextFiber.sibling) {
            nextFiber = nextFiber.sibling; // If didn't pass the filter but exists - skip it.
        } else {
            nextFiber = nextFiber.parent; // If doesn't exist go up the tree until we reach the root or undefined.
        }
    }
    return;
}

/**
 * Builds fiber children out of provided elements and reconciles DOM nodes with previous fiber tree.
 * @param wipFiberParent - Parent fiber to build children for.
 * @param elements - Child elements.
 */
function diffChildren(wipFiberParent: Fiber, elements: JSXElement[] = []) {
    let oldFiber = wipFiberParent.alternate && wipFiberParent.alternate.child;
    let prevSibling: MaybeFiber;
    let index = 0;

    while (index < elements.length || oldFiber) {
        let newFiber: MaybeFiber;
        const childElement = elements[index] as JSXElement | undefined;

        const isSameType = oldFiber?.type === childElement?.type;
        const isSameElement = childElement === oldFiber?.fromElement;

        // Only store 2 levels.
        if (oldFiber && !isSameElement) {
            oldFiber.alternate = undefined;
            oldFiber.isAlternate = true;
        }

        // Same node, update props.
        if (oldFiber && childElement && isSameType) {
            newFiber = {
                effectTag: isSameElement ? EffectTag.skip : EffectTag.update,
                type: childElement.type,
                props: childElement.props,
                parent: wipFiberParent,
                alternate: oldFiber,
                hooks: oldFiber.hooks,
                dom: oldFiber.dom,
                version: oldFiber.version + 1,
                fromElement: childElement,
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
