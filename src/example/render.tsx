/** @jsx jsx */
import { render } from '../render.js';
import { jsx } from '../jsx.js';

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

if (root) {
    render(
        <div className="app">
            <h1 className="title">JSX 🚀</h1>
            <p>Simple example of JSX rendering</p>
            <div className="card">
                <div className="card__title">Card 1</div>
                <div className="row">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque eget eros
                    in ante pharetra lobortis. Duis eu massa et quam porta laoreet a non quam.
                    Vestibulum id nunc sit amet diam aliquet consectetur et in dui. Sed lorem
                    sapien, venenatis et arcu in, vulputate sollicitudin metus. Donec dictum.
                </div>
                <p className="row">
                    Praesent tincidunt risus quam, a scelerisque urna faucibus eget. In vehicula
                    venenatis justo, vel tristique diam vestibulum id. Phasellus lacus lacus, porta
                    faucibus viverra ac, mattis ut arcu. Nulla erat sem, iaculis at viverra eget,
                    blandit nec mi. Curabitur vel augue eu purus imperdiet egestas.
                </p>
            </div>
            <div className="card">
                <div className="card__title">Card 2</div>
                <div className="row">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque eget eros
                    in ante pharetra lobortis. Duis eu massa et quam porta laoreet a non quam.
                    Vestibulum id nunc sit amet diam aliquet consectetur et in dui. Sed lorem
                    sapien, venenatis et arcu in, vulputate sollicitudin metus. Donec dictum.
                </div>
                <p className="row">
                    Praesent tincidunt risus quam, a scelerisque urna faucibus eget. In vehicula
                    venenatis justo, vel tristique diam vestibulum id. Phasellus lacus lacus, porta
                    faucibus viverra ac, mattis ut arcu. Nulla erat sem, iaculis at viverra eget,
                    blandit nec mi. Curabitur vel augue eu purus imperdiet egestas.
                </p>
            </div>
        </div>,
        root
    );
}
