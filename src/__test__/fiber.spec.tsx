/** @jsx jsx */
import { Fiber, createRoot } from '../fiber';
import { useMemo, useState, useEffect } from '../hooks';
import { jsx, JSXElement } from '../jsx';
import { memo } from '../memo';

type ListElement = { currIdx: number; oldIdx: number };
type InsertionAction = { currIdx: number; beforeOldIdx: number };

function computeTransformActions(list: ListElement[]): InsertionAction[] {
    const n = list.length;
    const oldIndices = list.map((e) => e.oldIdx);

    // Compute nextOld array: each position's next old element index in the list
    const nextOld = new Int32Array(n).fill(-1);
    let lastOldPos = -1;
    for (let i = n - 1; i >= 0; i--) {
        nextOld[i] = lastOldPos;
        if (oldIndices[i] !== -1) {
            lastOldPos = i;
        }
    }

    // Compute LIS lengths and find elements in LIS
    const lengths = new Uint32Array(n).fill(0);
    const tails: number[] = [];
    for (let i = 0; i < n; i++) {
        const oldIdx = oldIndices[i];
        if (oldIdx === -1) continue;
        let low = 0,
            high = tails.length;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (tails[mid] < oldIdx) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }
        if (low === tails.length) {
            tails.push(oldIdx);
        } else {
            tails[low] = oldIdx;
        }
        lengths[i] = low + 1;
    }

    const lisSet = new Set<number>();
    let currentLength = tails.length;
    for (let i = n - 1; i >= 0; i--) {
        if (currentLength <= 0) break;
        const oldIdx = oldIndices[i];
        if (oldIdx === -1) continue;
        if (lengths[i] === currentLength) {
            lisSet.add(i);
            currentLength--;
        }
    }

    // Compute nextLIS array
    const nextLIS = new Int32Array(n).fill(-1);
    let lastLISPos = -1;
    for (let i = n - 1; i >= 0; i--) {
        if (lisSet.has(i)) {
            lastLISPos = i;
        }
        nextLIS[i] = lastLISPos;
    }

    // Generate actions
    const actions: InsertionAction[] = [];
    for (let i = 0; i < n; i++) {
        const elem = list[i];
        if (elem.oldIdx === -1) {
            // New element: insert before nextOld's oldIdx or end
            const nextPos = nextOld[i];
            const beforeOldIdx = nextPos !== -1 ? list[nextPos].oldIdx : -1;
            actions.push({ currIdx: elem.currIdx, beforeOldIdx });
        } else if (!lisSet.has(i)) {
            // Existing element not in LIS: insert before nextLIS's oldIdx or end
            const nextPos = nextLIS[i];
            const beforeOldIdx = nextPos !== -1 ? list[nextPos].oldIdx : -1;
            actions.push({ currIdx: elem.currIdx, beforeOldIdx });
        }
        // Elements in LIS are skipped
    }

    return actions;
}

function prepareInput<T>(first: T[], second: T[]): ListElement[] {
    const elementToOldIdx = new Map<T, number>();
    first.forEach((elem, idx) => elementToOldIdx.set(elem, idx));
    return second.map((elem, currIdx) => ({
        currIdx,
        oldIdx: elementToOldIdx.get(elem) ?? -1,
    }));
}

