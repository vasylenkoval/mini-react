import DOM from './dom.js';
import { processHooks, collectEffectCleanups } from './hooks.js';
var EffectTag;
(function (EffectTag) {
    EffectTag[EffectTag["add"] = 0] = "add";
    EffectTag[EffectTag["update"] = 1] = "update";
    EffectTag[EffectTag["delete"] = 2] = "delete";
})(EffectTag || (EffectTag = {}));
let nextUnitOfWork;
let wipRoot;
let currentRoot;
let deletions = [];
let effectsToRun = [];
let effectCleanupsToRun = [];
/**
 * Creates app root and kicks off the first render.
 * @param root - The topmost DOM node to attach elements to.
 * @param element - The JSX element to render.
 * @TODO: different strategy for the first render?
 */
export function createRoot(root, element) {
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
 * Re-renders starting from the given component.
 * @param fiber - The fiber component element to re-render.
 */
export function renderComponent(fiber) {
    // @TODO: start rendering from a component and implement a render queue
    // fiber.alternate = undefined;
    // const wipFiber = Object.assign({}, fiber, {
    //     alternate: fiber,
    //     child: undefined,
    //     effectTag: undefined,
    // });
    // let parent = fiber.parent!;
    // let prevSibling: MaybeFiber;
    // // If not direct child, find sibling pointing to this component.
    // if (parent.child !== fiber) {
    //     prevSibling = parent.child!.sibling;
    //     while (prevSibling && prevSibling.sibling !== fiber) {
    //         prevSibling = prevSibling.sibling;
    //     }
    // }
    // // Reset the reference on the pointing nodes to our new fiber.
    // if (prevSibling) {
    //     prevSibling.sibling = wipFiber;
    // } else {
    //     parent.child = wipFiber;
    // }
    // For now just re-render the tree.
    wipRoot = {
        type: 'root',
        dom: currentRoot.dom,
        props: currentRoot.props,
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
    // Running effects in the reverse order. Leaf fibers run their effects first.
    for (let i = effectCleanupsToRun.length - 1; i >= 0; i--)
        effectCleanupsToRun[i]();
    effectCleanupsToRun.splice(0);
    for (let i = effectsToRun.length - 1; i >= 0; i--)
        effectsToRun[i]();
    effectsToRun.splice(0);
    currentRoot = wipRoot;
    wipRoot = undefined;
}
/**
 * Recursively commits fibers by attaching their DOM nodes to parent's and adding new props.
 * Removes nodes marked to be deleted.
 * @param fiber - Fiber to commit.
 */
function commitWork(fiber) {
    var _a;
    if (fiber.dom && fiber.parent) {
        // Find closest parent that's not a component.
        let parentWithDom = fiber.parent;
        while (!parentWithDom.dom) {
            parentWithDom = parentWithDom.parent;
        }
        switch (fiber.effectTag) {
            case EffectTag.add: {
                if (fiber.props) {
                    DOM.addProps(fiber.dom, fiber.props);
                }
                DOM.appendChild(parentWithDom.dom, fiber.dom);
                break;
            }
            case EffectTag.update: {
                DOM.addProps(fiber.dom, fiber.props, (_a = fiber.alternate) === null || _a === void 0 ? void 0 : _a.props);
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
}
/**
 * The main work loop. Picks up items from the render queue.
 * @param deadline - The deadline for the current idle period.
 */
function workloop(deadline) {
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
function updateComponent(fiber) {
    if (!fiber.hooks)
        fiber.hooks = [];
    processHooks(fiber.hooks, function notifyOnStateChange() {
        renderComponent(fiber);
    }, function scheduleEffect(effect, cleanup) {
        effectsToRun.push(effect);
        if (cleanup) {
            effectCleanupsToRun.push(cleanup);
        }
    });
    const element = fiber.type(fiber.props);
    fiber.props.children = [element];
}
/**
 * Performs a single unit of work.
 * @param fiber - Fiber to do work on.
 * @returns Next unit of work or undefined if no work is left.
 */
function performUnitOfWork(fiber) {
    if (typeof fiber.type === 'function') {
        updateComponent(fiber);
    }
    else if (!fiber.dom) {
        fiber.dom = DOM.createNode(fiber.type);
    }
    diffChildren(fiber, fiber.props.children);
    return nextFiber(fiber, wipRoot);
}
/**
 * Returns the next fiber to be processed by the unit of work.
 * @param currFiber - Current fiber that work was done on.
 * @param root - Top fiber to return to.
 * @returns Next fiber to perform work on.
 */
function nextFiber(currFiber, root) {
    // Visit up to the last child first.
    if (currFiber.child) {
        return currFiber.child;
    }
    let nextFiber = currFiber;
    while (nextFiber && nextFiber !== root) {
        // Exhaust all siblings.
        if (nextFiber.sibling) {
            return nextFiber.sibling;
        }
        // Go up the tree until we reach the root or undefined
        nextFiber = nextFiber.parent;
    }
    return;
}
/**
 * Builds fiber children out of provided elements and reconciles DOM nodes with previous fiber tree.
 * @param wipFiberParent - Parent fiber to build children for.
 * @param elements - Child elements.
 */
function diffChildren(wipFiberParent, elements = []) {
    let oldFiber = wipFiberParent.alternate && wipFiberParent.alternate.child;
    let prevSibling;
    let index = 0;
    while (index < elements.length || oldFiber) {
        let newFiber;
        const childElement = elements[index];
        const isSame = (oldFiber === null || oldFiber === void 0 ? void 0 : oldFiber.type) === (childElement === null || childElement === void 0 ? void 0 : childElement.type);
        // Only store 2 levels.
        if (oldFiber) {
            oldFiber.alternate = undefined;
        }
        // Same node, update props.
        if (oldFiber && childElement && isSame) {
            newFiber = {
                type: childElement.type,
                props: childElement.props,
                parent: wipFiberParent,
                alternate: oldFiber,
                hooks: oldFiber.hooks,
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
                effectTag: EffectTag.add,
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
        }
        else if (prevSibling) {
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
