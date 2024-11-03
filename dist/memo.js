import { useRef } from './hooks.js';
import { jsx } from './jsx.js';
/**
 * Saves the previous output of a component and only re-renders if the props have changed.
 * @param component - Component to memoize.
 * @param compareFn - Function to compare the previous and next props.
 * @returns Memoized component.
 */
export function memo(Component, compareFn = defaultCompare) {
    function Memo(props) {
        debugger;
        const cacheRef = useRef(undefined);
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
    return Memo;
}
/**
 * Default comparison function for memoized components.
 * @param prevProps - Previous props.
 * @param nextProps - Next props.
 * @returns True if the props are the same, false otherwise.
 */
function defaultCompare(prevProps, nextProps) {
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
