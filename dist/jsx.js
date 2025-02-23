import { EMPTY_ARR } from './constants.js';
export const propsCompareFnSymbol = Symbol('propsCompareFn');
export const TEXT_ELEMENT = 'TEXT';
/**
 * Prepares children for an Element. Removes child items that cannot be rendered and flattens lists.
 * @param elements - Elements to process.
 * @param children - Array to accumulate valid children into.
 */
function prepareChildren(elements, children = []) {
    // Create Element out of primitive children.
    for (const element of elements) {
        const elementType = typeof element;
        if (elementType === 'object' && element) {
            if (Array.isArray(element)) {
                prepareChildren(element, children);
            }
            else {
                children.push(element);
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
export function jsx(type, _props, ..._children) {
    const props = _props ?? {};
    let children = null;
    if (_children.length > 0) {
        children = prepareChildren(_children);
        props.children = children;
    }
    const element = {
        type,
        props,
        children: children,
        key: props.key !== undefined ? props.key : null,
    };
    return element;
}
