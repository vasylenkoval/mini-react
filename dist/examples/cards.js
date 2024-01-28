/** @jsx jsx */
import { createRoot } from '../fiber.js';
import { jsx } from '../jsx.js';
import { useState, useEffect } from '../hooks.js';
const root = document.getElementById('root');
const style = document.createElement('style');
style.textContent = `
    .title {
        color: #535bf2;
    }

    .app {
        padding: 20px;
    }

    .card {
        border: 1px solid rgba(82, 82, 89, 0.32);
        transition: border 0.1s;
        border-radius: 4px;
        padding: 0 20px 20px 20px;
        margin-bottom: 20px;
    }

    .card:hover {
        border: 1px solid #535bf2;
    }

    .card__title {
        cursor: pointer;
        font-size: 18px;
        font-weight: bold;
        border-bottom: 1px solid rgba(82, 82, 89, 0.24);
        padding: 10px;
        margin-bottom: 10px;
    }

    .card__title__arrow {
        transition: transform 0.2s;
        transform: rotate(0);
    }

    .card__title__arrow--up {
        transform: rotate(180deg);
    }

    .card__body {
        padding: 0 10px;
    }
`;
document.head.appendChild(style);
const Card = ({ children, title }) => {
    const [isOpen, setIsOpen] = useState(true);
    return (jsx("div", { className: "card" },
        jsx("div", { className: "card__title", onClick: () => setIsOpen((prev) => !prev) }, title),
        jsx("div", { className: "card__body" }, isOpen && children)));
};
const TimerCard = () => {
    const [timer, setTimer] = useState(0); // ms
    const [isStopped, setIsStopped] = useState(true);
    useEffect(() => {
        if (isStopped) {
            return;
        }
        let timerId = setInterval(() => setTimer((time) => time + 100), 100);
        return () => {
            clearInterval(timerId);
        };
    }, [isStopped]);
    return (jsx(Card, { title: "Timer" },
        jsx("div", { className: "flex" },
            jsx("p", null,
                "Timer: ",
                (timer / 1000).toFixed(1)),
            jsx("button", { style: "margin-right:10px;", onClick: () => setIsStopped((isStopped) => !isStopped) },
                isStopped ? 'Start timer' : 'Stop timer',
                " \u23F1"))));
};
const App = () => {
    const [name, setName] = useState('John Doe');
    const [age, setAge] = useState(33);
    const [count, setCount] = useState(0);
    return (jsx("div", { className: "app" },
        jsx("h1", { className: "title" }, "Mini-React \u269B\uFE0F"),
        jsx(Card, { title: "Counter" },
            jsx("p", null,
                "Count: ",
                count,
                " "),
            jsx("div", { className: "flex" },
                jsx("div", null,
                    jsx("div", null, "TEst"),
                    jsx("div", null, "TEst2"),
                    jsx("div", null, "TEst3")),
                jsx("button", { style: "margin-right:10px;", onClick: () => setCount((prev) => ++prev) }, "Up \uD83D\uDC46"),
                jsx("button", { onClick: () => setCount((prev) => Math.max(--prev, 0)) }, "Down \uD83D\uDC47")),
            "Test"),
        jsx(TimerCard, null),
        jsx(Card, { title: "Inputs" },
            jsx("div", null,
                "Name: ",
                name),
            jsx("div", null,
                "Age: ",
                age),
            jsx("br", null),
            jsx("label", { style: "display: block", htmlFor: "name" }, "Your name"),
            jsx("input", { value: name, style: "padding: 10px;", id: "name", onInput: (e) => setName(e.target.value) }),
            jsx("br", null),
            jsx("label", { style: "display: block", htmlFor: "age" }, "Your age"),
            jsx("input", { value: age, style: "padding: 10px;", type: "number", id: "age", onInput: (e) => setAge(+e.target.value) }))));
};
if (root) {
    createRoot(root, jsx(App, null));
}
