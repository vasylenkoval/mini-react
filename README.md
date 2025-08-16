# ⚛️ Mini React

A work-in-progress, toy re-implementation of a subset of React's public API for learning purposes. Originally based on Rodrigo Pombo's [Build your own React](https://pomb.us/build-your-own-react/). It does not aim to be used in production, but rather to explore how virtual dom libraries work under the hood.

## Example apps

-   js-framework-benchmark (copied from [react-hooks](https://github.com/krausest/js-framework-benchmark/blob/master/frameworks/keyed/react-hooks/src/main.jsx))
    -   [Source](https://github.com/vasylenkoval/mini-react/blob/main/src/examples/bench.jsx)
    -   [Preview](https://vasylenkoval.github.io/mini-react/bench.html)

-   Simple cards example
    -   [Source](https://github.com/vasylenkoval/mini-react/blob/main/src/examples/cards.tsx)
    -   [Preview](https://vasylenkoval.github.io/mini-react/cards.html)

## Implemented

-   JSX factory
-   Virtual DOM representation similar to React where nodes are processed in units of work (but here workloop is sync for now).
-   Splits work in two phases: render and commit.
-   Functional components
-   Keyed reconciliation
-   Memoization primitives
-   Hooks: `useState`, `useEffect`, `useRef`, `useMemo`, `useReducer`
