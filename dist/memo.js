import { propsCompareFnSymbol } from './jsx.js';
export function shallowEqual(prevProps, nextProps) {
    if (prevProps === nextProps)
        return true;
    const prevKeys = Object.keys(prevProps);
    const nextKeys = Object.keys(nextProps);
    if (prevKeys.length !== nextKeys.length)
        return false;
    for (let i = 0; i < prevKeys.length; i++) {
        const key = prevKeys[i];
        if (prevProps[key] !== nextProps[key])
            return false;
    }
    return true;
}
export function memo(Component, compareFn = shallowEqual) {
    function Memo(props) {
        // @ts-ignore
        return Component(props);
    }
    Memo[propsCompareFnSymbol] = compareFn;
    return Memo;
}
