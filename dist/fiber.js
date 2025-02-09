import { propsCompareFnSymbol } from './jsx.js';
import REAL_DOM from './dom.js';
import { processHooks, collectEffectCleanups } from './hooks.js';
import { schedule } from './scheduler.js';
import { EMPTY_ARR, EMPTY_OBJ } from './constants.js';
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
let DOM = REAL_DOM;
function getNewFiber() {
    return {
        type: '',
        parent: undefined,
        child: undefined,
        sibling: undefined,
        alternate: undefined,
        isOld: false,
        dom: undefined,
        hooks: [],
        effectTag: EffectTag.add,
        didChangePos: false,
        props: EMPTY_OBJ,
        version: 0,
        childElements: EMPTY_ARR,
        fromElement: { type: '', props: EMPTY_OBJ, key: undefined },
        propsCompareFn: defaultPropsCompareFn,
    };
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
    fiber.props = { children: [element] };
    fiber.fromElement = element;
    wipRoot = fiber;
    nextUnitOfWork = fiber;
    schedule(workloop);
}
/**
 * Schedules a component to be re-rendered.
 * @param fiber - The component element to re-render.
 */
function addToComponentRenderQueue(fiber) {
    if (fiber.isOld && !fiber.alternate) {
        throw new Error('Old fiber to render does not have alternate');
    }
    const fiberToQueue = fiber.isOld && fiber.alternate ? fiber.alternate : fiber;
    if (!componentRenderQueue.includes(fiberToQueue)) {
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
        deleteFiber(fiberToDelete);
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
            nextFiberToCommit = nextFiber(nextFiberToCommit, wipRoot, (f) => f.effectTag !== EffectTag.skip ||
                (f.effectTag === EffectTag.skip && f.didChangePos));
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
function deleteFiber(fiber) {
    // Find the closest child and remove it from the dom.
    const closestChildDOM = fiber.dom ?? findNextFiber(fiber, fiber, (f) => !!f.dom)?.dom;
    if (closestChildDOM && closestChildDOM.parentNode) {
        DOM.removeChild(closestChildDOM.parentNode, closestChildDOM);
    }
    // Collect all of the useEffect cleanup functions to run after delete.
    let nextComponentChildFiber = fiber;
    while (nextComponentChildFiber) {
        if (nextComponentChildFiber.hooks.length) {
            const cleanupFuncs = collectEffectCleanups(nextComponentChildFiber.hooks);
            if (cleanupFuncs) {
                effectCleanupsToRun.push(...cleanupFuncs.reverse());
            }
        }
        nextComponentChildFiber = findNextFiber(nextComponentChildFiber, fiber, (f) => typeof f.type !== 'string');
    }
}
/**
 * Commits a single fiber by attaching its DOM nodes to parent's and adding new props.
 * New subtrees are mounted at once.
 * Removes nodes marked to be deleted.
 * @param fiber - Fiber to commit.
 */
function commitFiber(fiber) {
    let afterCommit;
    if (fiber.didChangePos) {
        // Find closest parent that's not a component.
        let parentWithDom = fiber.parent;
        while (!parentWithDom?.dom) {
            parentWithDom = parentWithDom?.parent;
        }
        const parentDom = parentWithDom.dom;
        const closestChildDom = fiber.dom ?? findNextFiber(fiber, fiber, (f) => !!f.dom)?.dom;
        const closestNextSiblingDom = fiber.sibling
            ? fiber.sibling?.dom ?? findNextFiber(fiber.sibling, fiber, (f) => !!f.dom)?.dom ?? null
            : null;
        if (closestChildDom && parentDom) {
            afterCommit = () => {
                DOM.insertBefore(parentDom, closestChildDom, closestNextSiblingDom);
                fiber.didChangePos = false;
            };
        }
    }
    if (!(fiber.dom && fiber.parent) || fiber.effectTag === EffectTag.skip) {
        return afterCommit;
    }
    // Find closest parent that's not a component.
    let parentWithDom = fiber.parent;
    while (!parentWithDom.dom) {
        parentWithDom = parentWithDom.parent;
    }
    if (fiber.effectTag === EffectTag.update) {
        DOM.addProps(fiber.dom, fiber.props, fiber.alternate?.props);
    }
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
    if (componentFiber.isOld) {
        return pickNextComponentToRender();
    }
    const newFiber = getNewFiber();
    newFiber.type = componentFiber.type;
    newFiber.parent = componentFiber.parent;
    newFiber.child = componentFiber.child;
    newFiber.sibling = componentFiber.sibling;
    newFiber.alternate = componentFiber;
    newFiber.isOld = false;
    newFiber.dom = componentFiber.dom;
    newFiber.hooks = componentFiber.hooks;
    newFiber.effectTag = EffectTag.update;
    newFiber.didChangePos = false;
    newFiber.props = componentFiber.props;
    newFiber.version = componentFiber.version + 1;
    newFiber.childElements = componentFiber.childElements;
    newFiber.fromElement = componentFiber.fromElement;
    componentFiber.alternate = newFiber;
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
    if (!fiber.hooks) {
        fiber.hooks = [];
    }
    if (propsCompareFnSymbol in fiber.type &&
        fiber.type[propsCompareFnSymbol] &&
        fiber.propsCompareFn !== fiber.type[propsCompareFnSymbol]) {
        fiber.propsCompareFn = fiber.type[propsCompareFnSymbol];
    }
    let componentEffects;
    let componentEffectCleanups;
    processHooks(fiber.hooks, function notifyOnStateChange() {
        addToComponentRenderQueue(fiber);
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
        DOM.addProps(fiber.dom, fiber.props);
    }
    fiber.childElements = fiber.props.children ?? EMPTY_ARR;
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
    diffChildren(fiber);
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
    let nextFiber = currFiber.child ?? currFiber;
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
export function defaultPropsCompareFn(prevProps, nextProps) {
    if (prevProps === nextProps)
        return true;
    const prevKeys = Object.keys(prevProps);
    const nextKeys = Object.keys(nextProps);
    if (prevKeys.length !== nextKeys.length)
        return false;
    for (let i = 0; i < prevKeys.length; i++) {
        const key = prevKeys[i];
        if (prevProps[key] !== nextProps[key])
            return false;
    }
    return true;
}
/**
 * Builds fiber children out of provided elements and reconciles DOM nodes with previous fiber tree.
 * @param wipFiberParent - Parent fiber to build children for.
 * @param elements - Child elements.
 */
function diffChildren(wipFiberParent) {
    const elements = wipFiberParent.childElements;
    // If fiber is a dom fiber and was previously committed and currently has no child elements
    // but previous fiber had elements we can bail out of doing a full diff, instead just recreate
    // the current wip fiber.
    if (!elements.length &&
        !!wipFiberParent.dom &&
        !!wipFiberParent.parent &&
        !!wipFiberParent.alternate &&
        !!wipFiberParent.alternate.child) {
        wipFiberParent.effectTag = EffectTag.add;
        wipFiberParent.childElements = EMPTY_ARR;
        wipFiberParent.child = undefined;
        wipFiberParent.alternate.effectTag = EffectTag.delete;
        wipFiberParent.alternate.isOld = true;
        wipFiberParent.alternate.alternate = wipFiberParent;
        wipFiberParent.dom = DOM.createNode(wipFiberParent.type);
        DOM.addProps(wipFiberParent.dom, wipFiberParent.props);
        deletions.push(wipFiberParent.alternate);
        return;
    }
    // Collect all old fibers by key.
    const oldFibersMapByKey = new Map();
    const oldFibers = [];
    let nextOldFiber = wipFiberParent.alternate && wipFiberParent.alternate.child;
    let nextOldFiberIndex = 0;
    while (nextOldFiber) {
        oldFibers.push(nextOldFiber);
        oldFibersMapByKey.set(nextOldFiber?.fromElement.key ?? nextOldFiberIndex, nextOldFiber);
        nextOldFiber = nextOldFiber.sibling;
        nextOldFiberIndex++;
    }
    let prevSibling;
    let newElementIndex = 0;
    while (newElementIndex < elements.length) {
        let newFiber;
        const childElement = elements[newElementIndex];
        const oldFiberKey = childElement?.key ?? newElementIndex;
        const oldFiberByKey = oldFibersMapByKey.get(oldFiberKey);
        const oldFiberSeq = oldFibers[newElementIndex];
        const isSameTypeByKey = oldFiberByKey?.type === childElement?.type;
        const isSameElementByKey = oldFiberByKey?.fromElement === childElement;
        // Same node, update props.
        if (oldFiberByKey && childElement && isSameTypeByKey) {
            // TODO: This is mutating an existing fiber in current tree,
            // need to figure out how to handle this better.
            // This is the case because of the closure created in processComponentFiber
            // Will be fixed after that's refactored.
            const shouldSkip = isSameElementByKey ||
                (oldFiberByKey.type !== 'string' &&
                    oldFiberByKey.propsCompareFn(oldFiberByKey.props, childElement.props));
            newFiber = getNewFiber();
            newFiber.type = childElement.type;
            newFiber.parent = wipFiberParent;
            newFiber.alternate = oldFiberByKey;
            newFiber.dom = oldFiberByKey.dom;
            newFiber.hooks = oldFiberByKey.hooks;
            newFiber.effectTag = shouldSkip ? EffectTag.skip : EffectTag.update;
            newFiber.didChangePos = oldFiberSeq !== oldFiberByKey;
            newFiber.props = childElement.props;
            newFiber.version = oldFiberByKey.version + 1;
            newFiber.fromElement = childElement;
            newFiber.propsCompareFn = oldFiberByKey.propsCompareFn;
        }
        // Brand new node.
        if (!isSameTypeByKey && childElement) {
            newFiber = getNewFiber();
            newFiber.type = childElement.type;
            newFiber.parent = wipFiberParent;
            newFiber.props = childElement.props;
            newFiber.version = 0;
            newFiber.fromElement = childElement;
        }
        // Delete old node.
        if (oldFiberByKey && !isSameTypeByKey) {
            oldFiberByKey.effectTag = EffectTag.delete;
            deletions.push(oldFiberByKey);
        }
        // Only store 2 levels. Edge case, fibers are reused when elements are memoized.
        if (!!oldFiberByKey && oldFiberByKey !== newFiber) {
            oldFiberByKey.alternate = newFiber;
            oldFiberByKey.isOld = true;
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
        if (oldFiberByKey) {
            oldFibersMapByKey.delete(oldFiberKey);
        }
        newElementIndex++;
    }
    // Delete all orphaned old fibers.
    for (const [, fiber] of oldFibersMapByKey) {
        fiber.alternate = undefined;
        fiber.isOld = true;
        fiber.effectTag = EffectTag.delete;
        deletions.push(fiber);
    }
}
