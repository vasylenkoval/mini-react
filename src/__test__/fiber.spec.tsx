/** @jsx jsx */
import { createRoot } from '../fiber';
import { useMemo, useState, useEffect } from '../hooks';
import { jsx, JSXElement } from '../jsx';
import { memo } from '../memo';

describe('fiber', () => {
    it('should render a simple app', () => {
        /* Arrange */
        const rootElement = document.createElement('div');

        const Message = ({ message }: { message: string }) => {
            return (
                <div>
                    <p>{message}</p>
                </div>
            );
        };

        const App = ({ messages }: { messages: string[] }) => {
            return (
                <div>
                    Test App
                    {messages.map((message) => (
                        <Message message={message} />
                    ))}
                </div>
            );
        };

        /* Act */
        createRoot(rootElement, <App messages={['message 1', 'message 2']} />);

        /* Assert */
        expect(rootElement.innerHTML).toBe(
            '<div>Test App<div><p>message 1</p></div><div><p>message 2</p></div></div>'
        );
    });

    it('should attach event listeners', () => {
        /* Arrange */
        const rootElement = document.createElement('div');

        let clickCount = 0;
        const handleClick = () => {
            clickCount++;
        };

        const App = () => {
            return <div onClick={handleClick}>Test</div>;
        };

        /* Act */
        createRoot(rootElement, <App />);
        rootElement.firstChild?.dispatchEvent(new Event('click'));
        rootElement.firstChild?.dispatchEvent(new Event('click'));
        rootElement.firstChild?.dispatchEvent(new Event('click'));

        /* Assert */
        expect(clickCount).toBe(3);
    });

    it('should re-render when state changes', () => {
        /* Arrange */
        const rootElement = document.createElement('div');

        const App = () => {
            const [count, setCount] = useState(0);
            return <div onClick={() => setCount((count) => count + 1)}>{count}</div>;
        };

        /* Act */
        createRoot(rootElement, <App />);
        rootElement.firstChild?.dispatchEvent(new Event('click'));
        rootElement.firstChild?.dispatchEvent(new Event('click'));
        rootElement.firstChild?.dispatchEvent(new Event('click'));
        rootElement.firstChild?.dispatchEvent(new Event('click'));

        /* Assert */
        expect(rootElement.innerHTML).toBe('<div>4</div>');
    });

    it('should only re-run the component that changed the state', () => {
        /* Arrange */
        const rootElement = document.createElement('div');

        let nestedRenderCount = 0;
        const Nested = () => {
            nestedRenderCount++;
            const [count, setCount] = useState(0);
            return <div onClick={() => setCount((count) => count + 1)}>{count}</div>;
        };

        // should only render once on mount
        let parentRenderCount = 0;
        const App = () => {
            parentRenderCount++;
            return (
                <div>
                    <Nested />
                </div>
            );
        };

        /* Act */
        createRoot(rootElement, <App />);
        rootElement.firstChild!.firstChild!.dispatchEvent(new Event('click'));

        /* Assert */
        expect(parentRenderCount).toBe(1);
        expect(nestedRenderCount).toBe(2);
        expect(rootElement.innerHTML).toBe('<div><div>1</div></div>');
    });

    it('children can be passed as props and rendered conditionally within other components', () => {
        /* Arrange */
        const rootElement = document.createElement('div');

        const WithChildren = ({
            id,
            start,
            children,
            end,
        }: {
            id: string;
            start: string;
            children?: JSXElement[];
            end: string;
        }) => {
            const [showChildren, setShowChildren] = useState(true);
            return (
                <div id={id} onClick={() => setShowChildren((state) => !state)}>
                    <div>{start}</div>
                    {showChildren && children}
                    <div>{end}</div>
                </div>
            );
        };

        const App = () => {
            return (
                <div>
                    <WithChildren start="groupedStart" end="groupedEnd" id="grouped">
                        <div id="groupedInner">
                            <div>Child 1</div>
                            <div>Child 2</div>
                        </div>
                    </WithChildren>
                    <WithChildren start="flatStart" end="flatEnd" id="flat">
                        <div>Child 3</div>
                        <div>Child 4</div>
                    </WithChildren>
                </div>
            );
        };

        /* Act / Assert */
        createRoot(rootElement, <App />);

        const childrenShowingHtml =
            '<div><div id="grouped"><div>groupedStart</div><div id="groupedInner"><div>Child 1</div><div>Child 2</div></div><div>groupedEnd</div></div><div id="flat"><div>flatStart</div><div>Child 3</div><div>Child 4</div><div>flatEnd</div></div></div>';

        const childrenHiddenHtml =
            '<div><div id="grouped"><div>groupedStart</div><div>groupedEnd</div></div><div id="flat"><div>flatStart</div><div>flatEnd</div></div></div>';

        expect(rootElement.innerHTML).toBe(childrenShowingHtml);
        rootElement.querySelector('#grouped')!.dispatchEvent(new Event('click'));
        rootElement.querySelector('#flat')!.dispatchEvent(new Event('click'));

        expect(rootElement.innerHTML).toBe(childrenHiddenHtml);
        rootElement.querySelector('#grouped')!.dispatchEvent(new Event('click'));
        rootElement.querySelector('#flat')!.dispatchEvent(new Event('click'));

        expect(rootElement.innerHTML).toBe(childrenShowingHtml);
    });

    it('should not re-render children if their elements are equal between renders', () => {
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

        let rerender = () => {};
        const Parent = () => {
            const [, setCount] = useState(0);
            rerender = () => setCount((count) => ++count);
            const cachedChild = useMemo(() => <Child />, []);
            return (
                <div>
                    {cachedChild}
                    <div>2</div>
                </div>
            );
        };

        /* Act */
        createRoot(rootElement, <Parent />);

        rerender();
        debugger;
        rerender();
        debugger;
        rerenderChild();

        /* Assert */
        expect(childRenders).toEqual(2);
        expect(rootElement.innerHTML).toBe('<div><div>1</div><div>2</div></div>');
    });

    it('should render 10000 items', () => {
        /* Arrange */
        const rootElement = document.createElement('div');

        const Item = (props: { index: number }) => {
            return <div id={`item-${props.index}`}>{props.index}</div>;
        };
        const itemsArr = Array.from({ length: 10000 }, (_, index) => index);
        let populate = () => {};
        const App = () => {
            const [items, setItems] = useState<number[]>([]);
            populate = () => setItems(itemsArr);

            return (
                <div id="root">
                    <div id="header">List</div>
                    <div id="list">
                        {items.map((index) => (
                            <Item index={index} />
                        ))}
                    </div>
                </div>
            );
        };

        /* Act */
        createRoot(rootElement, <App />);
        populate();

        /* Assert */
        expect(rootElement.innerHTML).toBe(
            `<div id="root"><div id="header">List</div><div id="list">${itemsArr
                .map((item) => `<div id="item-${item}">${item}</div>`)
                .join('')}</div></div>`
        );
    });

    it('should delete item from a list', () => {
        /* Arrange */
        const rootElement = document.createElement('div');

        const Item = (props: { id: number }) => {
            return <div id={`item-${props.id}`}>{props.id}</div>;
        };
        const itemsArr = Array.from({ length: 10 }, (_, index) => index);
        let populate = (_itemsArr: number[]) => {};
        const App = () => {
            const [items, setItems] = useState<number[]>([]);
            populate = (itemsArr: number[]) => setItems(itemsArr);

            return (
                <div id="root">
                    <div id="header">List</div>
                    <div id="list">
                        {items.map((id) => (
                            <Item id={id} />
                        ))}
                    </div>
                </div>
            );
        };

        /* Act */
        createRoot(rootElement, <App />);
        populate(itemsArr);
        const newArr = itemsArr.filter((item) => item !== 5);
        populate(newArr);

        /* Assert */
        expect(rootElement.innerHTML).toBe(
            `<div id="root"><div id="header">List</div><div id="list">${newArr
                .map((id) => `<div id="item-${id}">${id}</div>`)
                .join('')}</div></div>`
        );
    });

    it('should delete all items from a list', () => {
        /* Arrange */
        const rootElement = document.createElement('div');

        const Item = (props: { id: number }) => {
            return <div id={`item-${props.id}`}>{props.id}</div>;
        };
        const ItemWrapped = (props: { id: number }) => {
            return <Item id={props.id} />;
        };
        const itemsArr = Array.from({ length: 10 }, (_, index) => index);
        let populate = (_itemsArr: number[]) => {};
        const App = () => {
            const [items, setItems] = useState<number[]>([]);
            populate = (itemsArr: number[]) => setItems(itemsArr);

            return (
                <div id="root">
                    <div id="header">List</div>
                    <div id="list">
                        {items.map((id) => (
                            <ItemWrapped id={id} />
                        ))}
                    </div>
                </div>
            );
        };

        /* Act */
        createRoot(rootElement, <App />);
        populate(itemsArr);
        populate([]);

        /* Assert */
        expect(rootElement.innerHTML).toBe(
            `<div id="root"><div id="header">List</div><div id="list"></div></div>`
        );
    });

    it('should preserve state for keyed items', () => {
        /* Arrange */
        const rootElement = document.createElement('div');

        const Item = (props: { id: number; key: number }) => {
            const [count] = useState(props.id);
            return <div>{count}</div>;
        };

        const itemsArr = [1, 2, 3, 4, 5];
        let populate = (_itemsArr: number[]) => {};

        const App = () => {
            const [items, setItems] = useState<number[]>([]);
            populate = (itemsArr: number[]) => setItems(itemsArr);
            return (
                <div id="root">
                    <div id="header">List</div>
                    <div id="list">
                        {items.map((id) => (
                            <Item id={id} key={id} />
                        ))}
                    </div>
                </div>
            );
        };

        /* Act */
        createRoot(rootElement, <App />);
        populate(itemsArr);
        let newArr = [5, 4, 3, 2, 1];
        populate(newArr);

        /* Assert */
        expect(rootElement.innerHTML).toBe(
            `<div id="root"><div id="header">List</div><div id="list">${newArr
                .map((id) => `<div>${id}</div>`)
                .join('')}</div></div>`
        );

        // Re-shuffle
        newArr = [1, 4, 3, 2, 5];
        populate(newArr);
        expect(rootElement.innerHTML).toBe(
            `<div id="root"><div id="header">List</div><div id="list">${newArr
                .map((id) => `<div>${id}</div>`)
                .join('')}</div></div>`
        );

        // Remove elements and re-shuffle
        newArr = [1, 3, 2];
        populate(newArr);
        expect(rootElement.innerHTML).toBe(
            `<div id="root"><div id="header">List</div><div id="list">${newArr
                .map((id) => `<div>${id}</div>`)
                .join('')}</div></div>`
        );
    });

    it('should handle useEffect correctly', () => {
        /* Arrange */
        const rootElement = document.createElement('div');
        let rerender = () => {};
        let unmount = () => {};

        let invocations: string[] = [];
        const recordInvocation = (id: string) => invocations.push(id);

        const ChildWithEffects = ({ count }: { count: number }) => {
            useEffect(() => {
                recordInvocation('child-1');
                return () => {
                    recordInvocation('child-1-cleanup');
                };
            }, []);

            useEffect(() => {
                recordInvocation('child-2');
                return () => {
                    recordInvocation('child-2-cleanup');
                };
            }, [count]);

            useEffect(() => {
                recordInvocation('child-3');
                return () => {
                    recordInvocation('child-3-cleanup');
                };
            });

            return <div>Effects</div>;
        };

        const App = () => {
            const [count, setCount] = useState(0);
            const [mounted, setMounted] = useState(true);
            unmount = () => setMounted(false);
            rerender = () => setCount((count) => ++count);

            useEffect(() => {
                recordInvocation('parent-1');
                return () => {
                    recordInvocation('parent-1-cleanup');
                };
            }, []);

            useEffect(() => {
                recordInvocation('parent-2');
                return () => {
                    recordInvocation('parent-2-cleanup');
                };
            }, [count]);

            useEffect(() => {
                recordInvocation('parent-3');
                return () => {
                    recordInvocation('parent-3-cleanup');
                };
            });

            return <div>{mounted && <ChildWithEffects count={count} />}</div>;
        };

        /* Act / Assert */
        createRoot(rootElement, <App />);

        // First render
        const expectedInvocations1 = [
            'child-3',
            'child-2',
            'child-1',
            'parent-3',
            'parent-2',
            'parent-1',
        ];
        expect(invocations).toEqual(expectedInvocations1);

        // Second render
        rerender();
        const expectedInvocations2: string[] = [
            'child-3-cleanup',
            'child-2-cleanup',
            'parent-3-cleanup',
            'parent-2-cleanup',
            'child-3',
            'child-2',
            'parent-3',
            'parent-2',
        ];
        expect(invocations).toEqual([...expectedInvocations1, ...expectedInvocations2]);

        // Unmount
        unmount();
        const expectedInvocations3 = [
            'child-3-cleanup',
            'child-2-cleanup',
            'child-1-cleanup',
            'parent-3-cleanup',
            'parent-3',
        ];
        expect(invocations).toEqual([
            ...expectedInvocations1,
            ...expectedInvocations2,
            ...expectedInvocations3,
        ]);
    });

    it('should handle memoized components', () => {
        /* Arrange */
        const rootElement = document.createElement('div');
        let renderCount = 0;

        const Child = memo(() => {
            renderCount++;
            return <div>Child</div>;
        });

        const App = () => {
            const [count, setCount] = useState(0);
            return (
                <div
                    onClick={() => {
                        debugger;
                        setCount(count + 1);
                    }}
                >
                    <Child />
                    {count}
                </div>
            );
        };

        /* Act */
        createRoot(rootElement, <App />);
        rootElement.firstChild?.dispatchEvent(new Event('click'));
        rootElement.firstChild?.dispatchEvent(new Event('click'));

        /* Assert */
        expect(renderCount).toBe(1);
        expect(rootElement.innerHTML).toBe('<div><div>Child</div>2</div>');
    });
});
