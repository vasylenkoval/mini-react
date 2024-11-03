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
console.profile('bench-10k');
const start = performance.now();
createRoot(void 0, jsx(BenchMain, { dispatchRef: dispatchRef }), FAKE_DOM);
if (!dispatchRef.current) {
    throw new Error('dispatch did not bind');
}
dispatchRef.current({ type: 'RUN_LOTS' });
dispatchRef.current({ type: 'UPDATE' });
dispatchRef.current({ type: 'UPDATE' });
dispatchRef.current({ type: 'UPDATE' });
dispatchRef.current({ type: 'UPDATE' });
dispatchRef.current({ type: 'UPDATE' });
const end = performance.now();
console.log(`bench-10k: took ${end - start} ms`);
console.profileEnd('bench-10k');
