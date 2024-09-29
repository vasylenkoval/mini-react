/** @jsx jsx */
import { createRoot } from '../fiber';
import { useMemo, useState } from '../hooks';
import { FC, jsx, JSXElement } from '../jsx';
import { memo } from '../memo';

describe('memo', () => {
    it('should not re-render if no props', () => {
        /* Arrange */
        const rootElement = document.createElement('div');

        let childRenders = 0;
        const Child = () => {
            childRenders++;
            return <div>1</div>;
        };

        const MemoChild = memo(Child);

        let rerender = () => {};
        const Parent = () => {
            const [, setCount] = useState(0);
            rerender = () => setCount((count) => ++count);
            return (
                <div>
                    <MemoChild />
                </div>
            );
        };

        /* Act */
        createRoot(rootElement, <Parent />);
        rerender();
        rerender();

        /* Assert */
        expect(childRenders).toEqual(1);
    });

    it('should re-render when props change', () => {
        /* Arrange */
        const rootElement = document.createElement('div');

        let childRenders = 0;
        const Child = ({ count }: { count: number }) => {
            childRenders++;
            return <div>1</div>;
        };

        const MemoChild = memo(Child);

        // re-renders both parent/child
        let rerender = () => {};
        // re-renders parent but not child
        let rerender2 = () => {};

        const Parent = () => {
            const [count, setCount] = useState(0);
            const [, setCount2] = useState(0);
            rerender = () => setCount((count) => ++count);
            rerender2 = () => setCount2((count) => ++count);

            return (
                <div>
                    <MemoChild count={count} />
                </div>
            );
        };
        /* Act */
        createRoot(rootElement, <Parent />);

        rerender();
        rerender();
        rerender2();

        /* Assert */
        expect(childRenders).toEqual(3);
    });

    it('should use custom compare function', () => {
        /* Arrange */
        const rootElement = document.createElement('div');

        let childRenders = 0;
        const Child = ({ count }: { count: number }) => {
            childRenders++;
            return <div>1</div>;
        };

        const MemoChild = memo(Child, (prevProps, nextProps) => {
            return nextProps.count === 0 || prevProps.count === 0;
        });

        let rerender: () => void = () => undefined;

        const Parent = () => {
            const [count, setCount] = useState(0);
            rerender = () => setCount((count) => ++count);

            return (
                <div>
                    <MemoChild count={count} />
                </div>
            );
        };
        /* Act */
        createRoot(rootElement, <Parent />);

        rerender();
        rerender();

        /* Assert */
        expect(childRenders).toEqual(1);
    });

    it('child should re-render on state change', () => {
        /* Arrange */
        const rootElement = document.createElement('div');

        let childRenders = 0;
        let rerenderChild = () => {};
        const Child = () => {
            const [, setCount] = useState(0);
            rerenderChild = () => setCount((count) => ++count);
            childRenders++;
            return <div>1</div>;
        };

        const MemoChild = memo(Child);

        const Parent = () => {
            return (
                <div>
                    <MemoChild />
                </div>
            );
        };

        /* Act */
        createRoot(rootElement, <Parent />);
        rerenderChild();
        rerenderChild();

        /* Assert */
        expect(childRenders).toEqual(3);
    });

    it('should re-render only 1 row', () => {
        /* Arrange */
        const rootElement = document.createElement('div');

        let childRenders: Record<string, number> = {};
        const Row = (props: { id: string; key: string | number; value: string }) => {
            childRenders[props.id] = (childRenders[props.id] || 0) + 1;
            return <div>{props.value}</div>;
        };

        const MemoRow = memo(Row);

        let setValues = (values: { id: string; value: string }[]) => {};
        const List = () => {
            const [state, setState] = useState([
                { id: '1', value: 'foo' },
                { id: '2', value: 'bar' },
                { id: '3', value: 'baz' },
            ]);
            setValues = (values) => setState(values);
            return (
                <div>
                    {state.map((item) => (
                        <MemoRow key={item.id} id={item.id} value={item.value} />
                    ))}
                </div>
            );
        };

        /* Act */
        createRoot(rootElement, <List />);
        setValues([
            { id: '1', value: 'foo' },
            { id: '2', value: 'bar' },
            { id: '3', value: 'baz' },
        ]);
        setValues([
            { id: '1', value: 'foo' },
            { id: '2', value: 'test' },
            { id: '3', value: 'baz' },
        ]);

        /* Assert */
        expect(childRenders['1']).toEqual(1);
        expect(childRenders['2']).toEqual(2);
        expect(childRenders['3']).toEqual(1);
    });
});
