export var HookTypes;
(function (HookTypes) {
    HookTypes[HookTypes["state"] = 0] = "state";
    HookTypes[HookTypes["effect"] = 1] = "effect";
    HookTypes[HookTypes["ref"] = 2] = "ref";
    HookTypes[HookTypes["memo"] = 3] = "memo";
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
    // Flush state updates
    for (const hook of hooks) {
        if (hook.type === HookTypes.state && hook.pending) {
            hook.value = hook.pending.value;
            hook.pending = undefined;
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
        oldHook.notify = current.notifyOnStateChange;
        return [oldHook.value, oldHook.setter];
    }
    const hook = {
        type: HookTypes.state,
        notify: current.notifyOnStateChange,
        value: typeof initState === 'function' ? initState() : initState,
        setter(value) {
            let lastValue = hook.pending ? hook.pending.value : hook.value;
            let setterFn = typeof value === 'function' ? value : undefined;
            let pendingValue = setterFn ? setterFn(lastValue) : value;
            if (pendingValue === lastValue)
                return;
            hook.pending = { value: pendingValue };
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
export function collectEffectCleanups(hooks) {
    let cleanupFuncs;
    for (let hook of hooks) {
        if (hook.type === HookTypes.effect && hook.cleanup) {
            (cleanupFuncs ?? (cleanupFuncs = [])).push(hook.cleanup);
        }
    }
    return cleanupFuncs;
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
            scheduleEffect(() => executeEffect(effect, oldHook), oldHook.cleanup ?? null);
            oldHook.deps = deps;
        }
        return;
    }
    const hook = {
        type: HookTypes.effect,
        deps,
    };
    current.hooks.push(hook);
    scheduleEffect(() => executeEffect(effect, hook), null);
}
/**
 * Remembers the value returned from the callback passed.
 * Returns the same value between renders if dependencies haven't changed.
 * @param valueFn - Callback to run to get the value.
 * @param deps - Array of dependencies to compare with the previous run.
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
/**
 * Remembers the value passed and returns a mutable ref object.
 * @param init - Initial value to store in the ref.
 */
export function useRef(initialValue) {
    hookIndex++;
    const oldHook = current.hooks[hookIndex];
    if (oldHook) {
        return oldHook.value;
    }
    const hook = {
        type: HookTypes.ref,
        value: { current: initialValue },
    };
    current.hooks.push(hook);
    return hook.value;
}
/**
 *  Alternative to useState for more complex state management.
 * @param reducer - Function to handle state changes.
 * @param initStateOrArg - Argument for the initialization function or initial state.
 * @param initFn - Function to initialize the state.
 */
export function useReducer(reducer, initStateOrArg, initFn) {
    const ref = useRef({
        dispatch: undefined,
        initState: initFn ? initFn(initStateOrArg) : initStateOrArg,
    });
    const [state, setState] = useState(ref.current.initState);
    if (ref.current.dispatch) {
        return [state, ref.current.dispatch];
    }
    function dispatch(action) {
        setState((prevState) => reducer(prevState, action));
    }
    ref.current.dispatch = dispatch;
    return [state, dispatch];
}
