/** @jsx jsx */
import { createRoot } from '../fiber';
import { useState } from '../hooks';
import { jsx } from '../jsx';

describe('render', () => {
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

        let isClicked = false;
        const handleClick = () => {
            isClicked = true;
        };

        const App = () => {
            return <div onClick={handleClick}>Test</div>;
        };

        /* Act */
        createRoot(rootElement, <App />);
        rootElement.firstChild?.dispatchEvent(new Event('click'));

        /* Assert */
        expect(isClicked).toBe(true);
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
        rootElement.firstChild?.firstChild?.dispatchEvent(new Event('click'));

        /* Assert */
        expect(parentRenderCount).toBe(1);
        expect(nestedRenderCount).toBe(2);
        expect(rootElement.innerHTML).toBe('<div><div>1</div></div>');
    });
});
