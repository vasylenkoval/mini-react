export enum HookTypes {
    state,
    effect,
    memo,
}

export type StateHook<T> = {
    type: HookTypes.state;
    notify: () => void;
    value: T;
    next?: { value: T };
    setter: (value: T | ((prev: T) => T)) => void;
};

export type EffectHook = {
    type: HookTypes.effect;
    cleanup?: () => void;
    deps?: unknown[];
};

export type MemoHook<T> = {
    type: HookTypes.memo;
    value: T;
    deps?: unknown[];
};

export type Hooks = (StateHook<any> | MemoHook<any> | EffectHook)[];
export type CleanupFunc = () => void;
export type EffectFunc = () => void | CleanupFunc;

/**
 * State for currently processed hooks. Reset right before the component's render.
 */
const current: {
    hooks: Hooks;
    notifyOnStateChange: () => void;
    scheduleEffect: (effect: EffectFunc, prevCleanup?: CleanupFunc) => void;
} = {
    hooks: [],
    notifyOnStateChange: () => {},
    scheduleEffect: () => {},
};

/**
 * Index of currently executing hook within a component.
 * Starts with -1, each hook will increment this value in the beginning.
 */
let hookIndex = -1;

/**
 * Starts to record hooks for a component.
 * @param hooks - Reference to the hooks array of the component.
 * @param notifyOnStateChange - Callback for when the state hook setters are called.
 * @param scheduleEffect - Callback for when the effect needs to be scheduled.
 */
export function processHooks(
    hooks: typeof current.hooks,
    notifyOnStateChange: typeof current.notifyOnStateChange,
    scheduleEffect: typeof current.scheduleEffect
) {
    // Flush state updates
    for (const hook of hooks) {
        if (hook.type === HookTypes.state && hook.next) {
            hook.value = hook.next.value;
            hook.next = undefined;
        }
    }
    current.hooks = hooks;
    current.notifyOnStateChange = notifyOnStateChange;
    current.scheduleEffect = scheduleEffect;
    hookIndex = -1;
}

/**
 * Stores state within the component.
 * @param initState
 * @returns Current value and a setter.
 */
export function useState<T>(
    initState: T | (() => T)
): [StateHook<T>['value'], StateHook<T>['setter']] {
    hookIndex++;
    const oldHook = current.hooks[hookIndex] as StateHook<T>;
    if (oldHook) {
        oldHook.notify = current.notifyOnStateChange;
        return [oldHook.value, oldHook.setter];
    }

    const hook: StateHook<T> = {
        type: HookTypes.state,
        notify: current.notifyOnStateChange,
        value: typeof initState === 'function' ? (initState as () => T)() : initState,
        setter(value) {
            let lastValue = hook.next ? hook.next.value : hook.value;
            let setterFn = typeof value === 'function' ? (value as (prev: T) => T) : undefined;
            let nextValue = setterFn ? setterFn(lastValue) : (value as T);
            if (nextValue === lastValue) return;
            hook.next = { value: nextValue };
            hook.notify();
        },
    };

    current.hooks.push(hook);
    return [hook.value, hook.setter];
}

/**
 * Helper to collect all effect cleanup functions from the hooks array.
 * @TODO: separate effects and state from a single hooks array?
 * @param hooks - Hooks array to collect effect cleanups from.
 * @param cleanups - Reference to the array to collect the cleanups in.
 */
export function collectEffectCleanups(hooks: Hooks, cleanups: CleanupFunc[]) {
    for (let hook of hooks) {
        if (hook.type === HookTypes.effect && hook.cleanup) {
            cleanups.push(hook.cleanup);
        }
    }
}

/**
 * Runs the effect and stores the cleanup function returned on the same hook.
 * @param effect - Effect to run.
 * @param hook - Hook to store the cleanup function on.
 */
function executeEffect(effect: EffectFunc, hook: EffectHook) {
    const cleanup = effect();
    if (typeof cleanup === 'function') {
        hook.cleanup = cleanup;
    }
}

/**
 * Compares if new hook deps are equal to the prev deps.
 * If deps array is missing this function will return false.
 * @param newDeps - new hook deps.
 * @param prevDeps - previous hook deps.
 * @returns True if dependencies are equal.
 */
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
    hookIndex++;
    const scheduleEffect = current.scheduleEffect;
    const oldHook = current.hooks[hookIndex] as EffectHook;
    if (oldHook) {
        if (!areDepsEqual(deps, oldHook.deps)) {
            scheduleEffect(() => executeEffect(effect, oldHook), oldHook.cleanup);
            oldHook.deps = deps;
        }
        return;
    }

    const hook: EffectHook = {
        type: HookTypes.effect,
        deps,
    };

    current.hooks.push(hook);
    scheduleEffect(() => executeEffect(effect, hook));
}

/**
 * Remembers the value returned from the callback passed.
 * Returns the same value between renders if dependencies haven't changed.
 * @param valueFn -
 * @param deps -
 */
export function useMemo<T>(valueFn: () => T, deps: unknown[]) {
    hookIndex++;
    const oldHook = current.hooks[hookIndex] as MemoHook<T>;
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
