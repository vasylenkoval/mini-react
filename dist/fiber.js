import { propsCompareFnSymbol } from './jsx.js';
import dom from './dom.js';
import { collectEffectCleanups, startHooks, finishHooks } from './hooks.js';
import { schedule } from './scheduler.js';
import { EMPTY_ARR } from './constants.js';
import { Mounted, Moved, MovedEnd, Old, Skipped, renderFlags } from './flags.js';
const ROOT = 'root';
let NextUnitOfWork;
let RenderQueue = [];
let Root;
let WipRoot;
let Deletions = [];
let Effects = [];
let Cleanups = [];
let AfterCommitCallbacks = [];
let Dom = dom;
let DEBUG = false;
function createFiberObj() {
    const props = { key: null, children: EMPTY_ARR };
    const fiber = {
        parent: null,
        child: null,
        sibling: null,
        type: '',
        props,
        old: null,
        flags: 0,
        dom: null,
        stateNode: null,
        children: EMPTY_ARR,
        from: {
            type: '',
            props,
            children: EMPTY_ARR,
            key: null,
        },
        v: 0,
    };
    if (DEBUG) {
        // Add a non-enumerable debug descriptor
        Object.defineProperty(fiber, '_flags', {
            get() {
                return renderFlags(this.flags);
            },
            enumerable: false,
        });
    }
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
export function createRoot(node, element, fakeDom) {
    if (fakeDom) {
        Dom = fakeDom;
    }
    const fiber = createFiberObj();
    fiber.type = ROOT;
    fiber.dom = node;
    fiber.props = { key: null, children: [element] };
    fiber.from = {
        type: ROOT,
        props: fiber.props,
        children: [element],
        key: null,
    };
    Root = fiber;
    WipRoot = fiber;
    NextUnitOfWork = fiber;
    schedule(workloop);
}
/**
 * Schedules a component to be re-rendered.
 * @param fiber - The component fiber to re-render.
 */
function scheduleComponent(stateNode) {
    const fiber = stateNode.current;
    if (!RenderQueue.includes(fiber)) {
        RenderQueue.push(fiber);
        schedule(workloop);
    }
}
function movedOrNonSkipped(f) {
    return !!(f.flags & (Moved | MovedEnd)) || !(f.flags & Skipped);
}
/**
 * Commits changes to the DOM after a render cycle has completed.
 */
function commitRoot() {
    // Process deletes first.
    for (const fiberToDelete of Deletions) {
        deleteFiber(fiberToDelete);
    }
    Deletions.splice(0);
    if (WipRoot) {
        let nextFiberToCommit = WipRoot;
        while (nextFiberToCommit) {
            commitFiber(nextFiberToCommit);
            nextFiberToCommit = nextFiberWithFilter(nextFiberToCommit, WipRoot, movedOrNonSkipped, !!(nextFiberToCommit.flags & Skipped));
        }
        for (let i = AfterCommitCallbacks.length - 1; i >= 0; i--) {
            AfterCommitCallbacks[i]();
        }
        AfterCommitCallbacks.splice(0);
        if (WipRoot !== Root) {
            // Component re-renders, fix-up new fiber to the previous parent
            const oldRoot = WipRoot.old;
            const oldRootParent = oldRoot.parent;
            if (oldRootParent.child === oldRoot) {
                oldRootParent.child = WipRoot;
            }
            else {
                let nextSibling = oldRootParent.child;
                while (nextSibling) {
                    if (nextSibling.sibling === oldRoot) {
                        nextSibling.sibling = WipRoot;
                        break;
                    }
                    nextSibling = nextSibling.sibling;
                }
            }
        }
    }
    WipRoot = null;
    // Running effects in the reverse order. Leaf fibers run their effects first.
    // @TODO: run this async
    for (let i = Cleanups.length - 1; i >= 0; i--) {
        Cleanups[i]();
    }
    Cleanups.splice(0);
    for (let i = Effects.length - 1; i >= 0; i--) {
        Effects[i]();
    }
    Effects.splice(0);
}
function fiberWithDom(f) {
    return !!f.dom;
}
function fiberComponent(f) {
    return typeof f.type !== 'string';
}
function deleteFiber(fiber) {
    // Find the closest child and remove it from the dom.
    const closestChildDom = fiber.dom ?? findNextFiber(fiber, fiber, fiberWithDom)?.dom;
    if (closestChildDom && closestChildDom.parentNode) {
        Dom.removeChild(closestChildDom.parentNode, closestChildDom);
    }
    // Collect all of the useEffect cleanup functions to run after delete.
    let nextComponentChildFiber = fiber;
    while (nextComponentChildFiber) {
        if (nextComponentChildFiber.stateNode.hooks.length) {
            const cleanupFuncs = collectEffectCleanups(nextComponentChildFiber.stateNode.hooks);
            if (cleanupFuncs) {
                Cleanups.push(...cleanupFuncs.reverse());
            }
        }
        nextComponentChildFiber = nextFiberWithFilter(nextComponentChildFiber, fiber, fiberComponent);
    }
    // fiber.isOld = true;
    fiber.old = null;
    fiber.child = null;
    fiber.sibling = null;
    fiber.parent = null;
    fiber.dom = null;
    fiber.stateNode = null;
    fiber.children = EMPTY_ARR;
}
/**
 * Commits a single fiber by attaching its DOM nodes to parent's and adding new props.
 * New subtrees are mounted at once.
 * Removes nodes marked to be deleted.
 * @param fiber - Fiber to commit.
 */
function commitFiber(fiber) {
    if (fiber.flags & (Moved | MovedEnd)) {
        // Find closest parent that's not a component.
        const closestChildDom = fiber.dom ?? findNextFiber(fiber, fiber, fiberWithDom)?.dom;
        if (closestChildDom) {
            AfterCommitCallbacks.push(function placeMovedNode() {
                // Implement moveEnd, remove callbacks. Do what react does here.
                const closestNextSiblingDom = fiber.sibling
                    ? fiber.sibling?.dom ??
                        findNextFiber(fiber.sibling, fiber, fiberWithDom)?.dom ??
                        null
                    : null;
                if (closestChildDom.nextSibling != closestNextSiblingDom) {
                    Dom.insertBefore(closestChildDom.parentNode, closestChildDom, closestNextSiblingDom);
                }
            });
        }
    }
    if (!(fiber.dom && fiber.parent) || fiber.flags & Skipped) {
        return;
    }
    Dom.addProps(fiber, fiber.dom, fiber.props, fiber.old?.props || null);
    if (fiber.flags & Mounted) {
        // Find closest parent that's not a component.
        let parentWithDom = fiber.parent;
        while (!parentWithDom.dom) {
            parentWithDom = parentWithDom.parent;
        }
        const parent = parentWithDom.dom;
        const child = fiber.dom;
        Dom.appendChild(parent, child);
    }
    return;
}
/**
 * Picks the next component to render from the render queue.
 * @returns The next component to render.
 */
function pickNextComponentToRender() {
    if (!RenderQueue.length) {
        return null;
    }
    const componentFiber = RenderQueue.shift();
    // If the component already re-rendered since it was queued we can skip the update.
    // if (componentFiber.isOld) {
    if (componentFiber.flags & Old) {
        return pickNextComponentToRender();
    }
    const newFiber = createFiberObj();
    newFiber.type = componentFiber.type;
    newFiber.parent = componentFiber.parent;
    newFiber.child = componentFiber.child;
    newFiber.sibling = componentFiber.sibling;
    newFiber.old = componentFiber;
    newFiber.dom = componentFiber.dom;
    newFiber.props = componentFiber.props;
    newFiber.v = componentFiber.v + 1;
    newFiber.children = componentFiber.children;
    newFiber.from = componentFiber.from;
    newFiber.stateNode = componentFiber.stateNode;
    newFiber.stateNode.current = newFiber;
    // Do this after commit?
    componentFiber.old = null;
    // componentFiber.isOld = true;
    componentFiber.flags |= Old;
    return newFiber;
}
/**
 * The main work loop. Picks up items from the render queue.
 * @param timeRemaining - Function that returns the remaining time this loop has to run.
 */
function workloop(remainingMs) {
    let shouldWait = false;
    while (NextUnitOfWork && !shouldWait) {
        NextUnitOfWork = performUnitOfWork(NextUnitOfWork);
        shouldWait = remainingMs() < 1;
    }
    if (!NextUnitOfWork && WipRoot) {
        commitRoot();
    }
    const nextComponent = pickNextComponentToRender();
    if (nextComponent) {
        WipRoot = nextComponent;
        NextUnitOfWork = WipRoot;
        schedule(workloop);
        return;
    }
    if (WipRoot) {
        schedule(workloop);
    }
}
/**
 * Runs the component function, processes hooks and schedules effects.
 * @param fiber - The component fiber to process.
 */
function processComponentFiber(fiber) {
    const stateNode = fiber.stateNode;
    const runHooks = fiber.v === 0 || stateNode.hooks.length > 0;
    if (!runHooks) {
        fiber.children = [fiber.type(fiber.props)];
        return;
    }
    startHooks(stateNode.hooks, stateNode, scheduleComponent);
    fiber.children = [fiber.type(fiber.props)];
    finishHooks(stateNode.hooks, Effects, Cleanups);
}
/**
 * Processes dom fiber node before diffing children.
 * @param fiber - The dom fiber to process.
 */
function processDomFiber(fiber) {
    if (!fiber.dom) {
        fiber.dom = Dom.createNode(fiber.type);
        // Dom.addProps(fiber, fiber.dom, fiber.props, null);
    }
    fiber.children = fiber.from.children ?? EMPTY_ARR;
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
    if (fiber.flags & Mounted) {
        reconcileChildrenOnMount(fiber, fiber.children);
    }
    else {
        if (fiber.children.length === 1) {
            reconcileSingleChildOnUpdate(fiber, fiber.children[0]);
        }
        else {
            reconcileChildrenOnUpdate(fiber, fiber.children);
        }
    }
    return nextFiberWithFilter(fiber, WipRoot, nonSkipped);
}
function nonSkipped(f) {
    // return f.effectTag !== EffectTag.skip;
    return !(f.flags & Skipped);
}
function nextFiberWithFilter(currFiber, root, shouldVisit, skipChild = false) {
    if (!skipChild && currFiber.child && shouldVisit(currFiber.child)) {
        return currFiber.child;
    }
    let next = skipChild ? currFiber : currFiber.child ?? currFiber;
    while (next && next !== root) {
        // Check all siblings in a single pass
        let sibling = next.sibling;
        while (sibling) {
            if (shouldVisit(sibling)) {
                return sibling;
            }
            sibling = sibling.sibling;
        }
        next = next.parent;
    }
    return null;
}
function nextFiber(currFiber, root) {
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
// TODO: Refactor to have named loops with jumps, basically inline nextFiber from above
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
function reconcileChildrenOnMount(wipFiberParent, elements) {
    let prevNewFiber = null;
    for (let newIdx = 0; newIdx < elements.length; newIdx++) {
        const element = elements[newIdx];
        const newFiber = createFiber(element, wipFiberParent);
        if (newIdx === 0) {
            wipFiberParent.child = newFiber;
        }
        else {
            prevNewFiber.sibling = newFiber;
        }
        prevNewFiber = newFiber;
    }
}
function reconcileSingleChildOnUpdate(wipFiberParent, element) {
    const oldFiber = wipFiberParent?.old?.child;
    if (!oldFiber || oldFiber.from.key !== element.key) {
        wipFiberParent.child = createFiber(element, wipFiberParent);
    }
    else if (oldFiber) {
        wipFiberParent.child = reuseFiber(element, wipFiberParent, oldFiber);
        // Delete the rest
        let nextSibling = oldFiber.sibling;
        while (nextSibling) {
            Deletions.push(nextSibling);
            nextSibling = nextSibling.sibling;
        }
    }
}
function reconcileChildrenOnUpdate(wipFiberParent, elements) {
    // If fiber is a dom fiber and was previously committed and currently has no child elements
    // but previous fiber had elements we can bail out of doing a full diff, instead just recreate
    // the current wip fiber.
    if (!elements.length &&
        !!wipFiberParent.dom &&
        !!wipFiberParent.parent &&
        !!wipFiberParent.old &&
        !!wipFiberParent.old.child) {
        const old = wipFiberParent.old;
        Deletions.push(old);
        wipFiberParent.old = null;
        wipFiberParent.flags |= Mounted;
        wipFiberParent.children = EMPTY_ARR;
        wipFiberParent.child = null;
        wipFiberParent.dom = Dom.createNode(wipFiberParent.type);
        // Move to commit
        // Dom.addProps(wipFiberParent, wipFiberParent.dom, wipFiberParent.props, null);
        return;
    }
    let oldFiber = wipFiberParent.old?.child ?? null;
    let prevNewFiber = null;
    const existingOldFibersMap = new Map();
    let currentOldFiber = oldFiber;
    let oldIdx = 0;
    // Map old fibers by key with their original indices
    while (currentOldFiber) {
        const key = currentOldFiber.from.key ?? oldIdx;
        existingOldFibersMap.set(key, {
            fiber: currentOldFiber,
            oldListIdx: oldIdx,
        });
        currentOldFiber = currentOldFiber.sibling;
        oldIdx++;
    }
    const reusedFibers = [];
    const reusedFibersOldIndices = [];
    for (let newIdx = 0; newIdx < elements.length; newIdx++) {
        const element = elements[newIdx];
        const key = element.key ?? newIdx;
        const existing = existingOldFibersMap.get(key);
        let newFiber = null;
        if (existing) {
            // Exist in the old list
            const { fiber: oldFiber, oldListIdx } = existing;
            existingOldFibersMap.delete(key);
            if (oldFiber.type === element.type) {
                // Reuse fiber
                newFiber = reuseFiber(element, wipFiberParent, oldFiber);
                reusedFibers.push(newFiber);
                reusedFibersOldIndices.push(oldListIdx);
                const shouldSkip = oldFiber.from === element ||
                    (typeof element.type !== 'string' &&
                        newFiber.type?.[propsCompareFnSymbol]?.(oldFiber.props, element.props));
                if (shouldSkip) {
                    // Rewire old child fibers to the new parent
                    // newFiber.effectTag = EffectTag.skip;
                    // TODO: collapse into 1
                    newFiber.flags |= Skipped;
                    newFiber.child = oldFiber.child;
                    let sibling = oldFiber.child;
                    while (sibling) {
                        sibling.parent = newFiber;
                        sibling = sibling.sibling;
                    }
                }
                oldFiber.sibling = null;
                oldFiber.parent = null;
            }
            else {
                // Type mismatch - delete old, create new
                Deletions.push(oldFiber);
                newFiber = createFiber(element, wipFiberParent);
                newFiber.flags |= newIdx > oldIdx ? MovedEnd : Moved;
            }
        }
        else {
            // Completely new fiber
            newFiber = createFiber(element, wipFiberParent);
            newFiber.flags |= newIdx > oldIdx ? MovedEnd : Moved;
        }
        if (newFiber) {
            if (newIdx === 0)
                wipFiberParent.child = newFiber;
            else
                prevNewFiber.sibling = newFiber;
            prevNewFiber = newFiber;
        }
    }
    existingOldFibersMap.forEach((entry) => {
        Deletions.push(entry.fiber);
    });
    if (reusedFibersOldIndices.length) {
        // Derive what new fibers need to be moved.
        const indicesToPlace = findNonLISIndices(reusedFibersOldIndices);
        for (let i = 0; i < indicesToPlace.length; i++) {
            reusedFibers[indicesToPlace[i]].flags |= Moved;
        }
    }
}
function createFiber(element, parent) {
    const newFiber = createFiberObj();
    newFiber.type = element.type;
    newFiber.parent = parent;
    newFiber.props = element.props;
    newFiber.from = element;
    newFiber.flags |= Mounted;
    return newFiber;
}
function reuseFiber(element, parent, oldFiber) {
    const newFiber = createFiberObj();
    newFiber.type = element.type;
    newFiber.parent = parent;
    newFiber.old = oldFiber;
    newFiber.dom = oldFiber.dom;
    oldFiber.flags |= Old;
    newFiber.props = element.props;
    newFiber.v = oldFiber.v + 1;
    newFiber.from = element;
    newFiber.stateNode = oldFiber.stateNode;
    newFiber.stateNode.current = newFiber;
    return newFiber;
}
function findNonLISIndices(numbers) {
    if (numbers.length === 0) {
        return [];
    }
    const tails = [numbers[0]];
    const lengths = [1];
    for (let i = 1; i < numbers.length; i++) {
        const num = numbers[i];
        if (num >= tails[tails.length - 1]) {
            tails.push(num);
            lengths.push(tails.length);
        }
        else if (num <= tails[0]) {
            tails[0] = num;
            lengths.push(1);
        }
        else {
            let low = 1;
            let high = tails.length - 1;
            while (low < high) {
                const mid = (low + high) >>> 1;
                if (tails[mid] < num) {
                    low = mid + 1;
                }
                else {
                    high = mid;
                }
            }
            tails[low] = num;
            lengths.push(low + 1);
        }
    }
    let currLen = tails.length;
    const nonLISIndices = [];
    for (let i = numbers.length - 1; i >= 0; i--) {
        if (lengths[i] === currLen && currLen > 0) {
            currLen--;
        }
        else {
            nonLISIndices.push(i);
        }
    }
    return nonLISIndices;
}
