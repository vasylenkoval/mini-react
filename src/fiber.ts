import { JSXElement, Props, FC, propsCompareFnSymbol } from './jsx.js';
import dom from './dom.js';
import {
    type Hooks,
    HooksDispatcher,
    collectEffectCleanups,
    startHooks,
    finishHooks,
} from './hooks.js';
import { schedule } from './scheduler.js';
import { EMPTY_ARR } from './constants.js';
import { Mounted, Moved, MovedEnd, NoFlags, Old, Skipped, renderFlags } from './flags.js';

const ROOT = 'root' as const;

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
    /**
     * See `flags.ts`
     */
    flags: number;
    /**
     * The props of the fiber.
     */
    props: Props | null;
    /**
     * Same as props.children for dom nodes, computed from render in component nodes.
     */
    children: JSXElement[] | null;
    /**
     * Reference to the element that created this fiber.
     */
    from: JSXElement | null;
    /**
     * Version of the fiber node. Incremented each time the same fiber is recreated.
     */
    v: number;
}

let NextUnitOfWork: Fiber | null;
let RenderQueue: Fiber[] = [];
let Root: Fiber | null;
let WipRoot: Fiber | null;
let Deletions: Fiber[] = [];
let Effects: (() => void)[] = [];
let Cleanups: (() => void)[] = [];
let AfterCommitCallbacks: (() => void)[] = [];
let Dom = dom;
let DEBUG = false;

