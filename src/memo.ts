import { FC, JSXElement, Props, jsx } from './jsx.js';

/**
 * Saves the previous output of a component and only re-renders if the props have changed.
 * @param component - Component to memoize.
 * @param compareFn - Function to compare the previous and next props.
 * @returns Memoized component.
 */
export function memo<T>(
    Component: T,
    compareFn: (prevProps: Props, nextProps: Props) => boolean = defaultCompare
): T {
    let cache: JSXElement | undefined;
    let prevProps: Props;

    function MemoContainer(props: Props): JSXElement {
        if (cache && compareFn(prevProps, props)) {
            return cache;
        }
        prevProps = props;
        return jsx(MemoComponent, props);
    }

    function MemoComponent(props: Props): JSXElement {
        // @ts-ignore
        cache = Component(props);
        // @ts-ignore
        return cache;
    }

    return MemoContainer as T;
}

/**
 * Default comparison function for memoized components.
 * @param prevProps - Previous props.
 * @param nextProps - Next props.
 * @returns True if the props are the same, false otherwise.
 */
function defaultCompare(prevProps: Props, nextProps: Props): boolean {
    if (Object.keys(prevProps).length !== Object.keys(nextProps).length) {
        return false;
    }

    for (const key in prevProps) {
        if (prevProps[key] !== nextProps[key]) {
            return false;
        }
    }

    return true;
}
