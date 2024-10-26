# ⚛️ Mini React

A work-in-progress, toy re-implementation of a subset of React's public API for learning purposes. Originally based on Rodrigo Pombo's [Build your own React](https://pomb.us/build-your-own-react/). It does not aim to be used in production, but rather to explore how virtual dom libraries work under the hood.

## Example apps

-   [js-framework-benchmark-example](https://vasylenkoval.github.io/mini-react/cards.html): [source](https://github.com/vasylenkoval/mini-react/blob/main/src/examples/bench.tsx)
-   [cards-example](https://vasylenkoval.github.io/mini-react/cards.html): [source](https://github.com/vasylenkoval/mini-react/blob/main/src/examples/cards.tsx).

## Implemented

-   JSX factory
-   Virtual DOM representation similar to React where nodes are processed in units of work (but here workloop is sync for now).
-   Splits work in two phases: render and commit.
-   Functional components
-   Keyed reconciliation
-   Memoization
-   Hooks: `useState`, `useEffect`, `useRef`, `useMemo`
