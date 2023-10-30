enum HookTypes {
    state,
}

type StateHook<T> = {
    type: HookTypes.state;
    value: T;
    setter: (value: T | ((prev: T) => T)) => void;
};

type Hooks = StateHook<any>[];

/**
 * Currently processed hooks. Should be set before component's render.
 */
const ref: {
    hooks: Hooks;
} = {
    hooks: [],
};

let hookIndex = 0;

/**
 * Starts processing hooks for a component.
 * @param hooks - reference to the hooks array of the component.
 */
function initHooks(hooks: Hooks) {
    ref.hooks = hooks;
    hookIndex = 0;
}

// function useState<T>(initState: T): [StateHook<T>['value'], StateHook<T>['setter']] {
//     hookIndex++;
//     const hook = ref.hooks[hookIndex] as StateHook<T>;
//     if (hook) {
//         return [hook.value, hook.setter];
//     }

//     const newHook = {
//         type: HookTypes.state,
//         value: initState,
//     } as StateHook<T>;

//     function setter(value: Parameters<StateHook<T>['setter']>[0]) {
//         if (value instanceof Function) {
//             newHook.value = value(newHook.value);
//         } else {
//             newHook.value = value;
//         }
//     }

//     newHook.setter = setter;
//     ref.hooks.push(newHook);
//     return [initState, setter];
// }
