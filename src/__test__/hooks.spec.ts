import { processHooks, useState, Hooks } from '../hooks';

const emptyFn = () => undefined;

// Helper to be able to mount/unmount/rerender a hook
const runHook = <TProps, TResult>(
    hook: (props: TProps) => TResult,
    options?: { props: TProps }
) => {
    const hooks: Hooks = [];
    const props = options?.props as TProps;

    const render = (props?: TProps) => {
        processHooks(hooks, emptyFn, emptyFn);
        return { value: hook(props!), hooks };
    };

    return {
        value: render(props).value,
        render,
        hooks,
    };
};

describe('useState', () => {
    it('should be able to mount a hook and re-render', () => {
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

    it('should be able to init value with a func', () => {
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
