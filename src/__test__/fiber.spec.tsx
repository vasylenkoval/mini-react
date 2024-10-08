/** @jsx jsx */
import { createRoot } from '../fiber';
import { useMemo, useState } from '../hooks';
import { jsx, JSXElement } from '../jsx';

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
        rerender();
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
                            <Item id={id} key={id} />
                        ))}
                    </div>
                </div>
            );
        };

        /* Act */
        createRoot(rootElement, <App />);
        populate(itemsArr);
        const newArr = itemsArr.slice().reverse();
        populate(newArr);

        /* Assert */
        expect(rootElement.innerHTML).toBe(
            `<div id="root"><div id="header">List</div><div id="list">${newArr
                .map((id) => `<div>${id}</div>`)
                .join('')}</div></div>`
        );
    });
});
