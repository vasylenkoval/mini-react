import { JSXElement, Props, FC, propsCompareFnSymbol } from './jsx.js';
import REAL_DOM from './dom.js';
import { Hooks, processHooks, collectEffectCleanups } from './hooks.js';
import { schedule } from './scheduler.js';
import { EMPTY_ARR } from './constants.js';

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

export interface Fiber<T extends string | FC = string | FC> {
    /**
     * A string if it's a DOM node, a function if it's a component.
     */
    type: T;
    /**
     * The parent fiber.
     */
    parent: Fiber | null;
    /**
     * The first child fiber.
     */
    child: Fiber | null;
    /**
     * The next sibling fiber.
     */
    sibling: Fiber | null;
    /**
     * Contains a reference to the old fiber that was replaced. Used to compare old and new trees.
     */
    old: Fiber | null;
    /**
     * When TRUE indicates that the fiber is an old alternate of some other fiber.
     */
    isOld: boolean;
    /**
     * The dom node of the fiber. Only set for DOM (non-component) fibers.
     */
    dom: Node | null;
    /**
     * State node.
     */
    stateNode: {
        /**
         * Current node this state node is attached to.
         */
        current: Fiber;
        /**
         * Array of hooks.
         */
        hooks: Hooks;
    } | null;

    /*
     * The effect tag of the fiber. Used to determine what to do with the fiber after a render.
     */
    effectTag: EffectTag;
    /**
     * Indicates whether the current fiber needs to placed. Placement means that the fiber is either new or moved.
     */
    shouldPlace: boolean;
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
    childElements: JSXElement[];
    /**
     * Reference to the element that created this fiber.
     */
    fromElement: JSXElement;
    /**
     * Function to compare prev and next props.
     */
    propsCompareFn: ((prevProps: Props, nextProps: Props) => boolean) | null;
}

type MaybeFiber = Fiber | null;
type AfterCommitFunc = () => void;
type MaybeAfterCommitFunc = AfterCommitFunc | undefined;

let nextUnitOfWork: MaybeFiber;
let componentRenderQueue: Fiber[] = [];
let wipRoot: MaybeFiber;
let currentRoot: MaybeFiber;
let deletions: Fiber[] = [];
let effectsToRun: (() => void)[] = [];
let effectCleanupsToRun: (() => void)[] = [];
let afterCommitCbs: AfterCommitFunc[] = [];
let DOM = REAL_DOM;

const defaultShallowEqual = (_prevProps: Props, _nextProps: Props) => {
    return false;
};

