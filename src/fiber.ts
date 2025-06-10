import { JSXElement, Props, FC, propsCompareFnSymbol } from './jsx.js';
import dom from './dom.js';
import { Hooks, collectEffectCleanups, startHooks, finishHooks } from './hooks.js';
import { schedule } from './scheduler.js';
import { EMPTY_ARR } from './constants.js';
import { Mounted, Moved, Old, Skipped, Updated } from './flags.js';

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
     * When TRUE indicates that the fiber is an old alternate of some other fiber.
     */
    // isOld: boolean;
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
     * Flags.
     */
    flags: number;
    /*
     * The effect tag of the fiber. Used to determine what to do with the fiber after a render.
     */
    // effectTag: EffectTag;
    /**
     * Indicates whether the current fiber needs to placed. Placement means that the fiber is either new or moved.
     */
    // shouldPlace: boolean;
    /**
     * The props of the fiber.
     */
    props: Props;
    /**
     * Same as props.children for dom nodes, computed from render in component nodes.
     */
    children: JSXElement[];
    /**
     * Reference to the element that created this fiber.
     */
    from: JSXElement;
    /**
     * Version of the fiber node. Incremented each time the same fiber is recreated.
     */
    v: number;
}

type MaybeFiber = Fiber | null;
type AfterCommitFunc = () => void;

let NextUnitOfWork: MaybeFiber;
let RenderQueue: Fiber[] = [];
let Root: MaybeFiber;
let WipRoot: MaybeFiber;
let Deletions: Fiber[] = [];
let Effects: (() => void)[] = [];
let Cleanups: (() => void)[] = [];
let AfterCommitCallbacks: AfterCommitFunc[] = [];
let Dom = dom;

