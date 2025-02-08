import { defaultPropsCompareFn } from './fiber.js';
import { propsCompareFnSymbol } from './jsx.js';
export function memo(Component, compareFn = defaultPropsCompareFn) {
    function Memo(props) {
        // @ts-ignore
        return Component(props);
    }
    Memo[propsCompareFnSymbol] = compareFn;
    return Memo;
}