function getNewFiber(): Fiber {
    const props = { key: null, children: EMPTY_ARR };
    const fiber: Fiber = {
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
        shouldPlace: false,
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
export function createRoot(root: Node, element: JSXElement, fakeDom?: typeof REAL_DOM) {
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
function addToComponentRenderQueue(fiber: Fiber) {
    if (!componentRenderQueue.includes(fiber)) {
        componentRenderQueue.push(fiber);
        schedule(workloop);
    }
}

function placedOrNonSkipped(f: Fiber) {
    return f.shouldPlace || f.effectTag !== EffectTag.skip;
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
        let nextFiberToCommit: MaybeFiber = wipRoot;
        while (nextFiberToCommit) {
            commitFiber(nextFiberToCommit);

            nextFiberToCommit = nextFiber(
                nextFiberToCommit,
                wipRoot,
                placedOrNonSkipped,
                nextFiberToCommit.effectTag === EffectTag.skip
            );
        }

        for (let i = afterCommitCbs.length - 1; i >= 0; i--) {
            afterCommitCbs[i]();
        }
        afterCommitCbs.splice(0);

        if (wipRoot.type === APP_ROOT) {
            // first mount
            currentRoot = wipRoot;
        } else {
            // component re-renders, attaching fiber to existing root
            const originalFiber = wipRoot.old;
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

function fiberWithDom(f: any) {
    return !!f.dom;
}

function fiberComponent(f: any) {
    return typeof f.type !== 'string';
}

function deleteFiber(fiber: Fiber) {
    // Find the closest child and remove it from the dom.
    const closestChildDOM = fiber.dom ?? findNextFiber(fiber, fiber, fiberWithDom)?.dom;
    if (closestChildDOM && closestChildDOM.parentNode) {
        DOM.removeChild(closestChildDOM.parentNode, closestChildDOM);
    }
    // Collect all of the useEffect cleanup functions to run after delete.
    let nextComponentChildFiber: MaybeFiber = fiber;
    while (nextComponentChildFiber) {
        if (nextComponentChildFiber.stateNode!.hooks.length) {
            const cleanupFuncs = collectEffectCleanups(nextComponentChildFiber.stateNode!.hooks);
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
function commitFiber(fiber: Fiber) {
    if (fiber.shouldPlace) {
        // Find closest parent that's not a component.
        const closestChildDom = fiber.dom ?? findNextFiber(fiber, fiber, fiberWithDom)?.dom;
        if (closestChildDom) {
            afterCommitCbs.push(() => {
                const closestNextSiblingDom = fiber.sibling
                    ? fiber.sibling?.dom ??
                      findNextFiber(fiber.sibling, fiber, fiberWithDom)?.dom ??
                      null
                    : null;
                if (closestChildDom.nextSibling != closestNextSiblingDom) {
                    DOM.insertBefore(
                        closestChildDom.parentNode!,
                        closestChildDom,
                        closestNextSiblingDom
                    );
                }
            });
        }
    }

    if (!(fiber.dom && fiber.parent) || fiber.effectTag === EffectTag.skip) {
        return;
    }

    // Find closest parent that's not a component.
    let parentWithDom: MaybeFiber = fiber.parent;
    while (!parentWithDom.dom) {
        parentWithDom = parentWithDom.parent!;
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
function pickNextComponentToRender(): MaybeFiber {
    if (!componentRenderQueue.length) {
        return null;
    }
    const componentFiber = componentRenderQueue.shift()!;

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
    const stateNode = componentFiber.stateNode!;
    newFiber.stateNode = stateNode;
    stateNode.current = newFiber;
    newFiber.effectTag = EffectTag.update;
    newFiber.shouldPlace = false;
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
function workloop(remainingMs: () => number) {
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
function processComponentFiber(fiber: Fiber<FC>) {
    if (propsCompareFnSymbol in fiber.type && fiber.type[propsCompareFnSymbol]) {
        fiber.propsCompareFn = fiber.type[propsCompareFnSymbol];
    }

    let componentEffects: (() => void)[] | undefined;
    let componentEffectCleanups: (() => void)[] | undefined;
    // Make sure notifyOnStateChange does not have to close over entire node.
    const stateNode = fiber.stateNode!;

    processHooks(
        stateNode.hooks,
        function notifyOnStateChange() {
            addToComponentRenderQueue(stateNode.current!);
        },
        function scheduleEffect(effect, cleanup) {
            (componentEffects ?? (componentEffects = [])).push(effect);
            if (cleanup) {
                (componentEffectCleanups ?? (componentEffectCleanups = [])).push(cleanup);
            }
        }
    );

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
function processDomFiber(fiber: Fiber<string>) {
    if (!fiber.dom) {
        fiber.dom = DOM.createNode(fiber.type as string);
        DOM.addProps(fiber, fiber.dom, fiber.props, null);
    }
    fiber.childElements = fiber.fromElement.children ?? EMPTY_ARR;
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
    return nextFiber(fiber, wipRoot, nonSkipped);
}

function nonSkipped(f: Fiber) {
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
function nextFiber(
    currFiber: Fiber,
    root: MaybeFiber,
    continueFn: (fiber: Fiber) => boolean = defaultPredicate,
    skipChild = false
): MaybeFiber {
    // 1. Check child first if allowed
    if (!skipChild && currFiber.child && continueFn(currFiber.child)) {
        return currFiber.child;
    }

    let current: MaybeFiber = skipChild ? currFiber : currFiber.child ?? currFiber;

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

function nextFiber2(currFiber: Fiber, root: MaybeFiber): MaybeFiber {
    let current: MaybeFiber = currFiber;

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
function findNextFiber(
    currFiber: MaybeFiber,
    root: MaybeFiber,
    predicate: (fiber: Fiber) => boolean
): MaybeFiber {
    if (!currFiber) {
        return null;
    }
    let next: MaybeFiber = nextFiber2(currFiber, root);
    while (next) {
        if (predicate(next)) {
            return next;
        }
        next = nextFiber2(next, root);
    }
    return null;
}

function diffChildren(wipFiberParent: Fiber, elements: JSXElement[]) {
    // If fiber is a dom fiber and was previously committed and currently has no child elements
    // but previous fiber had elements we can bail out of doing a full diff, instead just recreate
    // the current wip fiber.
    if (
        !elements.length &&
        !!wipFiberParent.dom &&
        !!wipFiberParent.parent &&
        !!wipFiberParent.old &&
        !!wipFiberParent.old.child
    ) {
        const old = wipFiberParent.old;
        deletions.push(old);

        wipFiberParent.old = null;
        wipFiberParent.effectTag = EffectTag.add;
        wipFiberParent.childElements = EMPTY_ARR;
        wipFiberParent.child = null;
        wipFiberParent.dom = DOM.createNode(wipFiberParent.type as string);
        DOM.addProps(wipFiberParent, wipFiberParent.dom, wipFiberParent.props, null);

        return;
    }

    let oldFiber = wipFiberParent.old?.child ?? null;
    let prevNewFiber: Fiber | null = null;
    const existingOldFibersMap = new Map<string | number, { fiber: Fiber; oldListIdx: number }>();
    const existingOldFibersArr: Fiber[] = [];
    let currentOldFiber = oldFiber;
    let oldIdx = 0;

    // Map old fibers by key with their original indices
    while (currentOldFiber) {
        const key = currentOldFiber.fromElement.key ?? oldIdx;
        existingOldFibersMap.set(key, {
            fiber: currentOldFiber,
            oldListIdx: oldIdx,
        });
        existingOldFibersArr.push(currentOldFiber);
        currentOldFiber = currentOldFiber.sibling;
        oldIdx++;
    }

    // If there are no old fibers we can just add all new fibers without placing.
    const canPlace = !!oldFiber;
    const reusedFibers: Fiber[] = [];
    const reusedFibersOldIndices: number[] = [];

    for (let newIdx = 0; newIdx < elements.length; newIdx++) {
        const childElement = elements[newIdx];
        const key = childElement.key ?? newIdx;
        const existing = existingOldFibersMap.get(key);
        let newFiber: Fiber | null = null;

        if (existing) {
            // Exist in the old list
            const { fiber: oldFiber, oldListIdx } = existing;
            existingOldFibersMap.delete(key);

            if (oldFiber.type === childElement.type) {
                // Reuse fiber
                newFiber = reuseFiber(childElement, wipFiberParent, oldFiber);
                reusedFibers.push(newFiber);
                reusedFibersOldIndices.push(oldListIdx);

                const shouldSkip =
                    oldFiber.fromElement === childElement ||
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
            } else {
                // Type mismatch - delete old, create new
                deletions.push(oldFiber);
                newFiber = addNewFiber(childElement, wipFiberParent, canPlace);
            }
        } else {
            // Completely new fiber
            newFiber = addNewFiber(childElement, wipFiberParent, canPlace);
        }

        if (newFiber) {
            if (newIdx === 0) wipFiberParent.child = newFiber;
            else prevNewFiber!.sibling = newFiber;
            prevNewFiber = newFiber;
        }
    }

    existingOldFibersMap.forEach((entry) => {
        deletions.push(entry.fiber);
    });

    if (!canPlace) {
        return;
    }

    // Derive what old fibers need to be placed.
    const newFiberIndicesToPlace = findOldIndicesNotInLIS(reusedFibersOldIndices);
    for (const idxToPlace of newFiberIndicesToPlace) {
        reusedFibers[idxToPlace].shouldPlace = true;
    }
}

function addNewFiber(element: JSXElement, parent: Fiber, shouldPlace: boolean): Fiber {
    const newFiber = getNewFiber();
    newFiber.type = element.type;
    newFiber.parent = parent;
    newFiber.props = element.props;
    newFiber.fromElement = element;
    newFiber.effectTag = EffectTag.add;
    newFiber.shouldPlace = shouldPlace;
    if (typeof element.type === 'string') {
        newFiber.propsCompareFn = defaultShallowEqual;
    }
    return newFiber;
}

function reuseFiber(element: JSXElement, parent: Fiber, oldFiber: Fiber): Fiber {
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

    const stateNode = oldFiber.stateNode!;
    stateNode.current = newFiber;
    newFiber.stateNode = stateNode;

    return newFiber;
}

function findOldIndicesNotInLIS(oldIndices: number[]): number[] {
    const n = oldIndices.length;
    const lengths = new Uint32Array(n);
    const tails: number[] = [];

    // Compute LIS using binary search optimization
    for (let i = 0; i < n; i++) {
        const val = oldIndices[i];
        let low = 0,
            high = tails.length;

        // Fast binary search using bitwise operations
        while (low < high) {
            const mid = (low + high) >>> 1;
            tails[mid] < val ? (low = mid + 1) : (high = mid);
        }

        if (low === tails.length) tails.push(val);
        else tails[low] = val;
        lengths[i] = low + 1;
    }

    // Identify elements in LIS (don't need moving)
    const lisMembers = new Uint8Array(n);
    let currentLen = tails.length;
    for (let i = n - 1; i >= 0 && currentLen > 0; i--) {
        if (lengths[i] === currentLen) {
            lisMembers[i] = 1;
            currentLen--;
        }
    }

    // Collect indexes of elements needing movement
    const moved: number[] = [];
    for (let i = 0; i < n; i++) {
        if (!lisMembers[i]) moved.push(i);
    }

    return moved;
}
