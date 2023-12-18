export var HookTypes;
(function (HookTypes) {
    HookTypes[HookTypes["state"] = 0] = "state";
    HookTypes[HookTypes["effect"] = 1] = "effect";
    HookTypes[HookTypes["memo"] = 2] = "memo";
})(HookTypes || (HookTypes = {}));
/**
 * State for currently processed hooks. Reset right before the component's render.
 */
const current = {
    hooks: [],
    notifyOnStateChange: () => { },
    scheduleEffect: () => { },
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
export function processHooks(hooks, notifyOnStateChange, scheduleEffect) {
    // Flush state queues.
    for (const hook of hooks) {
        if ('queue' in hook) {
            for (const action of hook.queue)
                action();
            hook.queue.splice(0);
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
export function useState(initState) {
    hookIndex++;
    const oldHook = current.hooks[hookIndex];
    if (oldHook) {
        return [oldHook.value, oldHook.setter];
    }
    // By the time the hook setter will be called the current references will change.
    const notifyOnStateChange = current.notifyOnStateChange;
    const hook = {
        type: HookTypes.state,
        value: typeof initState === 'function' ? initState() : initState,
        queue: [],
        setter(value) {
            let newValue;
            if (typeof value === 'function') {
                newValue = value(hook.value);
            }
            else {
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
    return [hook.value, hook.setter];
}
/**
 * Helper to collect all effect cleanup functions from the hooks array.
 * @TODO: separate effects and state from a single hooks array?
 * @param hooks - Hooks array to collect effect cleanups from.
 * @param cleanups - Reference to the array to collect the cleanups in.
 */
export function collectEffectCleanups(hooks, cleanups) {
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
function executeEffect(effect, hook) {
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
function areDepsEqual(newDeps, prevDeps) {
    if (!newDeps || !prevDeps) {
        return false;
    }
    return (newDeps.length === prevDeps.length &&
        (newDeps.length === 0 || newDeps.every((newDep, index) => newDep === prevDeps[index])));
}
/**
 * Schedules effects to run after the component is rendered.
 * @param effect - Effect function to run. Can return an optional cleanup to run before re-execution or unmount.
 * @param deps - Array of dependencies for the effect. Effect will be re-run when these change.
 */
export function useEffect(effect, deps) {
    hookIndex++;
    const scheduleEffect = current.scheduleEffect;
    const oldHook = current.hooks[hookIndex];
    if (oldHook) {
        if (!areDepsEqual(deps, oldHook.deps)) {
            scheduleEffect(() => executeEffect(effect, oldHook), oldHook.cleanup);
            oldHook.deps = deps;
        }
        return;
    }
    const hook = {
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
export function useMemo(valueFn, deps) {
    hookIndex++;
    const oldHook = current.hooks[hookIndex];
    if (oldHook) {
        if (!areDepsEqual(deps, oldHook.deps)) {
            oldHook.deps = deps;
            oldHook.value = valueFn();
        }
        return oldHook.value;
    }
    const hook = {
        type: HookTypes.memo,
        deps,
        value: valueFn(),
    };
    current.hooks.push(hook);
    return hook.value;
}