function createFiberObj(): Fiber {
    const fiber: Fiber = {
        parent: null,
        child: null,
        sibling: null,
        type: '',
        props: null,
        old: null,
        flags: NoFlags,
        dom: null,
        stateNode: null,
        children: null,
        from: null,
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

    return fiber;
}

/**
 * Creates app root and kicks off the first render.
 * @param root - The topmost DOM node to attach elements to.
 * @param element - The JSX element to render.
 * @param options - Options for the render.
 */
export function createRoot(node: Node, element: JSXElement, fakeDom?: typeof dom) {
    if (fakeDom) {
        Dom = fakeDom;
    }
    const fiber = createFiberObj();
    fiber.type = ROOT;
    fiber.dom = node;
    fiber.from = {
        type: ROOT,
        props: {},
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
function updateComponent(stateNode: { current: Fiber; hooks: Hooks }) {
    const fiber = stateNode!.current;
    if (!RenderQueue.includes(fiber)) {
        RenderQueue.push(fiber);
        schedule(workloop);
    }
}

/**
 * Register a callback for when hooks for a component have an update.
 */
HooksDispatcher.onUpdate = updateComponent as (node: unknown) => void;

function movedOrNonSkipped(f: Fiber) {
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
        let nextFiberToCommit: Fiber | null = WipRoot;
        while (nextFiberToCommit) {
            commitFiber(nextFiberToCommit);

            nextFiberToCommit = nextFiberWithFilter(
                nextFiberToCommit,
                WipRoot,
                movedOrNonSkipped,
                !!(nextFiberToCommit.flags & Skipped)
            );
        }

        for (let i = AfterCommitCallbacks.length - 1; i >= 0; i--) {
            AfterCommitCallbacks[i]();
        }

        AfterCommitCallbacks.splice(0);

        if (WipRoot !== Root) {
            // Component re-renders, fix-up new fiber to the previous parent
            const oldRoot = WipRoot.old!;
            const oldRootParent = oldRoot.parent!;

            if (oldRootParent.child === oldRoot) {
                oldRootParent.child = WipRoot;
            } else {
                let nextSibling = oldRootParent.child;
                while (nextSibling) {
                    if (nextSibling.sibling === oldRoot) {
                        nextSibling.sibling = WipRoot;
                        break;
                    }
                    nextSibling = nextSibling.sibling;
                }
            }

            // Cleanup references on the old fiber.
            oldRoot.old = null;
            oldRoot.flags |= Old;
            oldRoot.sibling = null;
            oldRoot.dom = null;
            oldRoot.parent = null;
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

function fiberWithDom(f: any) {
    return !!f.dom;
}

function fiberComponent(f: any) {
    return typeof f.type !== 'string';
}

function deleteFiber(fiber: Fiber) {
    // Find the closest child and remove it from the dom.
    const closestChildDom = fiber.dom ?? findNextFiber(fiber, fiber, fiberWithDom)?.dom;
    if (closestChildDom && closestChildDom.parentNode) {
        Dom.removeChild(closestChildDom.parentNode, closestChildDom);
    }
    // Collect all of the useEffect cleanup functions to run after delete.
    let nextComponentChildFiber: Fiber | null = fiber;
    while (nextComponentChildFiber) {
        if (nextComponentChildFiber.stateNode!.hooks.length) {
            const cleanupFuncs = collectEffectCleanups(nextComponentChildFiber.stateNode!.hooks);
            if (cleanupFuncs) {
                Cleanups.push(...cleanupFuncs.reverse());
            }
        }
        nextComponentChildFiber = nextFiberWithFilter(
            nextComponentChildFiber,
            fiber,
            fiberComponent
        );
    }

    fiber.old = null;
    fiber.child = null;
    fiber.sibling = null;
    fiber.parent = null;
    fiber.dom = null;
}

/**
 * Commits a single fiber by attaching its DOM nodes to parent's and adding new props.
 * New subtrees are mounted at once.
 * Removes nodes marked to be deleted.
 * @param fiber - Fiber to commit.
 */
function commitFiber(fiber: Fiber) {
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
                    Dom.insertBefore(
                        closestChildDom.parentNode!,
                        closestChildDom,
                        closestNextSiblingDom
                    );
                }
            });
        }
    }

    if (!(fiber.dom && fiber.parent) || fiber.flags & Skipped) {
        return;
    }

    Dom.addProps(fiber, fiber.dom, fiber.props!, fiber.old?.props || null);

    if (fiber.flags & Mounted) {
        // Find closest parent that's not a component.
        let parentWithDom: Fiber | null = fiber.parent;
        while (!parentWithDom.dom) {
            parentWithDom = parentWithDom.parent!;
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
function pickNextComponentToRender(): Fiber | null {
    if (!RenderQueue.length) {
        return null;
    }
    const componentFiber = RenderQueue.shift()!;

    // If the component already re-rendered since it was queued we can skip the update.
    // Currently does not do anything since we're not running in async mode.
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
    newFiber.stateNode!.current = newFiber;
    componentFiber.flags |= Old;

    return newFiber;
}

/**
 * The main work loop. Picks up items from the render queue.
 * @param timeRemaining - Function that returns the remaining time this loop has to run.
 */
function workloop(remainingMs: () => number) {
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
function processComponentFiber(fiber: Fiber<FC>) {
    const stateNode = fiber.stateNode!;
    const runHooks = fiber.v === 0 || stateNode.hooks.length > 0;

    if (!runHooks) {
        fiber.children = [fiber.type(fiber.props!)];
        return;
    }

    startHooks(stateNode.hooks, stateNode);
    fiber.children = [fiber.type(fiber.props!)];
    finishHooks(stateNode.hooks, Effects, Cleanups);
}

/**
 * Processes dom fiber node before diffing children.
 * @param fiber - The dom fiber to process.
 */
function processDomFiber(fiber: Fiber<string>) {
    if (!fiber.dom) {
        fiber.dom = Dom.createNode(fiber.type as string);
        // Dom.addProps(fiber, fiber.dom, fiber.props, null);
    }
    fiber.children = fiber!.from!.children ?? EMPTY_ARR;
}

/**
 * Performs a single unit of work.
 * @param fiber - Fiber to do work on.
 * @returns Next unit of work or undefined if no work is left.
 */
function performUnitOfWork(fiber: Fiber): Fiber | null {
    if (typeof fiber.type === 'string') {
        processDomFiber(fiber as Fiber<string>);
    }

    if (typeof fiber.type === 'function') {
        processComponentFiber(fiber as Fiber<FC>);
    }

    if (fiber.flags & Mounted) {
        reconcileChildrenOnMount(fiber, fiber.children!);
    } else {
        const len = fiber.children!.length;
        if (len !== 1) {
            reconcileChildrenOnUpdate(fiber, fiber.children!);
        } else {
            reconcileSingleChildOnUpdate(fiber, fiber.children![0]);
        }
        // TODO: add handling of no children
    }

    return nextFiberWithFilter(fiber, WipRoot, nonSkipped);
}

function nonSkipped(f: Fiber) {
    // return f.effectTag !== EffectTag.skip;
    return !(f.flags & Skipped);
}

function nextFiberWithFilter(
    currFiber: Fiber,
    root: Fiber | null,
    shouldVisit: (fiber: Fiber) => boolean,
    skipChild = false
): Fiber | null {
    if (!skipChild && currFiber.child && shouldVisit(currFiber.child)) {
        return currFiber.child;
    }

    let next: Fiber | null = skipChild ? currFiber : currFiber.child ?? currFiber;

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

function nextFiber(currFiber: Fiber, root: Fiber | null): Fiber | null {
    let current: Fiber | null = currFiber;

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
function findNextFiber(
    currFiber: Fiber | null,
    root: Fiber | null,
    predicate: (fiber: Fiber) => boolean
): Fiber | null {
    if (!currFiber) {
        return null;
    }
    let next: Fiber | null = nextFiber(currFiber, root);
    while (next) {
        if (predicate(next)) {
            return next;
        }
        next = nextFiber(next, root);
    }
    return null;
}

function reconcileChildrenOnMount(wipFiberParent: Fiber, elements: JSXElement[]) {
    let prevNewFiber: Fiber | null = null;
    for (let newIdx = 0; newIdx < elements.length; newIdx++) {
        const element = elements[newIdx];
        const newFiber = createFiber(element, wipFiberParent);
        if (newIdx === 0) {
            wipFiberParent.child = newFiber;
        } else {
            prevNewFiber!.sibling = newFiber;
        }
        prevNewFiber = newFiber;
    }
}

function reconcileSingleChildOnUpdate(wipFiberParent: Fiber, element: JSXElement) {
    const oldFiber = wipFiberParent?.old?.child;

    if (!oldFiber) {
        // No old fiber, create a new one
        wipFiberParent.child = createFiber(element, wipFiberParent);
        return;
    }

    if (oldFiber.type === element.type) {
        // Reuse fiber
        const newFiber = reuseFiber(element, wipFiberParent, oldFiber);
        const shouldSkip =
            oldFiber.from === element ||
            (typeof element.type !== 'string' &&
                (newFiber.type as any)?.[propsCompareFnSymbol]?.(oldFiber.props, element.props));

        if (shouldSkip) {
            newFiber.flags |= Skipped;
            newFiber.child = oldFiber.child;
            let nextFiber = oldFiber.child;
            while (nextFiber) {
                nextFiber.parent = newFiber;
                nextFiber = nextFiber.sibling;
            }
            oldFiber.child = null;
        }
        wipFiberParent.child = newFiber;
    } else {
        // Type mismatch - delete old, create new
        Deletions.push(oldFiber);
        wipFiberParent.child = createFiber(element, wipFiberParent);
    }

    // Delete the rest
    let nextSibling = oldFiber.sibling;
    while (nextSibling) {
        Deletions.push(nextSibling);
        nextSibling = nextSibling.sibling;
    }
}

function reconcileNoChildrenOnUpdate(wipFiberParent: Fiber) {
    // If fiber is a dom fiber and was previously committed and currently has no child elements
    // but previous fiber had elements we can bail out of doing a full diff, instead just recreate
    // the current wip fiber.
    if (!!wipFiberParent.old && !!wipFiberParent.old.child) {
        const old = wipFiberParent.old;
        Deletions.push(old);
        wipFiberParent.old = null;
        wipFiberParent.flags |= Mounted;
        wipFiberParent.children = EMPTY_ARR;
        wipFiberParent.child = null;
        wipFiberParent.dom = Dom.createNode(wipFiberParent.type as string);
        return;
    }
}

function reconcileChildrenOnUpdate(wipFiberParent: Fiber, elements: JSXElement[]) {
    let oldFiber = wipFiberParent.old?.child ?? null;
    let prevNewFiber: Fiber | null = null;
    const existingOldFibersMap = new Map<string | number, { fiber: Fiber; oldListIdx: number }>();
    let currentOldFiber = oldFiber;
    let oldIdx = 0;

    // Map old fibers by key with their original indices
    while (currentOldFiber) {
        const key = currentOldFiber!.from!.key ?? oldIdx;
        existingOldFibersMap.set(key, {
            fiber: currentOldFiber,
            oldListIdx: oldIdx,
        });
        currentOldFiber = currentOldFiber.sibling;
        oldIdx++;
    }

    const reusedFibers: Fiber[] = [];
    const reusedFibersOldIndices: number[] = [];

    for (let newIdx = 0; newIdx < elements.length; newIdx++) {
        const element = elements[newIdx];
        const key = element.key ?? newIdx;
        const existing = existingOldFibersMap.get(key);
        let newFiber: Fiber | null = null;

        if (existing) {
            // Exist in the old list
            const { fiber: oldFiber, oldListIdx } = existing;
            existingOldFibersMap.delete(key);

            if (oldFiber.type === element.type) {
                // Reuse fiber
                newFiber = reuseFiber(element, wipFiberParent, oldFiber);
                reusedFibers.push(newFiber);
                reusedFibersOldIndices.push(oldListIdx);

                const shouldSkip =
                    oldFiber.from === element ||
                    (typeof element.type !== 'string' &&
                        (newFiber.type as any)?.[propsCompareFnSymbol]?.(
                            oldFiber.props,
                            element.props
                        ));

                if (shouldSkip) {
                    newFiber.flags |= Skipped;
                    newFiber.child = oldFiber.child;
                    let nextFiber = oldFiber.child;
                    while (nextFiber) {
                        nextFiber.parent = newFiber;
                        nextFiber = nextFiber.sibling;
                    }
                    oldFiber.child = null;
                }
            } else {
                // Type mismatch - delete old, create new
                Deletions.push(oldFiber);
                newFiber = createFiber(element, wipFiberParent);
                newFiber.flags |= newIdx > oldIdx ? MovedEnd : Moved;
            }
        } else {
            // Completely new fiber
            newFiber = createFiber(element, wipFiberParent);
            newFiber.flags |= newIdx > oldIdx ? MovedEnd : Moved;
        }

        if (newFiber) {
            if (newIdx === 0) wipFiberParent.child = newFiber;
            else prevNewFiber!.sibling = newFiber;
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

function createFiber(element: JSXElement, parent: Fiber): Fiber {
    const newFiber = createFiberObj();
    newFiber.type = element.type;
    newFiber.parent = parent;
    newFiber.props = element.props;
    newFiber.from = element;
    newFiber.flags |= Mounted;
    newFiber.stateNode = {
        current: newFiber,
        hooks: [],
    };

    return newFiber;
}

function reuseFiber(element: JSXElement, parent: Fiber, oldFiber: Fiber): Fiber {
    const newFiber = createFiberObj();
    newFiber.type = element.type;
    newFiber.parent = parent;
    newFiber.old = oldFiber;
    newFiber.dom = oldFiber.dom;
    newFiber.props = element.props;
    newFiber.v = oldFiber.v + 1;
    newFiber.from = element;
    newFiber.stateNode = oldFiber.stateNode;
    newFiber.stateNode!.current = newFiber;
    oldFiber.flags |= Old;
    oldFiber.sibling = null;
    oldFiber.old = null;
    oldFiber.parent = null;
    oldFiber.dom = null;
    return newFiber;
}

function findNonLISIndices(numbers: number[]): number[] {
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
        } else if (num <= tails[0]) {
            tails[0] = num;
            lengths.push(1);
        } else {
            let low = 1;
            let high = tails.length - 1;
            while (low < high) {
                const mid = (low + high) >>> 1;
                if (tails[mid] < num) {
                    low = mid + 1;
                } else {
                    high = mid;
                }
            }
            tails[low] = num;
            lengths.push(low + 1);
        }
    }

    let currLen = tails.length;
    const nonLISIndices: Array<number> = [];
    for (let i = numbers.length - 1; i >= 0; i--) {
        if (lengths[i] === currLen && currLen > 0) {
            currLen--;
        } else {
            nonLISIndices.push(i);
        }
    }

    return nonLISIndices;
}
