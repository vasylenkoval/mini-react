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
            if (nextFiberToCommit.effectTag === EffectTag.skip) {
                // CANNOT KEEP TRAVERSING DOWN IF TOP LEVEL WAS SKIPPED.
                nextFiberToCommit = nextFiber(nextFiberToCommit, wipRoot, (f) => f.didChangePos || f.effectTag !== EffectTag.skip, true);
            }
            else {
                nextFiberToCommit = nextFiber(nextFiberToCommit, wipRoot, (f) => f.didChangePos || f.effectTag !== EffectTag.skip);
            }
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
        if (nextComponentChildFiber.stateNode.hooks.length) {
            const cleanupFuncs = collectEffectCleanups(nextComponentChildFiber.stateNode.hooks);
            if (cleanupFuncs) {
                effectCleanupsToRun.push(...cleanupFuncs.reverse());
            }
        }
        nextComponentChildFiber = findNextFiber(nextComponentChildFiber, fiber, (f) => typeof f.type !== 'string');
    }
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
    let afterCommit;
    if (fiber.didChangePos) {
        // Find closest parent that's not a component.
        const closestChildDom = fiber.dom ?? findNextFiber(fiber, fiber, (f) => !!f.dom)?.dom;
        const closestNextSiblingDom = fiber.sibling
            ? fiber.sibling?.dom ?? findNextFiber(fiber.sibling, fiber, (f) => !!f.dom)?.dom ?? null
            : null;
        if (closestChildDom) {
            afterCommit = () => {
                DOM.insertBefore(closestChildDom.parentNode, closestChildDom, closestNextSiblingDom);
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
        DOM.addProps(fiber.dom, fiber.props, fiber.old?.props);
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
        DOM.addProps(fiber.dom, fiber.props);
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
 * @param continueFn - Function to filter the current node. If "false" is returned the current node is skipped.
 * @returns Next fiber to perform work on.
 */
function nextFiber(currFiber, root, continueFn = defaultPredicate, skipChild = false) {
    // Visit up to the last child first.
    if (currFiber.child && continueFn(currFiber.child) && !skipChild) {
        return currFiber.child;
    }
    let nextFiber = skipChild ? currFiber : currFiber.child ?? currFiber;
    while (nextFiber && nextFiber !== root) {
        if (nextFiber.sibling && continueFn(nextFiber.sibling)) {
            return nextFiber.sibling; // Exhaust all siblings.
        }
        else if (nextFiber.sibling) {
            nextFiber = nextFiber.sibling; // If didn't pass the filter but exists - skip it.
        }
        else {
            nextFiber = nextFiber.parent; // If doesn't exist go up the tree until we reach the root or undefined.
        }
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
    let next = nextFiber(currFiber, root);
    while (next) {
        if (predicate(next)) {
            return next;
        }
        next = nextFiber(next, root);
    }
    return null;
}
/**
 * Builds fiber children out of provided elements and reconciles DOM nodes with previous fiber tree.
 * @param wipFiberParent - Parent fiber to build children for.
 * @param elements - Child elements.
 */
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
        old.effectTag = EffectTag.delete;
        old.isOld = true;
        old.old = null;
        deletions.push(old);
        wipFiberParent.old = null;
        wipFiberParent.effectTag = EffectTag.add;
        wipFiberParent.childElements = EMPTY_ARR;
        wipFiberParent.child = null;
        wipFiberParent.dom = DOM.createNode(wipFiberParent.type);
        DOM.addProps(wipFiberParent.dom, wipFiberParent.props);
        return;
    }
    // Collect all old fibers by key.
    const oldFibersMapByKey = new Map();
    let oldFibers = [];
    let nextOldFiber = wipFiberParent.old && wipFiberParent.old.child;
    let nextOldFiberIndex = 0;
    while (nextOldFiber) {
        oldFibers.push(nextOldFiber);
        oldFibersMapByKey.set(nextOldFiber?.fromElement.key ?? nextOldFiberIndex, nextOldFiber);
        nextOldFiber = nextOldFiber.sibling;
        nextOldFiberIndex++;
    }
    // Check if any nodes were removed
    let deletesCount = oldFibers.length - elements.length;
    if (deletesCount > 0) {
        // Find all of the orphaned fibers and remove them by key
        const elementsByKeyMap = new Map();
        for (let newElementIndex = 0; newElementIndex < elements.length; newElementIndex++) {
            const childElement = elements[newElementIndex];
            const key = childElement.key ?? newElementIndex;
            elementsByKeyMap.set(key, childElement);
        }
        let oldFiberIdx = 0;
        for (const [oldFiberKey, oldFiber] of oldFibersMapByKey) {
            const element = elementsByKeyMap.get(oldFiberKey);
            if (!element) {
                oldFiber.old = null;
                oldFiber.isOld = true;
                oldFiber.effectTag = EffectTag.delete;
                deletions.push(oldFiber);
                deletesCount--;
                oldFibersMapByKey.delete(oldFiberKey);
                oldFibers.splice(oldFiberIdx, 1);
                if (deletesCount === 0) {
                    break;
                }
            }
            oldFiberIdx++;
        }
    }
    let prevSibling = null;
    let newElementIndex = 0;
    for (; newElementIndex < elements.length; newElementIndex++) {
        let newFiber = null;
        const childElement = elements[newElementIndex];
        const oldFiberKey = childElement.key ?? newElementIndex;
        const oldFiberByKey = oldFibersMapByKey.get(oldFiberKey);
        const oldFiberSeq = oldFibers[newElementIndex];
        const isSameTypeByKey = oldFiberByKey?.type === childElement?.type;
        const isSameElementByKey = oldFiberByKey?.fromElement === childElement;
        // Same node, update props.
        if (oldFiberByKey && childElement && isSameTypeByKey) {
            newFiber = getNewFiber();
            newFiber.type = childElement.type;
            newFiber.parent = wipFiberParent;
            newFiber.old = oldFiberByKey;
            newFiber.dom = oldFiberByKey.dom;
            const stateNode = oldFiberByKey.stateNode;
            stateNode.current = newFiber;
            newFiber.stateNode = stateNode;
            newFiber.effectTag = EffectTag.update;
            newFiber.didChangePos = oldFiberSeq !== oldFiberByKey;
            newFiber.props = childElement.props;
            newFiber.version = oldFiberByKey.version + 1;
            newFiber.fromElement = childElement;
            const propsCompareFn = oldFiberByKey.propsCompareFn;
            newFiber.propsCompareFn = propsCompareFn;
            const isComponent = oldFiberByKey.type !== 'string';
            const shouldSkip = isSameElementByKey ||
                (isComponent && propsCompareFn(oldFiberByKey.props, childElement.props));
            if (shouldSkip) {
                newFiber.effectTag = EffectTag.skip;
                newFiber.child = oldFiberByKey.child;
                if (newFiber.child) {
                    newFiber.child.parent = newFiber;
                }
            }
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
        // Only store 2 levels of previous fibers. Disconnect siblings.
        if (!!oldFiberByKey) {
            oldFiberByKey.old = null;
            oldFiberByKey.isOld = true;
            oldFiberByKey.sibling = null;
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
    }
    // Delete all orphaned old fibers.
    for (const [, fiber] of oldFibersMapByKey) {
        fiber.old = null;
        fiber.isOld = true;
        fiber.effectTag = EffectTag.delete;
        deletions.push(fiber);
    }
}
