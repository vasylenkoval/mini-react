/** @jsx jsx */
import { createRoot } from '../fiber.js';
import { jsx, Element } from '../jsx.js';

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
    padding: 0 20px;
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
`;
document.head.appendChild(style);

const Card = ({
    children,
    title,
    onClick,
}: {
    children?: Element | Element[];
    title: string;
    onClick?: () => void;
}) => {
    return (
        <div className="card" onClick={onClick}>
            <div className="card__title">{title}</div>
            {children}
        </div>
    );
};

const cards = [
    {
        title: 'Card 1',
        content: (
            <p>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque eget eros in
                ante pharetra lobortis. Duis eu massa et quam porta laoreet a non quam. Vestibulum
                id nunc sit amet diam aliquet consectetur et in dui. Sed lorem sapien, venenatis et
                arcu in, vulputate sollicitudin metus. Donec dictum.
            </p>
        ),
    },
    {
        title: 'Card 2',
        content: (
            <div>
                <p>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque eget eros
                    in ante pharetra lobortis. Duis eu massa et quam porta laoreet a non quam.
                    Vestibulum id nunc sit amet diam aliquet consectetur et in dui. Sed lorem
                    sapien, venenatis et arcu in, vulputate sollicitudin metus. Donec dictum.
                </p>
                <p>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque eget eros
                    in ante pharetra lobortis. Duis eu massa et quam porta laoreet a non quam.
                    Vestibulum id nunc sit amet diam aliquet consectetur et in dui. Sed lorem
                    sapien, venenatis et arcu in, vulputate sollicitudin metus. Donec dictum.
                </p>
            </div>
        ),
    },
];

const App = () => {
    return (
        <div className="app">
            <h1 className="title">Mini-React ⚛️</h1>
            <p>Example of component rendering</p>
            {cards.map((card) => (
                <Card title={card.title} onClick={() => alert(`Clicked ${card.title}`)}>
                    {card.content}
                </Card>
            ))}
        </div>
    );
};

if (root) {
    createRoot(root, <App />);
}
