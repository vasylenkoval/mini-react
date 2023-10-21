import type { JSXElement } from './jsx.js';

export function render(element: JSXElement, container: HTMLElement) {
    const dom = document.createElement(element.type);

    for (const key in element.props) {
        if (key === 'children') continue;
        // @ts-expect-error
        dom[key] = element.props[key];
    }

    for (const child of element.props.children) {
        const jsType = typeof child;
        if (jsType === 'boolean' || jsType == null) continue;
        if (jsType === 'string' || jsType === 'number') {
            dom.appendChild(document.createTextNode(child as string));
            continue;
        }
        render(child as JSXElement, dom);
    }

    container.appendChild(dom);
}
