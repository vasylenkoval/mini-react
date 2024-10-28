/** @jsx jsx */
import { createRoot, jsx } from '../index.js';
import { BenchMain } from './app.js';
const emptyObj = {};
const FAKE_DOM = {
    createNode: () => emptyObj,
    addProps: () => void 0,
    removeChild: () => void 0,
    replaceWith: () => void 0,
    appendChild: () => void 0,
};
const dispatchRef = { current: null };
const start = performance.now();
createRoot(void 0, jsx(BenchMain, { dispatchRef: dispatchRef }), FAKE_DOM);
if (!dispatchRef.current) {
    throw new Error('dispatch did not bind');
}
dispatchRef.current({ type: 'RUN' });
dispatchRef.current({ type: 'UPDATE' });
dispatchRef.current({ type: 'CLEAR' });
const end = performance.now();
console.log(`bench-1k: took ${end - start} ms`);
