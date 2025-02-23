import { JSXElement, Props, propsCompareFnSymbol } from './jsx.js';

export function shallowEqual(prevProps: Props, nextProps: Props): boolean {
    if (prevProps === nextProps) return true;

    const prevKeys = Object.keys(prevProps);
    const nextKeys = Object.keys(nextProps);

    if (prevKeys.length !== nextKeys.length) return false;

    for (let i = 0; i < prevKeys.length; i++) {
        const key = prevKeys[i];
        if (prevProps[key] !== nextProps[key]) return false;
    }

    return true;
}

export function memo<T extends (...args: any[]) => any, TProps extends Props = Parameters<T>[0]>(
    Component: T,
    compareFn: (prevProps: TProps, nextProps: TProps) => boolean = shallowEqual
): T {
    debugger;
    function Memo(props: Props): JSXElement {
        // @ts-ignore
        return Component(props);
    }
    Memo[propsCompareFnSymbol] = compareFn;
    return Memo as unknown as T;
}
