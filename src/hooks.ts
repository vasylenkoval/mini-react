export enum HookTypes {
    state,
    effect,
    ref,
    memo,
}

export type StateHook<T> = {
    type: HookTypes.state;
    node: unknown;
    value: T;
    setter: (value: T | ((prev: T) => T)) => void;
};

export type EffectHook = {
    type: HookTypes.effect;
    cleanup: (() => void) | null;
    effect: (() => void) | null;
    deps?: unknown[];
};

export type RefHook<T> = {
    type: HookTypes.ref;
    value: { current: T };
};

export type MemoHook<T> = {
    type: HookTypes.memo;
    value: T;
    deps?: unknown[];
};

export type Hooks = (StateHook<any> | MemoHook<any> | RefHook<any> | EffectHook)[];
export type CleanupFunc = () => void;
export type EffectFunc = () => void | CleanupFunc;

export const HooksDispatcher: {
    onUpdate: (node: unknown) => void;
} = {
    onUpdate: function (_: unknown) {},
};

const EMPTY_HOOKS: Hooks = [];

/**
 * State for currently processed hooks. Reset right before the component's render.
 */
const current: {
    node: unknown;
    hooks: Hooks;
} = {
    node: null,
    hooks: EMPTY_HOOKS,
};

/**
 * Index of currently executing hook within a component.
 * Starts with -1, each hook will increment this value in the beginning.
 */
let hookIndex = 0;

/**
 * Starts to record hooks for a component.
 * @param hooks - Reference to the hooks array of the node.
 * @param node - Reference to the current node.
 */
export function startHooks(hooks: typeof current.hooks, node: typeof current.node) {
    current.hooks = hooks;
    current.node = node;
    hookIndex = 0;
}

export function finishHooks(hooks: Hooks, effects: (() => void)[], cleanups: (() => void)[]) {
    // Leaf fibers run their effects first in the order they were inside of the component.
    // We maintain a single global array of all effects and by the end of the commit phase
    // we will execute all effects one-by-one starting from the end of that array. Because
    // we still want to preserve the call order we need to reverse the effects here
    // ahead of time.
    for (let i = hooks.length - 1; i >= 0; i--) {
        const hook = hooks[i];
        if (hook.type === HookTypes.effect) {
            if (hook.effect !== null) {
                effects.push(hook.effect);
                hook.effect = null;
                if (hook.cleanup !== null) {
                    cleanups.push(hook.cleanup);
                    hook.cleanup = null;
                }
            }
        }
    }

    current.hooks = EMPTY_HOOKS;
    current.node = null;
}

/**
 * Stores state within the component.
 * @param initState
 * @returns Current value and a setter.
 */
export function useState<T>(
    initState: T | (() => T)
): [StateHook<T>['value'], StateHook<T>['setter']] {
    const oldHook = current.hooks[hookIndex++] as StateHook<T>;
    if (oldHook) {
        oldHook.node = current.node;
        return [oldHook.value, oldHook.setter];
    }

    const hook: StateHook<T> = {
        type: HookTypes.state,
        node: current.node,
        value: typeof initState === 'function' ? (initState as () => T)() : initState,
        setter(value) {
            let prev = hook.value;
            let setterFn = typeof value === 'function' ? (value as (prev: T) => T) : undefined;
            let updated = setterFn ? setterFn(prev) : (value as T);
            if (prev === updated) return;
            hook.value = updated;
            HooksDispatcher.onUpdate(hook.node);
        },
    };

    current.hooks.push(hook);
    return [hook.value, hook.setter];
}

/**
 * Helper to collect all effect cleanup functions from the hooks array.
 * @param hooks - Hooks array to collect effect cleanups from.
 * @param cleanups - Reference to the array to collect the cleanups in.
 */
