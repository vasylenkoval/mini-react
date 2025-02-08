import { useRef } from './hooks.js';
function ForEach({ data, render }) {
    // Cache previously rendered items and their rendered JSX
    const cacheRef = useRef({ rendered: [] });
    const prevItems = cacheRef.current.items;
    let newRendered;
    if (prevItems === data) {
        // Same array reference: reuse the rendered output
        newRendered = cacheRef.current.rendered;
    }
    else {
        // New array reference: reuse individual element outputs if they are identical,
        // otherwise re-run the render function.
        newRendered = data.map((item, index) => {
            if (prevItems && prevItems[index] === item && cacheRef.current.rendered[index]) {
                return cacheRef.current.rendered[index];
            }
            return render(item, index);
        });
        // Update cache with new array and generated output
        cacheRef.current = { items: data, rendered: newRendered };
    }
    return newRendered;
}
export { ForEach };
