import { JSXElement, Props, FC } from './jsx.js';
import REAL_DOM from './dom.js';
import { Hooks, processHooks, collectEffectCleanups } from './hooks.js';
import { schedule } from './scheduler.js';
import { EMPTY_ARR, EMPTY_OBJ } from './constants.js';

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

interface Fiber<T extends string | FC = string | FC> {
    /**
     * A string if it's a DOM node, a function if it's a component.
     */
    type: T;
    /**
     * The parent fiber.
     */
    parent: Fiber | undefined;
    /**
     * The first child fiber.
     */
    child: Fiber | undefined;
    /**
     * The next sibling fiber.
     */
    sibling: Fiber | undefined;
    /**
     * The alternate fiber. Used to compare old and new trees. Contains a reference to the
     * old fiber that was replaced.
     */
    alternate: Fiber | undefined;
    /**
     * When TRUE indicates that the fiber is an alternate of some other fiber.
     */
    isAlternate: boolean;
    /**
     * The dom node of the fiber. Only set for DOM (non-component) fibers.
     */
    dom: Node | undefined;
    /**
     * Hooks, set if the fiber is a component.
     */
    hooks: Hooks;
    /*
     * The effect tag of the fiber. Used to determine what to do with the fiber after a render.
     */
    effectTag: EffectTag;
    /**
     * Indicates whether the current fiber preserved it's state but got re-ordered.
     */
    didChangePos: boolean;
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
}

type MaybeFiber = Fiber | undefined;
type AfterCommitFunc = () => void;
type MaybeAfterCommitFunc = AfterCommitFunc | undefined;

let nextUnitOfWork: MaybeFiber;
let componentRenderQueue: Fiber[] = [];
let wipRoot: MaybeFiber;
let currentRoot: MaybeFiber;
let deletions: Fiber[] = [];
let effectsToRun: (() => void)[] = [];
let effectCleanupsToRun: (() => void)[] = [];
let DOM = REAL_DOM;