export function collectEffectCleanups(hooks: Hooks) {
    let cleanups: CleanupFunc[] | undefined;
    for (let hook of hooks) {
        if (hook.type === HookTypes.effect && hook.cleanup) {
            (cleanups ?? (cleanups = [])).push(hook.cleanup);
            hook.cleanup = null;
        }
    }
    return cleanups;
}

function executeEffect(effect: EffectFunc, hook: EffectHook) {
    const cleanup = effect();
    if (typeof cleanup === 'function') {
        hook.cleanup = cleanup;
    }
}

function areDepsEqual(newDeps?: unknown[], prevDeps?: unknown[]): boolean {
    if (!newDeps || !prevDeps) {
        return false;
    }

    return (
        newDeps.length === prevDeps.length &&
        (newDeps.length === 0 || newDeps.every((newDep, index) => newDep === prevDeps[index]))
    );
}

/**
 * Schedules effects to run after the component is rendered.
 * @param effect - Effect function to run. Can return an optional cleanup to run before re-execution or unmount.
 * @param deps - Array of dependencies for the effect. Effect will be re-run when these change.
 */
export function useEffect(effect: EffectFunc, deps?: unknown[]) {
    const oldHook = current.hooks[hookIndex++] as EffectHook;
    if (oldHook) {
        if (!areDepsEqual(deps, oldHook.deps)) {
            oldHook.effect = () => executeEffect(effect, oldHook);
            oldHook.deps = deps;
        }
        return;
    }

    const hook: EffectHook = {
        type: HookTypes.effect,
        deps,
        effect: () => executeEffect(effect, hook),
        cleanup: null,
    };

    current.hooks.push(hook);
}

/**
 * Remembers the value returned from the callback passed.
 * Returns the same value between renders if dependencies haven't changed.
 * @param valueFn - Callback to run to get the value.
 * @param deps - Array of dependencies to compare with the previous run.
 */
export function useMemo<T>(valueFn: () => T, deps: unknown[]): T {
    const oldHook = current.hooks[hookIndex++] as MemoHook<T>;
    if (oldHook) {
        if (!areDepsEqual(deps, oldHook.deps)) {
            oldHook.deps = deps;
            oldHook.value = valueFn();
        }
        return oldHook.value;
    }

    const hook: MemoHook<T> = {
        type: HookTypes.memo,
        deps,
        value: valueFn(),
    };

    current.hooks.push(hook);
    return hook.value;
}

/**
 * Remembers the value passed and returns a mutable ref object.
 * @param init - Initial value to store in the ref.
 */
export function useRef<T>(initialValue: T): { current: T } {
    const oldHook = current.hooks[hookIndex++] as RefHook<T>;
    if (oldHook) {
        return oldHook.value;
    }

    const hook: RefHook<T> = {
        type: HookTypes.ref,
        value: { current: initialValue },
    };

    current.hooks.push(hook);
    return hook.value;
}

export type Reducer<S, A> = (state: S, action: A) => S;
export type Dispatch<A> = (action: A) => void;

/**
 *  Alternative to useState for more complex state management.
 * @param reducer - Function to handle state changes.
 * @param initStateOrArg - Argument for the initialization function or initial state.
 * @param initFn - Function to initialize the state.
 */
export function useReducer<TState, TAction, TInitArg>(
    reducer: Reducer<TState, TAction>,
    initStateOrArg: TInitArg | TState,
    initFn?: (arg: TInitArg | TState) => TState
): [TState, Dispatch<TAction>] {
    const ref = useRef<{ dispatch: Dispatch<TAction> | undefined; initState: TState }>({
        dispatch: undefined,
        initState: initFn ? initFn(initStateOrArg) : (initStateOrArg as TState),
    });
    const [state, setState] = useState(ref.current.initState);
    if (ref.current.dispatch) {
        return [state, ref.current.dispatch];
    }
    function dispatch(action: TAction) {
        setState((prevState) => reducer(prevState, action));
    }
    ref.current.dispatch = dispatch;
    return [state, dispatch];
}
