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
    node: null,
    hooks: [],
    notify: () => { },
};
/**
 * Index of currently executing hook within a component.
 * Starts with -1, each hook will increment this value in the beginning.
 */
let hookIndex = 0;
/**
 * Starts to record hooks for a component.
 * @param hooks - Reference to the hooks array of the component.
 * @param notify - Callback for when the state hook setters are called.
 */
export function startHooks(hooks, node, notify) {
    current.hooks = hooks;
    current.node = node;
    current.notify = notify;
    hookIndex = 0;
}
export function finishHooks(hooks, effects, cleanups) {
    // Leaf fibers run their effects first in the order they were inside of the component.
    // We maintain a single global array of all effects and by the end of the commit phase
    // we will execute all effects one-by-one starting from the end of that array. Because
    // we still need want to preserve the call order we need to reverse the effects here
    // ahead of time.
    for (let i = hooks.length - 1; i >= 0; i--) {
        const hook = hooks[i];
        if (hook.type === HookTypes.effect) {
            if (hook.effect !== null) {
                effects.push(hook.effect);
                hook.effect = null;
            }
            if (hook.cleanup !== null && hook.changed) {
                cleanups.push(hook.cleanup);
                hook.cleanup = null;
                hook.changed = false;
            }
        }
    }
}
/**
 * Stores state within the component.
 * @param initState
 * @returns Current value and a setter.
 */
export function useState(initState) {
    const oldHook = current.hooks[hookIndex++];
    if (oldHook) {
        oldHook.node = current.node;
        return [oldHook.value, oldHook.setter];
    }
    const hook = {
        type: HookTypes.state,
        node: current.node,
        value: typeof initState === 'function' ? initState() : initState,
        setter(value) {
            let prev = hook.value;
            let setterFn = typeof value === 'function' ? value : undefined;
            let updated = setterFn ? setterFn(prev) : value;
            if (prev === updated)
                return;
            hook.value = updated;
            current.notify(hook.node);
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
export function collectEffectCleanups(hooks) {
    let cleanups;
    for (let hook of hooks) {
        if (hook.type === HookTypes.effect && hook.cleanup) {
            (cleanups ?? (cleanups = [])).push(hook.cleanup);
            hook.cleanup = null;
        }
    }
    return cleanups;
}
async function executeEffect(effect, hook) {
    const cleanup = effect();
    if (typeof cleanup === 'function') {
        hook.cleanup = cleanup;
    }
}
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
    const oldHook = current.hooks[hookIndex++];
    if (oldHook) {
        if (!areDepsEqual(deps, oldHook.deps)) {
            oldHook.changed = true;
            oldHook.effect = () => executeEffect(effect, oldHook);
            oldHook.deps = deps;
        }
        return;
    }
    const hook = {
        type: HookTypes.effect,
        deps,
        effect: () => executeEffect(effect, hook),
        cleanup: null,
        changed: false,
    };
    current.hooks.push(hook);
}
/**
 * Remembers the value returned from the callback passed.
 * Returns the same value between renders if dependencies haven't changed.
 * @param valueFn - Callback to run to get the value.
 * @param deps - Array of dependencies to compare with the previous run.
 */
export function useMemo(valueFn, deps) {
    const oldHook = current.hooks[hookIndex++];
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
    const oldHook = current.hooks[hookIndex++];
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
