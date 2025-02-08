import { defaultPropsCompareFn } from './fiber.js';
import { JSXElement, Props, jsx, propsCompareFnSymbol } from './jsx.js';

export function memo<T>(
    Component: T,
    compareFn: (prevProps: Props, nextProps: Props) => boolean = defaultPropsCompareFn
): T {
    function Memo(props: Props): JSXElement {
        // @ts-ignore
        return Component(props);
    }
    Memo[propsCompareFnSymbol] = compareFn;
    return Memo as T;
}
