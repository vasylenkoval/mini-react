import { EMPTY_ARR } from './constants.js';

// @TODO: Piggy back on react typings?
declare global {
    namespace JSX {
        interface IntrinsicElements {
            [elemName: string]: any;
        }
    }
}
export const propsCompareFnSymbol = Symbol('propsCompareFn');
export const TEXT_ELEMENT = 'TEXT';
export type Primitive = undefined | null | string | number | boolean;
export type JSXElement = {
    type: string | FC<Props>;
    props: Props;
    key: string | number | undefined;
    serialized?: string;
};
export type Props = { [key: string]: unknown; children?: JSXElement[]; key?: string | number };
export type FC<T = Props> = ((props: T) => JSXElement) & {
    [propsCompareFnSymbol]?: (prevProps: T, nextProps: T) => boolean;
};

/**
 * Prepares children for an Element. Removes child items that cannot be rendered and flattens lists.
 * @param elements - Elements to process.
 * @param children - Array to accumulate valid children into.
 */
function prepareChildren(
    elements: (JSXElement | Primitive)[],
    children: JSXElement[] = []
): JSXElement[] | undefined {
    // Create Element out of primitive children.
    for (const element of elements) {
        if (typeof element === 'object' && element) {
            if (Array.isArray(element)) {
                prepareChildren(element, children);
            } else {
                children.push(element);
            }
            continue;
        }
        if (typeof element === 'string' || typeof element === 'number') {
            children.push({
                type: TEXT_ELEMENT,
                props: { nodeValue: element, key: undefined },
                key: undefined,
            });
        }
    }

    return children.length ? children : undefined;
}

/**
 * Creates a new JSX element with the specified type, props, and children.
 */
export function jsx<TProps extends Props | null>(
    type: string | FC,
    props: any,
    ...children: (JSXElement | Primitive)[]
): JSXElement {
    props = props ?? {
        children: EMPTY_ARR,
        key: undefined,
    };

    if (children.length > 0) {
        props.children = prepareChildren(children);
    }

    const element: JSXElement = {
        type,
        props,
        key: props.key ?? undefined,
    };
    return element;
}
