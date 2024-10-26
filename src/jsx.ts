// @TODO: import a proper definition.
declare global {
    namespace JSX {
        interface IntrinsicElements {
            [elemName: string]: any;
        }
    }
}
export const TEXT_ELEMENT = 'TEXT';
export type Primitive = undefined | null | string | number | boolean;
export type JSXElement = { type: string | FC<Props>; props: Props };
export type Props = { [key: string]: unknown; children?: JSXElement[]; key?: string | number };
export type FC<T = Props> = (props: T) => JSXElement;

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
                props: { nodeValue: element },
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
    props: TProps,
    ...children: (JSXElement | Primitive)[]
): JSXElement {
    return {
        type,
        props: Object.assign(props ?? {}, {
            children: props?.children || prepareChildren(children),
        }),
    };
}
