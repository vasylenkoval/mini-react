declare global {
    namespace JSX {
        interface IntrinsicElements {
            [elemName: string]: any;
        }
    }
}

export type JSXElement = {
    type: string;
    props: Props;
};

export type Element = undefined | null | string | number | boolean | JSXElement;

interface Props {
    [key: string]: unknown;
    children: Element[];
}

export function jsx<TProps>(type: string, props?: TProps, ...children: Element[]): JSXElement {
    return {
        type,
        props: { ...(props || {}), children },
    };
}