function createFiberObj(): Fiber {
    const props = { key: null, children: EMPTY_ARR };
    const fiber: Fiber = {
        parent: null,
        child: null,
        sibling: null,
        type: '',
        props,
        // effectTag: EffectTag.add,
        old: null,
        flags: 0,
        // isOld: false,
        dom: null,
        stateNode: null,
        // shouldPlace: false,
        children: EMPTY_ARR,
        from: {
            type: '',
            props,
            children: EMPTY_ARR,
            key: null,
        },
        v: 0,
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
export function createRoot(node: Node, element: JSXElement, fakeDom?: typeof dom) {
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
function scheduleComponent(stateNode: Fiber['stateNode']) {
    const fiber = stateNode!.current;
    if (!RenderQueue.includes(fiber)) {
        RenderQueue.push(fiber);
        schedule(workloop);
    }
}

function placedOrNonSkipped(f: Fiber) {
    // return f.shouldPlace || f.effectTag !== EffectTag.skip;
    return !!(f.flags & Moved) || !(f.flags & Skipped);
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
        let nextFiberToCommit: MaybeFiber = WipRoot;
        while (nextFiberToCommit) {
            commitFiber(nextFiberToCommit);

            nextFiberToCommit = nextFiberWithFilter(
                nextFiberToCommit,
                WipRoot,
                placedOrNonSkipped,
                !!(nextFiberToCommit.flags & Skipped)
                // nextFiberToCommit.effectTag === EffectTag.skip
            );
        }

        for (let i = AfterCommitCallbacks.length - 1; i >= 0; i--) {
            AfterCommitCallbacks[i]();
        }

        AfterCommitCallbacks.splice(0);

        if (WipRoot !== Root) {
            // Component re-renders, fix-up new fiber to the previous parent
            const oldRoot = WipRoot.old;
            const oldRootParent = oldRoot!.parent!;

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
    let nextComponentChildFiber: MaybeFiber = fiber;
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
function commitFiber(fiber: Fiber) {
    // if (fiber.shouldPlace) {
    if (fiber.flags & Moved) {
        // Find closest parent that's not a component.
        const closestChildDom = fiber.dom ?? findNextFiber(fiber, fiber, fiberWithDom)?.dom;
        if (closestChildDom) {
            AfterCommitCallbacks.push(() => {
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

    // if (!(fiber.dom && fiber.parent) || fiber.effectTag === EffectTag.skip) {
    if (!(fiber.dom && fiber.parent) || fiber.flags & Skipped) {
        return;
    }

    // if (fiber.effectTag === EffectTag.update) {
    if (fiber.flags & Updated) {
        Dom.addProps(fiber, fiber.dom, fiber.props, fiber.old?.props || null);
        return;
    }

    // Always add props here?
    // Remove Updated flag, it's implied?

    // if (fiber.effectTag === EffectTag.add) {
    if (fiber.flags & Mounted) {
        // Find closest parent that's not a component.
        let parentWithDom: MaybeFiber = fiber.parent;
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
function pickNextComponentToRender(): MaybeFiber {
    if (!RenderQueue.length) {
        return null;
    }
    const componentFiber = RenderQueue.shift()!;

    // If the component already re-rendered since it was queued we can skip the update.
    // if (componentFiber.isOld) {
    if (componentFiber.flags & Old) {
        return pickNextComponentToRender();
    }

    const newFiber = createFiberObj(); // all flags are 0
    newFiber.flags |= Updated;
    // newFiber.effectTag = EffectTag.update;
    // newFiber.isOld = false;
    // newFiber.shouldPlace = false;
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
        fiber.children = [fiber.type(fiber.props)];
        return;
    }

    startHooks(stateNode.hooks, stateNode, scheduleComponent as any);
    fiber.children = [fiber.type(fiber.props)];
    finishHooks(stateNode.hooks, Effects, Cleanups);
}

/**
 * Processes dom fiber node before diffing children.
 * @param fiber - The dom fiber to process.
 */
function processDomFiber(fiber: Fiber<string>) {
    if (!fiber.dom) {
        fiber.dom = Dom.createNode(fiber.type as string);
        Dom.addProps(fiber, fiber.dom, fiber.props, null);
    }
    fiber.children = fiber.from.children ?? EMPTY_ARR;
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

    diffChildren(fiber, fiber.children);
    return nextFiberWithFilter(fiber, WipRoot, nonSkipped);
}

function nonSkipped(f: Fiber) {
    // return f.effectTag !== EffectTag.skip;
    return !(f.flags & Skipped);
}

function nextFiberWithFilter(
    currFiber: Fiber,
    root: MaybeFiber,
    shouldVisit: (fiber: Fiber) => boolean,
    skipChild = false
): MaybeFiber {
    if (!skipChild && currFiber.child && shouldVisit(currFiber.child)) {
        return currFiber.child;
    }

    let next: MaybeFiber = skipChild ? currFiber : currFiber.child ?? currFiber;

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

function nextFiber(currFiber: Fiber, root: MaybeFiber): MaybeFiber {
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

// TODO: Refactor to have named loops with jumps, basically inline nextFiber from above
function findNextFiber(
    currFiber: MaybeFiber,
    root: MaybeFiber,
    predicate: (fiber: Fiber) => boolean
): MaybeFiber {
    if (!currFiber) {
        return null;
    }
    let next: MaybeFiber = nextFiber(currFiber, root);
    while (next) {
        if (predicate(next)) {
            return next;
        }
        next = nextFiber(next, root);
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
        Deletions.push(old);

        wipFiberParent.old = null;
        // wipFiberParent.effectTag = EffectTag.add;
        wipFiberParent.flags |= Mounted;
        wipFiberParent.flags &= ~Updated;
        wipFiberParent.children = EMPTY_ARR;
        wipFiberParent.child = null;
        wipFiberParent.dom = Dom.createNode(wipFiberParent.type as string);
        // Move to commit
        Dom.addProps(wipFiberParent, wipFiberParent.dom, wipFiberParent.props, null);

        return;
    }

    let oldFiber = wipFiberParent.old?.child ?? null;
    let prevNewFiber: Fiber | null = null;
    const existingOldFibersMap = new Map<string | number, { fiber: Fiber; oldListIdx: number }>();
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

    // If there are no old fibers we can just add all new fibers without placing.
    // TODO: refactor to be a separate branch. Maybe a separate function?
    const canPlace = !!oldFiber;
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
                    // Rewire old child fibers to the new parent
                    // newFiber.effectTag = EffectTag.skip;
                    // TODO: collapse into 1
                    newFiber.flags &= ~Updated;
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
            } else {
                // Type mismatch - delete old, create new
                Deletions.push(oldFiber);
                newFiber = createFiber(element, wipFiberParent, canPlace);
            }
        } else {
            // Completely new fiber
            newFiber = createFiber(element, wipFiberParent, canPlace);
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

    if (!canPlace) {
        return;
    }

    // Derive what old fibers need to be placed.
    const indicesToPlace = findNonLISIndices(reusedFibersOldIndices);
    for (const idxToPlace of indicesToPlace) {
        // reusedFibers[idxToPlace].shouldPlace = true;
        reusedFibers[idxToPlace].flags |= Moved;
    }
}

function createFiber(element: JSXElement, parent: Fiber, move: boolean): Fiber {
    const newFiber = createFiberObj();
    newFiber.type = element.type;
    newFiber.parent = parent;
    newFiber.props = element.props;
    newFiber.from = element;
    newFiber.flags |= Mounted;
    if (move) {
        newFiber.flags |= Moved;
    }

    // newFiber.effectTag = EffectTag.add;
    // newFiber.shouldPlace = shouldPlace;
    return newFiber;
}

function reuseFiber(element: JSXElement, parent: Fiber, oldFiber: Fiber): Fiber {
    const newFiber = createFiberObj();
    newFiber.type = element.type;
    newFiber.parent = parent;
    newFiber.old = oldFiber;
    newFiber.dom = oldFiber.dom;
    // newFiber.effectTag = EffectTag.update;
    oldFiber.flags |= Old;
    newFiber.flags |= Updated;
    newFiber.props = element.props;
    newFiber.v = oldFiber.v + 1;
    newFiber.from = element;
    newFiber.stateNode = oldFiber.stateNode;
    newFiber.stateNode!.current = newFiber;
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
