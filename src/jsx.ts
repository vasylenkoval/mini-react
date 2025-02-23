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
    key: string | null;
    children: JSXElement[];
};
export type Props = {
    children?: JSXElement[] | null;
    [key: string]: unknown;
};
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
): JSXElement[] {
    // Create Element out of primitive children.
    for (const element of elements) {
        const elementType = typeof element;
        if (elementType === 'object' && element) {
            if (Array.isArray(element)) {
                prepareChildren(element, children);
            } else {
                children.push(element as JSXElement);
            }
            continue;
        }
        if (elementType === 'string' || elementType === 'number') {
            children.push({
                type: TEXT_ELEMENT,
                props: { nodeValue: element },
                children: EMPTY_ARR,
                key: null,
            });
        }
    }

    return children.length ? children : EMPTY_ARR;
}

/**
 * Creates a new JSX element with the specified type, props, and children.
 */
export function jsx<TProps extends Props | null>(
    type: string | FC,
    _props: any,
    ..._children: (JSXElement | Primitive)[]
): JSXElement {
    const props = _props ?? {};
    let children = null;
    if (_children.length > 0) {
        children = prepareChildren(_children);
        props.children = children;
    }

    const element: JSXElement = {
        type,
        props,
        children: children as JSXElement[],
        key: props.key !== undefined ? props.key : null,
    };
    return element;
}
