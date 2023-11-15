export var HookTypes;
(function (HookTypes) {
    HookTypes[HookTypes["state"] = 0] = "state";
    HookTypes[HookTypes["effect"] = 1] = "effect";
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
 */
let hookIndex = 0;
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
    hookIndex = 0;
}
/**
 * Stores state within the component.
 * @param initState
 * @returns Current value and a setter.
 */
export function useState(initState) {
    const oldHook = current.hooks[hookIndex];
    if (oldHook) {
        hookIndex++;
        return [oldHook.value, oldHook.setter];
    }
    // By the time the hook setter will be called the current references will change.
    const notifyOnStateChange = current.notifyOnStateChange;
    const hook = {
        type: HookTypes.state,
        value: initState,
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
    hookIndex++;
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
 * Schedules effects to run after the component is rendered.
 * @param effect - Effect function to run. Can return an optional cleanup to run before re-execution or unmount.
 * @param deps - Array of dependencies for the effect. Effect will be re-run when these change.
 */
export function useEffect(effect, deps) {
    const scheduleEffect = current.scheduleEffect;
    const oldHook = current.hooks[hookIndex];
    if (oldHook) {
        if (!deps ||
            (deps &&
                oldHook.deps &&
                deps.length === oldHook.deps.length &&
                deps.some((dep, index) => { var _a; return dep !== ((_a = oldHook.deps) === null || _a === void 0 ? void 0 : _a[index]); }))) {
            scheduleEffect(() => executeEffect(effect, oldHook), oldHook.cleanup);
            oldHook.deps = deps;
        }
        hookIndex++;
        return;
    }
    const hook = {
        type: HookTypes.effect,
        deps,
    };
    scheduleEffect(() => executeEffect(effect, hook));
    current.hooks.push(hook);
    hookIndex++;
}
