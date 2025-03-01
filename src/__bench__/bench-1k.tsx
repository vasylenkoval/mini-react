/** @jsx jsx */
import { createRoot, jsx, type Props } from '../index.js';
import { BenchMain, type BenchDispatch } from './app.js';

type FAKEDOM = {
    createNode: (type: string) => Node;
    addProps: (fiberRef: unknown, node: Node, props: Props, prevProps: Props | null) => void;
    removeChild: (parent: Node, child: Node) => void;
    appendChild: (parent: Node, child: Node) => void;
    replaceWith: (oldNode: ChildNode, newNode: Node) => void;
    insertBefore: (parent: Node, child: Node, before: Node | null) => void;
};

const emptyObj = {};
const FAKE_DOM: FAKEDOM = {
    createNode: () => emptyObj as any,
    addProps: () => void 0,
    removeChild: () => void 0,
    replaceWith: () => void 0,
    appendChild: () => void 0,
    insertBefore: () => void 0,
};

const dispatchRef: { current: BenchDispatch | null } = { current: null };
const start = performance.now();
createRoot(void 0 as any, <BenchMain dispatchRef={dispatchRef} />, FAKE_DOM);
if (!dispatchRef.current) {
    throw new Error('dispatch did not bind');
}

dispatchRef.current({ type: 'RUN_LOTS' });
dispatchRef.current({ type: 'UPDATE' });
dispatchRef.current({ type: 'UPDATE' });
dispatchRef.current({ type: 'UPDATE' });
dispatchRef.current({ type: 'UPDATE' });
dispatchRef.current({ type: 'UPDATE' });
dispatchRef.current({ type: 'UPDATE' });
dispatchRef.current({ type: 'UPDATE' });
dispatchRef.current({ type: 'UPDATE' });
dispatchRef.current({ type: 'UPDATE' });
dispatchRef.current({ type: 'UPDATE' });

const end = performance.now();

console.log(`bench-1k: took ${end - start} ms`);
