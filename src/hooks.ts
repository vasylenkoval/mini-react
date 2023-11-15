export enum HookTypes {
    state,
    effect,
}

export type StateHook<T> = {
    type: HookTypes.state;
    value: T;
    setter: (value: T | ((prev: T) => T)) => void;
    queue: (() => void)[];
};

export type EffectHook = {
    type: HookTypes.effect;
    cleanup?: () => void;
    deps?: unknown[];
};

export type Hooks = (StateHook<any> | EffectHook)[];
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
 */
let hookIndex = 0;

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
    // Flush state queues.
    for (const hook of hooks) {
        if ('queue' in hook) {
            for (const action of hook.queue) action();
            hook.queue.splice(0);
        }
    }
    current.hooks = hooks;
    current.notifyOnStateChange = notifyOnStateChange;
    current.scheduleEffect = scheduleEffect;
    hookIndex = 0;
}

/**
 * Stores state within the component.
 * @param initState
 * @returns Current value and a setter.
 */
export function useState<T>(initState: T): [StateHook<T>['value'], StateHook<T>['setter']] {
    const oldHook = current.hooks[hookIndex] as StateHook<T>;
    if (oldHook) {
        hookIndex++;
        return [oldHook.value, oldHook.setter];
    }

    // By the time the hook setter will be called the current references will change.
    const notifyOnStateChange = current.notifyOnStateChange;

    const hook: StateHook<T> = {
        type: HookTypes.state,
        value: initState,
        queue: [] as (() => void)[],
        setter(value) {
            let newValue: T;
            if (typeof value === 'function') {
                newValue = (value as (prev: T) => T)(hook.value);
            } else {
                newValue = value;
            }

            if (newValue !== hook.value) {
                hook.queue.push(() => {
                    hook.value = newValue;
                });
                notifyOnStateChange();
            }
        },
    };

    current.hooks.push(hook);
    hookIndex++;
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
 * Schedules effects to run after the component is rendered.
 * @param effect - Effect function to run. Can return an optional cleanup to run before re-execution or unmount.
 * @param deps - Array of dependencies for the effect. Effect will be re-run when these change.
 */
export function useEffect(effect: EffectFunc, deps?: unknown[]) {
    const scheduleEffect = current.scheduleEffect;
    const oldHook = current.hooks[hookIndex] as EffectHook;
    if (oldHook) {
        if (
            !deps ||
            (deps &&
                oldHook.deps &&
                deps.length === oldHook.deps.length &&
                deps.some((dep, index) => dep !== oldHook.deps?.[index]))
        ) {
            scheduleEffect(() => executeEffect(effect, oldHook), oldHook.cleanup);
            oldHook.deps = deps;
        }
        hookIndex++;
        return;
    }

    const hook: EffectHook = {
        type: HookTypes.effect,
        deps,
    };
    scheduleEffect(() => executeEffect(effect, hook));
    current.hooks.push(hook);
    hookIndex++;
}
