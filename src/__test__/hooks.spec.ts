import { startHooks, useState, useReducer, Hooks } from '../hooks';

const emptyFn = () => undefined;

// Helper to be able to mount/unmount/rerender a hook
const runHook = <TProps, TResult>(
    hook: (props: TProps) => TResult,
    options?: { props: TProps }
) => {
    const hooks: Hooks = [];
    const props = options?.props as TProps;

    const render = (props?: TProps) => {
        startHooks(hooks, null, emptyFn);
        return { value: hook(props!), hooks };
    };

    return {
        value: render(props).value,
        render,
        hooks,
    };
};

describe('useState', () => {
    it('should mount and verify output', () => {
        /* Arrange */
        const test1 = 'Test 1';
        const test2 = 'Test 2';

        const useTest = (value1: string, value2: string) => {
            const hook1 = useState({ value: value1 });
            const hook2 = useState({ value: value2 });
            return [hook1, hook2];
        };

        /* Act */
        const { value: mountVal, hooks: mountHooks, render } = runHook(() => useTest(test1, test2));
        const mountHooksLen = mountHooks.length;

        const { value: renderVal, hooks: renderHooks } = render();
        const renderHooksLen = renderHooks.length;

        /* Assert */
        expect(mountHooksLen).toEqual(renderHooksLen);
        expect(renderHooksLen).toEqual(2);

        // values and setters should remain the same
        expect(
            mountVal[0][0] === renderVal[0][0] &&
                mountVal[0][1] === renderVal[0][1] &&
                mountVal[1][0] === renderVal[1][0] &&
                mountVal[1][1] === renderVal[1][1]
        ).toEqual(true);

        // expect string values to be the same
        expect(renderVal[0][0].value).toEqual(test1);
        expect(renderVal[1][0].value).toEqual(test2);
    });

    it('should init a value with a func', () => {
        /* Arrange */
        const initValue = 'test';
        const initFn = () => initValue;

        /* Act */
        const { value: mountValue, render } = runHook(({ initFn }) => useState(initFn)[0], {
            props: { initFn },
        });

        // should not re-run on re-render
        const { value: renderValue } = render({ initFn: () => 'changed' });

        /* Assert */
        expect(mountValue).toEqual(renderValue);
        expect(mountValue).toEqual(initValue);
    });
});

describe('useReducer', () => {
    it('should mount with initial state and verify output', () => {
        /* Arrange */
        const initialState = { count: 0 };
        const reducer = (state: { count: number }, action: { type: 'increment' | 'decrement' }) => {
            switch (action.type) {
                case 'increment':
                    return { count: state.count + 1 };
                case 'decrement':
                    return { count: state.count - 1 };
                default:
                    return state;
            }
        };

        /* Act */
        const { value: mountVal, render } = runHook(() => useReducer(reducer, initialState));
        const dispatch = mountVal[1];
        const mountState = mountVal[0];

        const { value: renderVal } = render();
        const renderState = renderVal[0];
        const renderDispatch = renderVal[1];

        /* Assert */
        expect(mountState).toEqual(initialState);
        expect(mountState).toEqual(renderState);
        expect(dispatch).toEqual(renderDispatch);

        /** Act 2 */
        dispatch({ type: 'increment' });
        dispatch({ type: 'increment' });
        const { value: incrementedVal } = render();

        dispatch({ type: 'decrement' });
        const { value: decrementedVal } = render();

        /* Assert 2 */
        expect(incrementedVal[0].count).toEqual(2);
        expect(decrementedVal[0].count).toEqual(1);
    });
});
