import { propsCompareFnSymbol } from './jsx.js';
import REAL_DOM from './dom.js';
import { processHooks, collectEffectCleanups } from './hooks.js';
import { schedule } from './scheduler.js';
import { EMPTY_ARR } from './constants.js';
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
let afterCommitCbs = [];
let DOM = REAL_DOM;
const defaultShallowEqual = (_prevProps, _nextProps) => {
    return false;
};
function getNewFiber() {
    const props = { key: null, children: EMPTY_ARR };
    const fiber = {
        parent: null,
        child: null,
        sibling: null,
        type: '',
        props,
        effectTag: EffectTag.add,
        old: null,
        isOld: false,
        dom: null,
        stateNode: null,
        didChangePos: false,
        version: 0,
        childElements: EMPTY_ARR,
        fromElement: {
            type: '',
            props,
            children: EMPTY_ARR,
            key: null,
        },
        propsCompareFn: defaultShallowEqual,
    };
    fiber.stateNode = {
        current: fiber,
        hooks: [],
    };
    return fiber;
}
/**
 * Creates app root and kicks off the first render.
 * @param root - The topmost DOM node to attach elements to.
 * @param element - The JSX element to render.
 * @param options - Options for the render.
 */
export function createRoot(root, element, fakeDom) {
    if (fakeDom) {
        DOM = fakeDom;
    }
    const fiber = getNewFiber();
    fiber.type = APP_ROOT;
    fiber.dom = root;
    fiber.props = { key: null, children: [element] };
    fiber.fromElement = {
        type: 'div',
        props: fiber.props,
        children: [element],
        key: null,
    };
    wipRoot = fiber;
    nextUnitOfWork = fiber;
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
function nonSkippedAndNotPositionChanged(f) {
    return f.didChangePos || f.effectTag !== EffectTag.skip;
}
/**
 * Commits changes to the DOM after a render cycle has completed.
 */
function commitRoot() {
    // Process deletes first.
    for (const fiberToDelete of deletions) {
        deleteFiber(fiberToDelete);
    }
    deletions = [];
    if (wipRoot) {
        let nextFiberToCommit = wipRoot;
        while (nextFiberToCommit) {
            commitFiber(nextFiberToCommit);
            nextFiberToCommit = nextFiber(nextFiberToCommit, wipRoot, nonSkippedAndNotPositionChanged, nextFiberToCommit.effectTag === EffectTag.skip);
        }
        for (let i = afterCommitCbs.length - 1; i >= 0; i--) {
            afterCommitCbs[i]();
        }
        afterCommitCbs.splice(0);
        if (wipRoot.type === APP_ROOT) {
            // first mount
            currentRoot = wipRoot;
        }
        else {
            // component re-renders, attaching fiber to existing root
            const originalFiber = wipRoot.old;
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
    wipRoot = null;
    // Running effects in the reverse order. Leaf fibers run their effects first.
    // @TODO: run this async
    for (let i = effectCleanupsToRun.length - 1; i >= 0; i--) {
        effectCleanupsToRun[i]();
    }
    effectCleanupsToRun.splice(0);
    for (let i = effectsToRun.length - 1; i >= 0; i--) {
        effectsToRun[i]();
    }
    effectsToRun.splice(0);
}
function fiberWithDom(f) {
    return !!f.dom;
}
function fiberComponent(f) {
    return typeof f.type !== 'string';
}
function deleteFiber(fiber) {
    // Find the closest child and remove it from the dom.
    const closestChildDOM = fiber.dom ?? findNextFiber(fiber, fiber, fiberWithDom)?.dom;
    if (closestChildDOM && closestChildDOM.parentNode) {
        DOM.removeChild(closestChildDOM.parentNode, closestChildDOM);
    }
    // Collect all of the useEffect cleanup functions to run after delete.
    let nextComponentChildFiber = fiber;
    while (nextComponentChildFiber) {
        if (nextComponentChildFiber.stateNode.hooks.length) {
            const cleanupFuncs = collectEffectCleanups(nextComponentChildFiber.stateNode.hooks);
            if (cleanupFuncs) {
                effectCleanupsToRun.push(...cleanupFuncs.reverse());
            }
        }
        nextComponentChildFiber = findNextFiber(nextComponentChildFiber, fiber, fiberComponent);
    }
    fiber.effectTag = EffectTag.delete;
    fiber.isOld = true;
    fiber.old = null;
    fiber.child = null;
    fiber.sibling = null;
    fiber.parent = null;
    fiber.dom = null;
    fiber.stateNode = null;
    fiber.childElements = EMPTY_ARR;
}
/**
 * Commits a single fiber by attaching its DOM nodes to parent's and adding new props.
 * New subtrees are mounted at once.
 * Removes nodes marked to be deleted.
 * @param fiber - Fiber to commit.
 */
function commitFiber(fiber) {
    // if (fiber.didChangePos || fiber.effectTag === EffectTag.add) {
    if (fiber.didChangePos) {
        // Find closest parent that's not a component.
        const closestChildDom = fiber.dom ?? findNextFiber(fiber, fiber, fiberWithDom)?.dom;
        const closestNextSiblingDom = fiber.sibling
            ? fiber.sibling?.dom ?? findNextFiber(fiber.sibling, fiber, fiberWithDom)?.dom ?? null
            : null;
        if (closestChildDom) {
            afterCommitCbs.push(() => {
                if (closestChildDom.nextSibling !== closestNextSiblingDom) {
                    DOM.insertBefore(closestChildDom.parentNode, closestChildDom, closestNextSiblingDom);
                }
            });
        }
    }
    if (!(fiber.dom && fiber.parent) || fiber.effectTag === EffectTag.skip) {
        return;
    }
    // Find closest parent that's not a component.
    let parentWithDom = fiber.parent;
    while (!parentWithDom.dom) {
        parentWithDom = parentWithDom.parent;
    }
    if (fiber.effectTag === EffectTag.update) {
        DOM.addProps(fiber, fiber.dom, fiber.props, fiber.old?.props || null);
    }
    if (fiber.effectTag === EffectTag.add) {
        const parent = parentWithDom.dom;
        const child = fiber.dom;
        DOM.appendChild(parent, child);
    }
    return;
}
/**
 * Picks the next component to render from the render queue.
 * @returns The next component to render.
 */
function pickNextComponentToRender() {
    if (!componentRenderQueue.length) {
        return null;
    }
    const componentFiber = componentRenderQueue.shift();
    // If the component already re-rendered since it was queued we can skip the update.
    if (componentFiber.isOld) {
        return pickNextComponentToRender();
    }
    const newFiber = getNewFiber();
    newFiber.type = componentFiber.type;
    newFiber.parent = componentFiber.parent;
    newFiber.child = componentFiber.child;
    newFiber.sibling = componentFiber.sibling;
    newFiber.old = componentFiber;
    newFiber.isOld = false;
    newFiber.dom = componentFiber.dom;
    const stateNode = componentFiber.stateNode;
    newFiber.stateNode = stateNode;
    stateNode.current = newFiber;
    newFiber.effectTag = EffectTag.update;
    newFiber.didChangePos = false;
    newFiber.props = componentFiber.props;
    newFiber.version = componentFiber.version + 1;
    newFiber.childElements = componentFiber.childElements;
    newFiber.fromElement = componentFiber.fromElement;
    newFiber.propsCompareFn = componentFiber.propsCompareFn;
    // Do this after commit?
    componentFiber.old = null;
    componentFiber.isOld = true;
    return newFiber;
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
    if (propsCompareFnSymbol in fiber.type && fiber.type[propsCompareFnSymbol]) {
        fiber.propsCompareFn = fiber.type[propsCompareFnSymbol];
    }
    let componentEffects;
    let componentEffectCleanups;
    // Make sure notifyOnStateChange does not have to close over entire node.
    const stateNode = fiber.stateNode;
    processHooks(stateNode.hooks, function notifyOnStateChange() {
        addToComponentRenderQueue(stateNode.current);
    }, function scheduleEffect(effect, cleanup) {
        (componentEffects ?? (componentEffects = [])).push(effect);
        if (cleanup) {
            (componentEffectCleanups ?? (componentEffectCleanups = [])).push(cleanup);
        }
    });
    const element = fiber.type(fiber.props);
    fiber.childElements = [element];
    // Leaf fibers run their effects first in the order they were inside of the component.
    // We maintain a single global array of all effects and by the end of the commit phase
    // we will execute all effects one-by-one starting from the end of that array. Because
    // we still need want to preserve the call order we need to reverse the effects here
    // ahead of time.
    if (componentEffects) {
        effectsToRun.push(...componentEffects.reverse());
    }
    if (componentEffectCleanups) {
        effectCleanupsToRun.push(...componentEffectCleanups.reverse());
    }
}
/**
 * Processes dom fiber node before diffing children.
 * @param fiber - The dom fiber to process.
 */
function processDomFiber(fiber) {
    if (!fiber.dom) {
        fiber.dom = DOM.createNode(fiber.type);
        DOM.addProps(fiber, fiber.dom, fiber.props, null);
    }
    fiber.childElements = fiber.fromElement.children ?? EMPTY_ARR;
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
    return nextFiber(fiber, wipRoot, nonSkipped);
}
function nonSkipped(f) {
    return f.effectTag !== EffectTag.skip;
}
function defaultPredicate() {
    return true;
}
/**
 * Returns the next fiber to be processed by the unit of work.
 * If skipFn is provided, it will skip subtrees that don't pass the predicate.
 * @param currFiber - Current fiber that work was done on.
 * @param root - Top fiber to return to.
 * @param continueFn - Function to filter the current node. If "false" is returned the current node is skipped.
 * @returns Next fiber to perform work on.
 */
function nextFiber(currFiber, root, continueFn = defaultPredicate, skipChild = false) {
    // 1. Check child first if allowed
    if (!skipChild && currFiber.child && continueFn(currFiber.child)) {
        return currFiber.child;
    }
    let current = skipChild ? currFiber : currFiber.child ?? currFiber;
    // 2. Traverse up ancestors
    while (current && current !== root) {
        // 3. Check all siblings in a single pass
        let sibling = current.sibling;
        while (sibling) {
            if (continueFn(sibling)) {
                return sibling;
            }
            sibling = sibling.sibling;
        }
        // 4. Move to parent if no valid siblings
        current = current.parent;
    }
    return null;
}
function nextFiber2(currFiber, root) {
    let current = currFiber;
    if (current.child) {
        return current.child;
    }
    while (current && current !== root) {
        let sibling = current.sibling;
        if (sibling) {
            return sibling;
        }
        current = current.parent;
    }
    return null;
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
        return null;
    }
    let next = nextFiber2(currFiber, root);
    while (next) {
        if (predicate(next)) {
            return next;
        }
        next = nextFiber2(next, root);
    }
    return null;
}
function diffChildren(wipFiberParent, elements) {
    // If fiber is a dom fiber and was previously committed and currently has no child elements
    // but previous fiber had elements we can bail out of doing a full diff, instead just recreate
    // the current wip fiber.
    if (!elements.length &&
        !!wipFiberParent.dom &&
        !!wipFiberParent.parent &&
        !!wipFiberParent.old &&
        !!wipFiberParent.old.child) {
        const old = wipFiberParent.old;
        deletions.push(old);
        wipFiberParent.old = null;
        wipFiberParent.effectTag = EffectTag.add;
        wipFiberParent.childElements = EMPTY_ARR;
        wipFiberParent.child = null;
        wipFiberParent.dom = DOM.createNode(wipFiberParent.type);
        DOM.addProps(wipFiberParent, wipFiberParent.dom, wipFiberParent.props, null);
        return;
    }
    let oldFiber = wipFiberParent.old?.child ?? null;
    let prevNewFiber = null;
    let index = 0;
    const existingOldFibers = new Map();
    let currentOldFiber = oldFiber;
    let oldIdx = 0;
    // let oldIdxSkewed = 0;
    const newElementKeys = new Set();
    for (let i = 0; i < elements.length; i++) {
        const key = elements[i].key ?? i;
        newElementKeys.add(key);
    }
    // Map old fibers by key with their original indices
    while (currentOldFiber) {
        const key = currentOldFiber.fromElement.key ?? oldIdx;
        // if (newElementKeys.has(key)) {
        existingOldFibers.set(key, {
            fiber: currentOldFiber,
            idx: oldIdx,
        });
        // }
        currentOldFiber = currentOldFiber.sibling;
        oldIdx++;
    }
    // let lastPlacedIndex = 0;
    for (let newIdx = 0; newIdx < elements.length; newIdx++) {
        const childElement = elements[newIdx];
        const key = childElement.key ?? newIdx;
        const existing = existingOldFibers.get(key);
        let newFiber = null;
        if (existing) {
            const { fiber: oldFiber, idx: oldListIdx } = existing;
            existingOldFibers.delete(key);
            if (oldFiber.type === childElement.type) {
                newFiber = reuseFiber(childElement, wipFiberParent, oldFiber);
                newFiber.didChangePos = newIdx !== oldListIdx;
                const shouldSkip = oldFiber.fromElement === childElement ||
                    (typeof childElement.type !== 'string' &&
                        newFiber.propsCompareFn?.(oldFiber.props, childElement.props));
                if (shouldSkip) {
                    // Rewire old child fibers to the new parent
                    newFiber.effectTag = EffectTag.skip;
                    newFiber.child = oldFiber.child;
                    let sibling = oldFiber.child;
                    while (sibling) {
                        sibling.parent = newFiber;
                        sibling = sibling.sibling;
                    }
                }
                oldFiber.old = null;
                oldFiber.isOld = true;
                oldFiber.sibling = null;
                oldFiber.parent = null;
            }
            else {
                // Type mismatch - delete old, create new
                deletions.push(oldFiber);
                newFiber = addNewFiber(childElement, wipFiberParent);
            }
        }
        else {
            // New fiber
            newFiber = addNewFiber(childElement, wipFiberParent);
            // skew++;
        }
        if (newFiber) {
            if (index === 0)
                wipFiberParent.child = newFiber;
            else
                prevNewFiber.sibling = newFiber;
            prevNewFiber = newFiber;
            index++;
        }
    }
    // Mark remaining old fibers for deletion
    existingOldFibers.forEach(({ fiber }) => deletions.push(fiber));
}
function addNewFiber(element, parent) {
    const newFiber = getNewFiber();
    newFiber.type = element.type;
    newFiber.parent = parent;
    newFiber.props = element.props;
    newFiber.fromElement = element;
    newFiber.effectTag = EffectTag.add;
    if (typeof element.type === 'string') {
        newFiber.propsCompareFn = defaultShallowEqual;
    }
    return newFiber;
}
function reuseFiber(element, parent, oldFiber) {
    const newFiber = getNewFiber();
    newFiber.type = element.type;
    newFiber.parent = parent;
    newFiber.old = oldFiber;
    newFiber.dom = oldFiber.dom;
    newFiber.effectTag = EffectTag.update;
    newFiber.props = element.props;
    newFiber.version = oldFiber.version + 1;
    newFiber.fromElement = element;
    newFiber.propsCompareFn = oldFiber.propsCompareFn;
    const stateNode = oldFiber.stateNode;
    stateNode.current = newFiber;
    newFiber.stateNode = stateNode;
    return newFiber;
}
