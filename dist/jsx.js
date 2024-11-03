import { getPropsHash } from './hash.js';
import { EMPTY_ARR } from './constants.js';
export const TEXT_ELEMENT = 'TEXT';
/**
 * Prepares children for an Element. Removes child items that cannot be rendered and flattens lists.
 * @param elements - Elements to process.
 * @param children - Array to accumulate valid children into.
 */
function prepareChildren(elements, children = []) {
    // Create Element out of primitive children.
    for (const element of elements) {
        if (typeof element === 'object' && element) {
            if (Array.isArray(element)) {
                prepareChildren(element, children);
            }
            else {
                children.push(element);
            }
            continue;
        }
        if (typeof element === 'string' || typeof element === 'number') {
            const ownPropsHash = String(element);
            children.push({
                ownPropsHash,
                childrenPropsHash: ownPropsHash,
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
export function jsx(_type, _props, ..._children) {
    let children = _children;
    const props = _props ?? {};
    const ownPropsHash = getPropsHash(props);
    let childrenPropsHash = ownPropsHash;
    if (!props.children) {
        children = prepareChildren(children) ?? EMPTY_ARR;
        for (const child of children) {
            childrenPropsHash =
                childrenPropsHash + child.childrenPropsHash;
        }
    }
    return {
        ownPropsHash,
        childrenPropsHash,
        type: _type,
        props: Object.assign(props ?? {}, {
            children: props?.children || children,
        }),
    };
}
