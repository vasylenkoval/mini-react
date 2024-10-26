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
export function jsx(type, props, ...children) {
    return {
        type,
        props: Object.assign(props ?? {}, {
            children: props?.children || prepareChildren(children),
        }),
    };
}
