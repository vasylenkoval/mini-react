import { Element, Props, FC } from './jsx.js';
import DOM from './dom.js';
import { Hooks, initHooks } from './hooks.js';

enum EffectTag {
    update,
    placement,
    delete,
}

type Fiber = {
    type: string | FC;
    parent?: Fiber;
    child?: Fiber;
    sibling?: Fiber;
    alternate?: Fiber;
    dom?: Node;
    hooks?: Hooks;
    actions?: (() => void)[];
    effectTag?: EffectTag;
    props: Props;
};

type MaybeFiber = Fiber | undefined;

let nextUnitOfWork: MaybeFiber;
let wipRoot: MaybeFiber;
let currentRoot: MaybeFiber;
let deletions: Fiber[] = [];

/**
 * Creates app root and kicks off the first render.
 * @param root - The topmost DOM node to attach elements to.
 * @param element - The JSX element to render.
 */
export function createRoot(root: Node, element: Element) {
    wipRoot = {
        type: 'root',
        dom: root,
        props: {
            children: [element],
        },
    };

    nextUnitOfWork = wipRoot;
}

/**
 * Re-renders starting from the given fiber.
 * @param fiber - The fiber element to re-render.
 */
export function render() {
    wipRoot = {
        type: 'root',
        dom: currentRoot!.dom,
        props: currentRoot!.props,
        alternate: currentRoot,
    };
    nextUnitOfWork = wipRoot;
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
    currentRoot = wipRoot;
    wipRoot = undefined;
}

/**
 * Recursively commits fibers by attaching their DOM nodes to parent's and adding new props.
 * Removes nodes marked to be deleted.
 * @param fiber - Fiber to commit.
 */
function commitWork(fiber: Fiber) {
    if (fiber.dom && fiber.parent) {
        // In case when the parent is a component we need to keep looking for the closest parent with DOM.
        let parentWithDom: MaybeFiber = fiber.parent;
        while (!parentWithDom.dom) {
            parentWithDom = parentWithDom.parent!;
        }

        switch (fiber.effectTag) {
            case EffectTag.placement: {
                if (fiber.props) {
                    DOM.addProps(fiber.dom, fiber.props);
                }
                DOM.appendChild(parentWithDom.dom, fiber.dom);
                break;
            }
            case EffectTag.update: {
                DOM.addProps(fiber.dom, fiber.props, fiber.alternate?.props);
                break;
            }
            case EffectTag.delete: {
                let childWithDom = fiber;
                while (!childWithDom.dom && fiber.child) {
                    childWithDom = fiber.child;
                }
                if (childWithDom.dom) {
                    DOM.removeChild(parentWithDom.dom, fiber.dom);
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

    requestIdleCallback(workloop);
}

requestIdleCallback(workloop);

function updateComponent(fiber: Fiber) {
    if (!fiber.hooks) fiber.hooks = [];
    if (!fiber.actions) fiber.actions = [];

    // Flush all actions before the render.
    for (let action of fiber.actions) {
        action();
    }
    if (fiber.actions.length) {
        fiber.actions.splice(0, fiber.actions.length);
    }

    // Start recording hooks calls for this component.
    // Request a re-render if hook action was scheduled.
    function onAction(action: () => void) {
        fiber.actions!.push(action);
        render();
    }
    initHooks(fiber.hooks, onAction);
    const element = (fiber.type as FC)(fiber.props);
    fiber.props.children = [element];
}

/**
 * Performs a single unit of work.
 * @param fiber - Fiber to do work on.
 * @returns Next unit of work or undefined if no work is left.
 */
function performUnitOfWork(fiber: Fiber): MaybeFiber {
    if (fiber.type instanceof Function) {
        updateComponent(fiber);
    } else if (!fiber.dom) {
        fiber.dom = DOM.createNode(fiber.type);
    }

    if (fiber.props?.children?.length) {
        buildChildren(fiber, fiber.props.children);
    }

    return nextFiber(fiber);
}

/**
 * Returns the next fiber to be processed by the unit of work.
 * @param currFiber - Current fiber that work was done on.
 * @returns Next fiber to perform work on.
 */
function nextFiber(currFiber: Fiber): MaybeFiber {
    // Visit up to the last child first.
    if (currFiber.child) {
        return currFiber.child;
    }

    let nextFiber: MaybeFiber = currFiber;
    while (nextFiber) {
        // Exhaust all siblings.
        if (nextFiber.sibling) {
            return nextFiber.sibling;
        }
        // Go up the tree until we reach the root.
        nextFiber = nextFiber.parent;
    }

    return;
}

/**
 * Builds fiber children out of provided elements and reconciles DOM nodes with previous fiber tree.
 * @param wipFiberParent - Parent fiber to build children for.
 * @param elements - Child elements.
 */
function buildChildren(wipFiberParent: Fiber, elements: Element[]) {
    let oldFiber = wipFiberParent.alternate && wipFiberParent.alternate.child;
    let prevSibling: MaybeFiber;
    let index = 0;
    while (index < elements.length || oldFiber) {
        let newFiber: MaybeFiber;
        const childElement = elements[index] as Element | undefined;
        const isSame = oldFiber?.type === childElement?.type;

        // Same node, update props.
        if (oldFiber && childElement && isSame) {
            newFiber = {
                type: childElement.type,
                props: childElement.props,
                parent: wipFiberParent,
                alternate: oldFiber,
                hooks: oldFiber.hooks,
                actions: oldFiber.actions,
                dom: oldFiber.dom,
                effectTag: EffectTag.update,
            };
        }

        // Brand new node.
        if (!oldFiber && childElement) {
            newFiber = {
                type: childElement.type,
                props: childElement.props,
                parent: wipFiberParent,
                effectTag: EffectTag.placement,
            };
        }

        // Delete old node.
        if (oldFiber && !isSame) {
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
