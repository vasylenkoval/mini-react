import { useRef } from './hooks.js';
import { JSXElement, Props, jsx } from './jsx.js';

type CacheRef = { prevProps: Props; prevJsx: JSXElement } | undefined;

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
    function Memo(props: Props): JSXElement {
        debugger;
        const cacheRef = useRef<CacheRef>(undefined);
        if (!cacheRef.current) {
            // @ts-ignore
            cacheRef.current = { prevProps: props, prevJsx: jsx(Component, props) };
            return cacheRef.current.prevJsx;
        }

        if (compareFn(cacheRef.current.prevProps, props)) {
            return cacheRef.current.prevJsx;
        }

        cacheRef.current.prevProps = props;
        // @ts-ignore
        cacheRef.current.prevJsx = jsx(Component, props);
        return cacheRef.current.prevJsx;
    }

    return Memo as T;
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
