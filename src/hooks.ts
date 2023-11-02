export enum HookTypes {
    state,
}

export type StateHook<T> = {
    type: HookTypes.state;
    value: T;
    setter: (value: T | ((prev: T) => T)) => void;
};

export type Hooks = StateHook<any>[];

/**
 * Currently processed hooks. Should be set before component's render.
 */
const current: {
    /**
     * Reference to components hooks.
     */
    hooks: Hooks;
    /**
     * Callback to collect hook actions.
     */
    scheduleAction: (callback: () => void) => void;
} = {
    hooks: [],
    scheduleAction: () => {},
};

/**
 * Index of currently executing hook within a component.
 */
let hookIndex = 0;

/**
 * Starts to record hooks for a particular component.
 * @param hooks - reference to the hooks array of the component.
 * @param scheduleAction - callback to schedule the current user action from the hook.
 */
export function initHooks(hooks: Hooks, scheduleAction: (callback: () => void) => void) {
    current.hooks = hooks;
    current.scheduleAction = scheduleAction;
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

    const scheduleAction = current.scheduleAction;
    const newHook = {
        type: HookTypes.state,
        value: initState,
    } as StateHook<T>;

    function setter(value: Parameters<StateHook<T>['setter']>[0]) {
        scheduleAction(() => {
            if (value instanceof Function) {
                newHook.value = value(newHook.value);
            } else {
                newHook.value = value;
            }
        });
    }

    newHook.setter = setter;
    current.hooks.push(newHook);
    hookIndex++;

    return [newHook.value, newHook.setter];
}