function convertOutput<T>(
    actions: InsertionAction[],
    first: T[],
    second: T[]
): Array<{ element: T; before: T | null }> {
    return actions.map(({ currIdx, beforeOldIdx }) => ({
        element: second[currIdx],
        before: beforeOldIdx === -1 ? null : first[beforeOldIdx],
    }));
}

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
            rerenderChild = () => {
                debugger;
                setCount((count) => ++count);
            };
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

    it('should render 10000 items and then swap', () => {
        /* Arrange */
        const rootElement = document.createElement('div');

        const Item = (props: { index: number; key: number }) => {
            return <div id={`item-${props.index}`}>{props.index}</div>;
        };

        let populate = (itemsArr: number[]) => {};
        const App = () => {
            const [items, setItems] = useState<number[]>([]);
            populate = (itemsArr: number[]) => setItems(itemsArr);

            return (
                <div id="root">
                    <div id="header">List</div>
                    <div id="list">
                        {items.map((index) => (
                            <Item key={index} index={index} />
                        ))}
                    </div>
                </div>
            );
        };

        /* Act */
        createRoot(rootElement, <App />);
        let itemsArr = Array.from({ length: 10000 }, (_, index) => index);
        populate(itemsArr);

        /* Assert */
        expect(rootElement.innerHTML).toBe(
            `<div id="root"><div id="header">List</div><div id="list">${itemsArr
                .map((item) => `<div id="item-${item}">${item}</div>`)
                .join('')}</div></div>`
        );

        // Swap last and first elements
        itemsArr = itemsArr.slice();
        [itemsArr[0], itemsArr[itemsArr.length - 1]] = [itemsArr[itemsArr.length - 1], itemsArr[0]];
        populate(itemsArr);

        /* Assert */
        expect(rootElement.innerHTML).toBe(
            `<div id="root"><div id="header">List</div><div id="list">${itemsArr
                .map((item) => `<div id="item-${item}">${item}</div>`)
                .join('')}</div></div>`
        );

        // completely reverse the list
        itemsArr = itemsArr.slice().reverse();
        populate(itemsArr);

        /* Assert */
        expect(rootElement.innerHTML).toBe(
            `<div id="root"><div id="header">List</div><div id="list">${itemsArr
                .map((item) => `<div id="item-${item}">${item}</div>`)
                .join('')}</div></div>`
        );

        // remove half of the list
        itemsArr = itemsArr.filter((_, index) => index % 2 === 0);
        populate(itemsArr);
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

        const Item = (props: { id: string; key: string }) => {
            const [id] = useState(props.id);
            return <div>{id}</div>;
        };

        const itemsArr = ['a', 'b', 'c', 'd', 'e'];
        let populate = (_itemsArr: string[]) => {};

        const App = () => {
            const [items, setItems] = useState<string[]>([]);
            populate = (itemsArr: string[]) => setItems(itemsArr);
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
        let newArr = ['e', 'd', 'c', 'b', 'a'];
        populate(newArr);

        /* Assert */
        expect(rootElement.innerHTML).toBe(
            `<div id="root"><div id="header">List</div><div id="list">${newArr
                .map((id) => `<div>${id}</div>`)
                .join('')}</div></div>`
        );

        // Re-shuffle
        newArr = ['a', 'd', 'c', 'b', 'e'];
        debugger;
        populate(newArr);
        expect(rootElement.innerHTML).toBe(
            `<div id="root"><div id="header">List</div><div id="list">${newArr
                .map((id) => `<div>${id}</div>`)
                .join('')}</div></div>`
        );

        // Remove elements and re-shuffle
        newArr = ['a', 'c', 'b'];
        populate(newArr);
        expect(rootElement.innerHTML).toBe(
            `<div id="root"><div id="header">List</div><div id="list">${newArr
                .map((id) => `<div>${id}</div>`)
                .join('')}</div></div>`
        );

        // Add a new element in between
        newArr = ['a', 'c', 'h', 'b'];
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

        const SubChild = ({ count }: { count: number }) => {
            useEffect(() => {
                recordInvocation('sub-child-1');
                return () => {
                    recordInvocation('sub-child-1-cleanup');
                };
            }, []);

            useEffect(() => {
                recordInvocation('sub-child-2');
                return () => {
                    recordInvocation('sub-child-2-cleanup');
                };
            }, [count]);

            useEffect(() => {
                recordInvocation('sub-child-3');
                return () => {
                    recordInvocation('sub-child-3-cleanup');
                };
            });

            return <div>Effects</div>;
        };

        const Child = ({ count }: { count: number }) => {
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

            return <SubChild count={count} />;
        };

        const Parent = () => {
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

            return <div>{mounted && <Child count={count} />}</div>;
        };

        /* Act / Assert */
        createRoot(rootElement, <Parent />);

        // First render
        const expectedInvocations1 = [
            'sub-child-1',
            'sub-child-2',
            'sub-child-3',
            'child-1',
            'child-2',
            'child-3',
            'parent-1',
            'parent-2',
            'parent-3',
        ];
        expect(invocations).toEqual(expectedInvocations1);

        // Second render
        invocations.splice(0);
        rerender();
        const expectedInvocations2: string[] = [
            'sub-child-2-cleanup',
            'sub-child-3-cleanup',
            'child-2-cleanup',
            'child-3-cleanup',
            'parent-2-cleanup',
            'parent-3-cleanup',
            'sub-child-2',
            'sub-child-3',
            'child-2',
            'child-3',
            'parent-2',
            'parent-3',
        ];
        expect(invocations).toEqual(expectedInvocations2);

        // Unmount
        invocations.splice(0);
        unmount();
        const expectedInvocations3 = [
            'sub-child-1-cleanup',
            'sub-child-2-cleanup',
            'sub-child-3-cleanup',
            'child-1-cleanup',
            'child-2-cleanup',
            'child-3-cleanup',
            'parent-3-cleanup',
            'parent-3',
        ];
        expect(invocations).toEqual(expectedInvocations3);
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

    it('should handle memoized components with custom props comparison', () => {
        /* Arrange */
        const rootElement = document.createElement('div');
        let renderCount = 0;

        const Child = memo(
            ({ name: _name, count: _count }: { name: string; count: number }) => {
                renderCount++;
                return <div>Child</div>;
            },
            (prev, next) => prev.name === next.name
        );

        let setName: (name: string) => void;
        let setCount: (count: number) => void;

        const App = () => {
            const [count, _setCount] = useState(0);
            const [name, _setName] = useState('test');
            setName = _setName;
            setCount = _setCount;

            return (
                <div>
                    <Child name={name} count={count} />
                    {count}
                </div>
            );
        };

        /* Act */
        createRoot(rootElement, <App />);
        setCount!(1);
        setCount!(2);
        setCount!(3);
        setName!('test2');

        /* Assert */
        expect(renderCount).toBe(2);
        expect(rootElement.innerHTML).toBe('<div><div>Child</div>3</div>');
    });

    it('should update parent references in siblings of the first memoized child elements', async () => {
        /* Arrange */
        const rootElement = document.createElement('div');

        let forceRerender: () => void;

        const App = () => {
            const [, _forceRerender] = useState(0);
            forceRerender = () => _forceRerender((prev) => ++prev);

            const child = useMemo(() => {
                return (
                    <div id="memoizedElement">
                        <div>1</div>
                        <div>2</div>
                    </div>
                );
            }, []);

            return <div>{child}</div>;
        };

        /* Act */
        createRoot(rootElement, <App />);
        forceRerender!();

        /** Assert */
        type ElementWithFiber = Element & { __fiberRef: Fiber };
        const memoizedElementDom = rootElement.querySelector('#memoizedElement')!;
        const children = [...memoizedElementDom.childNodes.values()] as ElementWithFiber[];
        const child1 = children[0];
        const child2 = children[1];
        expect(child1.__fiberRef.parent).toBe(child2.__fiberRef.parent);
    });

    it('test compute insertions 1', () => {
        // Example usage:
        const first = ['a', 'b', 'c'];
        const second = ['b', 'd', 'c', 'a'];

        const list = prepareInput(first, second);
        const actions = computeTransformActions(list);
        const formattedActions = convertOutput(actions, first, second);

        expect(formattedActions).toEqual([
            { element: 'd', before: 'c' },
            { element: 'a', before: null },
        ]);
    });

    it('test compute insertions 2', () => {
        // Example usage:
        const first = ['a', 'b', 'c'];
        const second = ['b', 'c', 'a'];

        const list = prepareInput(first, second);
        const actions = computeTransformActions(list);
        const formattedActions = convertOutput(actions, first, second);

        expect(formattedActions).toEqual([{ element: 'a', before: null }]);
    });

    it('test compute insertions 3', () => {
        // Example usage:
        const first = ['a', 'b', 'c'];
        const second = ['b', 'a', 'c', 'd'];

        const list = prepareInput(first, second);
        const actions = computeTransformActions(list);
        const formattedActions = convertOutput(actions, first, second);

        expect(formattedActions).toEqual([
            { element: 'b', before: 'a' },
            { element: 'd', before: null },
        ]);
    });

    it('test compute insertions 4', () => {
        // Example usage:
        const first = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        const second = ['g', 'b', 'c', 'f', 'a'];

        const list = prepareInput(first, second);
        const actions = computeTransformActions(list);
        const formattedActions = convertOutput(actions, first, second);

        expect(formattedActions).toEqual([
            {
                element: 'g',
                before: 'b',
            },
            {
                element: 'a',
                before: null,
            },
        ]);
    });

    it('test compute insertions 5', () => {
        // Example usage:
        const first = ['a', 'b'];
        const second = ['a', 'b'];

        const list = prepareInput(first, second);
        const actions = computeTransformActions(list);
        const formattedActions = convertOutput(actions, first, second);

        expect(formattedActions).toEqual([]);
    });
    it('test compute insertions on 10000 items', () => {
        // Example usage:
        const first = Array.from({ length: 100 }, (_, index) => index);
        const second = Array.from({ length: 500 }, (_, index) => index);

        const list = prepareInput(first, second);
        const actions = computeTransformActions(list);
        const formattedActions = convertOutput(actions, first, second);

        expect(formattedActions.length).toBe(10000);
    });

    it('test compute insertions 6', () => {
        function computeTransformActions(oldIndices: number[]): number[] {
            const n = oldIndices.length;
            const lengths = new Uint32Array(n);
            const tails: number[] = [];

            // Compute LIS using binary search optimization
            for (let i = 0; i < n; i++) {
                const val = oldIndices[i];
                let low = 0,
                    high = tails.length;

                // Fast binary search using bitwise operations
                while (low < high) {
                    const mid = (low + high) >>> 1;
                    tails[mid] < val ? (low = mid + 1) : (high = mid);
                }

                if (low === tails.length) tails.push(val);
                else tails[low] = val;
                lengths[i] = low + 1;
            }

            // Identify elements in LIS (don't need moving)
            const lisMembers = new Uint8Array(n);
            let currentLen = tails.length;
            for (let i = n - 1; i >= 0 && currentLen > 0; i--) {
                if (lengths[i] === currentLen) {
                    lisMembers[i] = 1;
                    currentLen--;
                }
            }

            // Collect indexes of elements needing movement
            const moved: number[] = [];
            for (let i = 0; i < n; i++) {
                if (!lisMembers[i]) moved.push(i);
            }

            return moved;
        }

        // Helper function to convert lists to oldIndices format
        function prepareInput<T>(first: T[], second: T[]): number[] {
            const indexMap = new Map<T, number>();
            first.forEach((v, i) => indexMap.set(v, i));
            return second.map((v) => indexMap.get(v)!);
        }

        // Example usage:
        const first = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        const second = ['b', 'd', 'c', 'a', 'e', 'f', 'g'];
        const oldIndices = prepareInput(first, second); // [1, 3, 2, 0]
        const movedIndexes = computeTransformActions(oldIndices); // [1, 3]
        console.log(movedIndexes.map((i) => second[i])); // ['d', 'a']
    });
});
