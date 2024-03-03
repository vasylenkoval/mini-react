/** @jsx jsx */
import { createRoot } from '../fiber.js';
import { jsx, Element } from '../jsx.js';
import { useState, useEffect, useMemo } from '../hooks.js';

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

const Card = ({ children, title }: { children?: Element | Element[]; title: string }) => {
    const [isOpen, setIsOpen] = useState(true);
    return (
        <div className="card">
            <div className="card__title" onClick={() => setIsOpen((prev) => !prev)}>
                {title}
            </div>
            <div className="card__body">{isOpen && children}</div>
        </div>
    );
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

    const handleTimerToggle = () => {
        setIsStopped((isStopped) => !isStopped);
    };

    return (
        <Card title="Timer">
            <div className="flex">
                <p>Timer: {(timer / 1000).toFixed(1)}</p>
                <button style="margin-right:10px;" onClick={handleTimerToggle}>
                    {isStopped ? 'Start timer' : 'Stop timer'} ⏱
                </button>
            </div>
        </Card>
    );
};

const App = () => {
    const [name, setName] = useState('John Doe');
    const [age, setAge] = useState(33);
    const [count, setCount] = useState(0);

    const countUp = () => {
        setCount((prev) => {
            setCount((prev) => {
                return ++prev;
            });
            return ++prev;
        });
    };

    return (
        <div className="app">
            <h1 className="title">Mini-React ⚛️</h1>
            <Card title="Counter">
                <p>Count: {count} </p>
                <div className="flex">
                    <button style="margin-right:10px;" onClick={countUp}>
                        Up 👆
                    </button>
                    <button onClick={() => setCount((prev) => Math.max(--prev, 0))}>Down 👇</button>
                </div>
            </Card>
            <TimerCard />
            <Card title="Inputs">
                <div>Name: {name}</div>
                <div>Age: {age}</div>
                <br />
                <label style="display: block" htmlFor="name">
                    Your name
                </label>
                <input
                    value={name}
                    style="padding: 10px;"
                    id="name"
                    onInput={(e: any) => setName(e.target.value)}
                />
                <br />
                <label style="display: block" htmlFor="age">
                    Your age
                </label>
                <input
                    value={age}
                    style="padding: 10px;"
                    type="number"
                    id="age"
                    onInput={(e: any) => setAge(+e.target.value)}
                />
            </Card>
        </div>
    );
};

if (root) {
    createRoot(root, <App />);
}