function getNewFiber(): Fiber {
    return {
        type: '',
        parent: undefined,
        child: undefined,
        sibling: undefined,
        alternate: undefined,
        isAlternate: false,
        dom: undefined,
        hooks: [],
        effectTag: EffectTag.add,
        didChangePos: false,
        props: EMPTY_OBJ,
        version: 0,
        childElements: EMPTY_ARR,
        fromElement: { type: '', props: EMPTY_OBJ, key: undefined },
    };
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
function addToComponentRenderQueue(fiber: Fiber) {
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
        let afterCommitFns: AfterCommitFunc[] = [];
        let nextFiberToCommit: MaybeFiber = wipRoot;
        while (nextFiberToCommit) {
            const afterCommitFn = commitFiber(nextFiberToCommit);
            if (afterCommitFn) {
                afterCommitFns.push(afterCommitFn);
            }
            nextFiberToCommit = nextFiber(
                nextFiberToCommit,
                wipRoot,
                (f) => f.effectTag !== EffectTag.skip
            );
        }

        for (const afterCommitFn of afterCommitFns.reverse()) {
            afterCommitFn();
        }

        if (wipRoot.type === APP_ROOT) {
            // first mount
            currentRoot = wipRoot;
        } else {
            // component re-renders, attaching fiber to existing root
            const originalFiber = wipRoot.alternate;
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
function commitFiber(fiber: Fiber): MaybeAfterCommitFunc {
    let afterCommit: MaybeAfterCommitFunc;

    if (fiber.effectTag === EffectTag.delete) {
        // Find the closest child and remove it from the dom.
        const closestChildDOM = fiber.dom ?? findNextFiber(fiber, fiber, (f) => !!f.dom)?.dom;
        if (closestChildDOM && closestChildDOM.parentNode) {
            DOM.removeChild(closestChildDOM.parentNode, closestChildDOM);
        }

        // Collect all of the useEffect cleanup functions to run after delete.
        let nextComponentChildFiber: MaybeFiber = fiber;
        while (nextComponentChildFiber) {
            if (nextComponentChildFiber.hooks.length) {
                const cleanupFuncs = collectEffectCleanups(nextComponentChildFiber.hooks);
                if (cleanupFuncs) {
                    effectCleanupsToRun.push(...cleanupFuncs.reverse());
                }
            }
            nextComponentChildFiber = findNextFiber(
                nextComponentChildFiber,
                fiber,
                (f) => typeof f.type !== 'string'
            );
        }
    }

    if (fiber.didChangePos) {
        // Find closest parent that's not a component.
        let parentWithDom: MaybeFiber = fiber.parent;
        while (!parentWithDom?.dom) {
            parentWithDom = parentWithDom?.parent;
        }
        const parentDom = parentWithDom.dom!;
        const closestChildDom = fiber.dom ?? findNextFiber(fiber, fiber, (f) => !!f.dom)?.dom;
        const closestNextSiblingDom = fiber.sibling
            ? fiber.sibling?.dom ?? findNextFiber(fiber.sibling, fiber, (f) => !!f.dom)?.dom ?? null
            : null;

        if (closestChildDom && parentDom) {
            afterCommit = () => {
                DOM.insertBefore(parentDom, closestChildDom, closestNextSiblingDom);
            };
        }
    }

    if (!(fiber.dom && fiber.parent) || fiber.effectTag === EffectTag.skip) {
        return afterCommit;
    }

    // Find closest parent that's not a component.
    let parentWithDom: MaybeFiber = fiber.parent;
    while (!parentWithDom.dom) {
        parentWithDom = parentWithDom.parent!;
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
        const isNewSubtree =
            fiber.effectTag === EffectTag.add && parentWithDom?.effectTag === EffectTag.update;

        if ((isParentRoot || isNewSubtree) && noSiblings) {
            afterCommit = () => DOM.appendChild(parent, child);
        } else {
            DOM.appendChild(parent, child);
        }
    }

    return afterCommit;
}

/**
 * Picks the next component to render from the render queue.
 * @returns The next component to render.
 */
function pickNextComponentToRender(): MaybeFiber {
    if (!componentRenderQueue.length) {
        return;
    }
    const componentFiber = componentRenderQueue.shift()!;

    // If the component already re-rendered since it was queued we can skip the update.
    if (componentFiber.isAlternate) {
        return pickNextComponentToRender();
    }

    const newFiber = getNewFiber();
    newFiber.type = componentFiber.type;
    newFiber.parent = componentFiber.parent;
    newFiber.child = componentFiber.child;
    newFiber.sibling = componentFiber.sibling;
    newFiber.alternate = componentFiber;
    newFiber.isAlternate = false;
    newFiber.dom = componentFiber.dom;
    newFiber.hooks = componentFiber.hooks;
    newFiber.effectTag = EffectTag.update;
    newFiber.didChangePos = false;
    newFiber.props = componentFiber.props;
    newFiber.version = componentFiber.version + 1;
    newFiber.childElements = componentFiber.childElements;
    newFiber.fromElement = componentFiber.fromElement;

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
    if (!fiber.hooks) {
        fiber.hooks = [];
    }

    let componentEffects: (() => void)[] | undefined;
    let componentEffectCleanups: (() => void)[] | undefined;

    processHooks(
        fiber.hooks,
        function notifyOnStateChange() {
            addToComponentRenderQueue(fiber);
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
        if (fiber.props) {
            DOM.addProps(fiber.dom, fiber.props);
        }
    }
    fiber.childElements = fiber.props.children ?? EMPTY_ARR;
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
function nextFiber(
    currFiber: Fiber,
    root: MaybeFiber,
    skipFn: (fiber: Fiber) => boolean = defaultPredicate
): MaybeFiber {
    // Visit up to the last child first.
    if (currFiber.child && skipFn(currFiber.child)) {
        return currFiber.child;
    }
    let nextFiber: MaybeFiber = currFiber.child ?? currFiber;
    while (nextFiber && nextFiber !== root) {
        if (nextFiber.sibling && skipFn(nextFiber.sibling)) {
            return nextFiber.sibling; // Exhaust all siblings.
        } else if (nextFiber.sibling) {
            nextFiber = nextFiber.sibling; // If didn't pass the filter but exists - skip it.
        } else {
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
function findNextFiber(
    currFiber: MaybeFiber,
    root: MaybeFiber,
    predicate: (fiber: Fiber) => boolean
): MaybeFiber {
    if (!currFiber) {
        return;
    }
    let next: MaybeFiber = nextFiber(currFiber, root);
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
function diffChildren(wipFiberParent: Fiber) {
    const elements = wipFiberParent.childElements;
    // If fiber is a dom fiber and was previously committed and currently has no child elements
    // but previous fiber had elements we can bail out of doing a full diff, instead just recreate
    // the current wip fiber.
    if (
        !elements.length &&
        !!wipFiberParent.dom &&
        !!wipFiberParent.parent &&
        !!wipFiberParent.alternate &&
        !!wipFiberParent.alternate.child
    ) {
        wipFiberParent.effectTag = EffectTag.add;
        wipFiberParent.childElements = EMPTY_ARR;
        wipFiberParent.child = undefined;
        wipFiberParent.alternate.effectTag = EffectTag.delete;
        deletions.push(wipFiberParent.alternate);
        return;
    }

    // Collect all old fibers by key.
    const oldFibersMapByKey = new Map<string | number, Fiber>();
    const oldFibers: Fiber[] = [];
    let nextOldFiber = wipFiberParent.alternate && wipFiberParent.alternate.child;
    let nextOldFiberIndex = 0;
    while (nextOldFiber) {
        oldFibers.push(nextOldFiber);
        oldFibersMapByKey.set(nextOldFiber?.fromElement.key ?? nextOldFiberIndex, nextOldFiber);
        nextOldFiber = nextOldFiber.sibling;
        nextOldFiberIndex++;
    }

    let prevSibling: MaybeFiber;
    let newElementIndex = 0;

    while (newElementIndex < elements.length) {
        let newFiber: MaybeFiber;
        const childElement = elements[newElementIndex] as JSXElement | undefined;
        const oldFiberKey = childElement?.key ?? newElementIndex;
        const oldFiberByKey = oldFibersMapByKey.get(oldFiberKey);
        const oldFiberSeq = oldFibers[newElementIndex];
        const isSameTypeByKey = oldFiberByKey?.type === childElement?.type;
        const isSameElementByKey = oldFiberByKey?.fromElement === childElement;

        // Same node, update props.
        if (oldFiberByKey && childElement && isSameTypeByKey) {
            // TODO: This is mutating an existing fiber in current tree,
            // need to figure out how to handle this better.
            if (isSameElementByKey) {
                oldFiberByKey.effectTag = EffectTag.skip;
                oldFiberByKey.didChangePos = oldFiberSeq !== oldFiberByKey;
                oldFiberByKey.parent = wipFiberParent;
                newFiber = oldFiberByKey;
            } else {
                newFiber = getNewFiber();
                newFiber.type = childElement.type;
                newFiber.parent = wipFiberParent;
                newFiber.alternate = oldFiberByKey;
                newFiber.dom = oldFiberByKey.dom;
                newFiber.hooks = oldFiberByKey.hooks;
                newFiber.effectTag = EffectTag.update;
                newFiber.didChangePos = oldFiberSeq !== oldFiberByKey;
                newFiber.props = childElement.props;
                newFiber.version = oldFiberByKey.version + 1;
                newFiber.fromElement = childElement;
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

        // Only store 2 levels. Edge case, fibers are reused when elements are memoized.
        if (!!oldFiberByKey && oldFiberByKey !== newFiber) {
            oldFiberByKey.alternate = undefined;
            oldFiberByKey.isAlternate = true;
        }

        // Connect siblings.
        if (newElementIndex === 0) {
            wipFiberParent.child = newFiber;
        } else if (prevSibling) {
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
        fiber.isAlternate = true;
        fiber.effectTag = EffectTag.delete;
        deletions.push(fiber);
    }
}
