/** @jsx jsx */
import { createRoot } from '../fiber.js';
import { jsx, Element } from '../jsx.js';
import { useState } from '../hooks.js';

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
    border: 1px solid rgba(82, 82, 89, .32);
    transition: border 0.1s;
    border-radius: 4px;
    padding: 0 20px 20px 20px;
    margin-bottom: 20px;
  }

  .card:hover {
    border: 1px solid #535bf2;
  }

  .card__title {
    font-size: 18px;
    font-weight: bold;
    border-bottom: 1px solid rgba(82, 82, 89, .24);
    padding: 10px;
    margin-bottom: 10px;
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

const App = () => {
    const [name, setName] = useState('');
    const [age, setAge] = useState(0);
    const [count, setCount] = useState(0);

    return (
        <div className="app">
            <h1 className="title">Mini-React ⚛️</h1>
            <Card title="Counter">
                <p>Count: {count} </p>
                <div className="flex">
                    <button style="margin-right:10px;" onClick={() => setCount((prev) => ++prev)}>
                        Up 👆
                    </button>
                    <button onClick={() => setCount((prev) => --prev)}>Down 👇</button>
                </div>
            </Card>
            <Card title="Inputs">
                <div>Name: {name}</div>
                <div>Age: {age}</div>
                <br />
                <label style="display: block" htmlFor="name">
                    Your name
                </label>
                <input
                    style="padding: 10px;"
                    id="name"
                    onInput={(e: any) => setName(e.target.value)}
                />
                <br />
                <label style="display: block" htmlFor="age">
                    Your age
                </label>
                <input
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
