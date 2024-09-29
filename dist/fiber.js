import DOM from './dom.js';
import { processHooks, collectEffectCleanups } from './hooks.js';
import { schedule } from './scheduler.js';
/**
 * Effect tags used to determine what to do with the fiber after a render.
 */
var EffectTag;
(function (EffectTag) {
    /**
     * Add to the DOM.
     */
    EffectTag[EffectTag["add"] = 0] = "add";
    /**
     * Update in the DOM.
     */
    EffectTag[EffectTag["update"] = 1] = "update";
    /**
     * Delete this node from the DOM.
     */
    EffectTag[EffectTag["delete"] = 2] = "delete";
    /**
     * Skip the node update.
     */
    EffectTag[EffectTag["skip"] = 3] = "skip";
})(EffectTag || (EffectTag = {}));
const APP_ROOT = 'root';
let nextUnitOfWork;
let componentRenderQueue = [];
let wipRoot;
let currentRoot;
let deletions = [];
let effectsToRun = [];
let effectCleanupsToRun = [];
/**
 * Creates app root and kicks off the first render.
 * @param root - The topmost DOM node to attach elements to.
 * @param element - The JSX element to render.
 * @param options - Options for the render.
 */
export function createRoot(root, element) {
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
function addToComponentRenderQueue(fiber) {
    if (!componentRenderQueue.includes(fiber)) {
        componentRenderQueue.push(fiber);
        schedule(workloop);
    }
}
/**
 * Commits changes to the DOM after a render cycle has completed.
 */
function commitRoot() {
    // Process deletes first.
    for (const fiberToDelete of deletions) {
        commitFiber(fiberToDelete);
    }
    deletions = [];
    if (wipRoot) {
        let afterCommitFns = [];
        let nextFiberToCommit = wipRoot;
        while (nextFiberToCommit) {
            const afterCommitFn = commitFiber(nextFiberToCommit);
            if (afterCommitFn) {
                afterCommitFns.push(afterCommitFn);
            }
            nextFiberToCommit = nextFiber(nextFiberToCommit, wipRoot, (f) => f.effectTag !== EffectTag.skip);
        }
        for (const afterCommitFn of afterCommitFns.reverse()) {
            afterCommitFn();
        }
        if (wipRoot.type === APP_ROOT) {
            // first mount
            currentRoot = wipRoot;
        }
        else {
            // component re-renders, attaching fiber to existing root
            const originalFiber = wipRoot.alternate;
            const parent = wipRoot.parent;
            let nextChild = parent.child;
            if (nextChild === originalFiber) {
                parent.child = wipRoot;
            }
            else {
                while (nextChild) {
                    if (nextChild.sibling === originalFiber) {
                        nextChild.sibling = wipRoot;
                        break;
                    }
                    nextChild = nextChild.sibling;
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
 * Commits a single fiber by attaching its DOM nodes to parent's and adding new props.
 * New subtrees are mounted at once.
 * Removes nodes marked to be deleted.
 * @param fiber - Fiber to commit.
 */
function commitFiber(fiber) {
    // No work to be done here, nothing changed.
    if (fiber.effectTag === EffectTag.skip) {
        return;
    }
    if (fiber.effectTag === EffectTag.delete) {
        // Collect all of the useEffect cleanup functions to run after delete.
        let nextComponentChildFiber = fiber;
        while (nextComponentChildFiber) {
            if (fiber.hooks) {
                collectEffectCleanups(fiber.hooks, effectCleanupsToRun);
            }
            nextComponentChildFiber = findNextFiber(nextComponentChildFiber, fiber, (f) => typeof f.type !== 'string');
        }
        // Find the closest child and remove it from the dom.
        const closestChildDOM = fiber.dom ?? findNextFiber(fiber, fiber, (f) => !!f.dom)?.dom;
        if (closestChildDOM) {
            DOM.removeChild(closestChildDOM.parentNode, closestChildDOM);
        }
    }
    if (!(fiber.dom && fiber.parent)) {
        return;
    }
    // Find closest parent that's not a component.
    let parentWithDom = fiber.parent;
    while (!parentWithDom.dom) {
        parentWithDom = parentWithDom.parent;
    }
    let afterCommit;
    if (fiber.effectTag === EffectTag.add) {
        const parent = parentWithDom.dom;
        const child = fiber.dom;
        // Attach the entire tree at once when possible.
        const noSiblings = parentWithDom === fiber.parent && !fiber.sibling;
        const isParentRoot = parentWithDom.type === APP_ROOT;
        const isNewSubtree = fiber.effectTag === EffectTag.add && parentWithDom?.effectTag === EffectTag.update;
        if ((isParentRoot || isNewSubtree) && noSiblings) {
            afterCommit = () => DOM.appendChild(parent, child);
        }
        else {
            DOM.appendChild(parent, child);
        }
    }
    if (fiber.effectTag === EffectTag.update) {
        DOM.addProps(fiber.dom, fiber.props, fiber.alternate?.props);
    }
    return afterCommit;
}
/**
 * Picks the next component to render from the render queue.
 * @returns The next component to render.
 */
function pickNextComponentToRender() {
    if (!componentRenderQueue.length) {
        return;
    }
    const componentFiber = componentRenderQueue.shift();
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
function workloop(remainingMs) {
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
function processComponentFiber(fiber) {
    if (!fiber.hooks) {
        fiber.hooks = [];
    }
    processHooks(fiber.hooks, function notifyOnStateChange() {
        addToComponentRenderQueue(fiber);
    }, function scheduleEffect(effect, cleanup) {
        effectsToRun.push(effect);
        if (cleanup) {
            effectCleanupsToRun.push(cleanup);
        }
    });
    const element = fiber.type(fiber.props);
    fiber.childElements = [element];
}
/**
 * Processes dom fiber node before diffing children.
 * @param fiber - The dom fiber to process.
 */
function processDomFiber(fiber) {
    if (!fiber.dom) {
        fiber.dom = DOM.createNode(fiber.type);
        if (fiber.props) {
            DOM.addProps(fiber.dom, fiber.props);
        }
    }
    fiber.childElements = fiber.props.children;
}
/**
 * Performs a single unit of work.
 * @param fiber - Fiber to do work on.
 * @returns Next unit of work or undefined if no work is left.
 */
function performUnitOfWork(fiber) {
    if (typeof fiber.type === 'string') {
        processDomFiber(fiber);
    }
    if (typeof fiber.type === 'function') {
        processComponentFiber(fiber);
    }
    diffChildren(fiber, fiber.childElements);
    return nextFiber(fiber, wipRoot, (f) => f.effectTag !== EffectTag.skip);
}
function defaultPredicate() {
    return true;
}
/**
 * Returns the next fiber to be processed by the unit of work.
 * If skipFn is provided, it will skip subtrees that don't pass the predicate.
 * @param currFiber - Current fiber that work was done on.
 * @param root - Top fiber to return to.
 * @param skipFn - Predicate to skip subtrees.
 * @returns Next fiber to perform work on.
 */
function nextFiber(currFiber, root, skipFn = defaultPredicate) {
    // Visit up to the last child first.
    if (currFiber.child && skipFn(currFiber.child)) {
        return currFiber.child;
    }
    let nextFiber = currFiber;
    while (nextFiber && nextFiber !== root) {
        if (nextFiber.sibling && skipFn(nextFiber.sibling)) {
            return nextFiber.sibling; // Exhaust all siblings.
        }
        else if (nextFiber.sibling) {
            nextFiber = nextFiber.sibling; // If didn't pass the filter but exists - skip it.
        }
        else {
            nextFiber = nextFiber.parent; // If doesn't exist go up the tree until we reach the root or undefined.
        }
    }
    return;
}
/**
 * Finds a next fiber in the tree that matches the predicate. Searches the entire tree until found.
 * @param currFiber - Current fiber to start the search from.
 * @param root - Root fiber to stop the search at.
 * @param predicate - Predicate to match.
 * @returns The found fiber or undefined.
 */
function findNextFiber(currFiber, root, predicate) {
    if (!currFiber) {
        return;
    }
    let next = nextFiber(currFiber, root);
    while (next) {
        if (predicate(next)) {
            return next;
        }
        next = nextFiber(next, root);
    }
    return;
}
/**
 * Builds fiber children out of provided elements and reconciles DOM nodes with previous fiber tree.
 * @param wipFiberParent - Parent fiber to build children for.
 * @param elements - Child elements.
 */
function diffChildren(wipFiberParent, elements = []) {
    // Collect all old fibers by key.
    const oldFibersMapByKey = new Map();
    const oldFibers = [];
    let nextOldFiber = wipFiberParent.alternate && wipFiberParent.alternate.child;
    let nextOldFiberIndex = 0;
    while (nextOldFiber) {
        oldFibers.push(nextOldFiber);
        oldFibersMapByKey.set(nextOldFiber?.fromElement.props.key ?? nextOldFiberIndex, nextOldFiber);
        nextOldFiber = nextOldFiber.sibling;
        nextOldFiberIndex++;
    }
    let prevSibling;
    let newElementIndex = 0;
    while (newElementIndex < elements.length) {
        let newFiber;
        const childElement = elements[newElementIndex];
        const oldFiberKey = childElement?.props.key ?? newElementIndex;
        const oldFiber = oldFibersMapByKey.get(oldFiberKey);
        const oldFiberSequential = oldFibers[newElementIndex];
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
                alternate: oldFiberSequential,
                hooks: oldFiber.hooks,
                dom: oldFiberSequential.dom,
                version: oldFiber.version + 1,
                fromElement: childElement,
                child: isSameElement ? oldFiber.child : undefined,
                sibling: isSameElement ? oldFiber.sibling : undefined,
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
        if (newElementIndex === 0) {
            wipFiberParent.child = newFiber;
        }
        else if (prevSibling) {
            prevSibling.sibling = newFiber;
        }
        prevSibling = newFiber;
        // Old fiber is already a child, iterate until we reach last sibling.
        if (oldFiber) {
            oldFibersMapByKey.delete(oldFiberKey);
        }
        newElementIndex++;
    }
    // Delete all orphaned old fibers.
    for (const [, fiber] of oldFibersMapByKey) {
        fiber.alternate = undefined;
        fiber.isAlternate = true;
        fiber.effectTag = EffectTag.delete;
        deletions.push(fiber);
    }
}
