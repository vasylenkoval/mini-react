/** @jsx jsx */
import { jsx, memo, useReducer, useMemo } from '../index.js';
const random = (max) => Math.round(Math.random() * 1000) % max;
const A = [
    'pretty',
    'large',
    'big',
    'small',
    'tall',
    'short',
    'long',
    'handsome',
    'plain',
    'quaint',
    'clean',
    'elegant',
    'easy',
    'angry',
    'crazy',
    'helpful',
    'mushy',
    'odd',
    'unsightly',
    'adorable',
    'important',
    'inexpensive',
    'cheap',
    'expensive',
    'fancy',
];
const C = [
    'red',
    'yellow',
    'blue',
    'green',
    'pink',
    'brown',
    'purple',
    'brown',
    'white',
    'black',
    'orange',
];
const N = [
    'table',
    'chair',
    'house',
    'bbq',
    'desk',
    'car',
    'pony',
    'cookie',
    'sandwich',
    'burger',
    'pizza',
    'mouse',
    'keyboard',
];
let nextId = 1;
const buildData = (count) => {
    const data = new Array(count);
    for (let i = 0; i < count; i++) {
        data[i] = {
            id: nextId++,
            label: `${A[random(A.length)]} ${C[random(C.length)]} ${N[random(N.length)]}`,
        };
    }
    return data;
};
const initialState = {
    data: [],
    selected: 0,
};
const listReducer = (state, action) => {
    const { data, selected } = state;
    switch (action.type) {
        case 'RUN':
            return { data: buildData(1000), selected: 0 };
        case 'RUN_LOTS':
            return { data: buildData(10000), selected: 0 };
        case 'ADD':
            return { data: data.concat(buildData(1000)), selected };
        case 'UPDATE': {
            const newData = data.slice(0);
            for (let i = 0; i < newData.length; i += 10) {
                const r = newData[i];
                newData[i] = { id: r.id, label: r.label + ' !!!' };
            }
            return { data: newData, selected };
        }
        case 'CLEAR':
            return { data: [], selected: 0 };
        case 'SWAP_ROWS':
            const newdata = [...data];
            if (data.length > 998) {
                const d1 = newdata[1];
                const d998 = newdata[998];
                newdata[1] = d998;
                newdata[998] = d1;
            }
            return { data: newdata, selected };
        case 'REMOVE': {
            const idx = data.findIndex((d) => d.id === action.id);
            return { data: [...data.slice(0, idx), ...data.slice(idx + 1)], selected };
        }
        case 'SELECT':
            return { data, selected: action.id };
        default:
            return state;
    }
};
const Row = memo(({ selected, item, dispatch, }) => {
    return (jsx("tr", { className: selected ? 'danger' : '' },
        jsx("td", { className: "col-md-1" }, item.id),
        jsx("td", { className: "col-md-4" },
            jsx("a", { onClick: useMemo(() => () => dispatch({ type: 'SELECT', id: item.id }), []) }, item.label)),
        jsx("td", { className: "col-md-1" },
            jsx("a", { onClick: useMemo(() => () => dispatch({ type: 'REMOVE', id: item.id }), []) },
                jsx("span", { className: "glyphicon glyphicon-remove", "aria-hidden": "true" }))),
        jsx("td", { className: "col-md-6" })));
}, (prevProps, nextProps) => {
    return prevProps.selected === nextProps.selected && prevProps.item === nextProps.item;
});
const Button = ({ id, cb, title }) => (jsx("div", { className: "col-sm-6 smallpad" },
    jsx("button", { type: "button", className: "btn btn-primary btn-block", id: id, onClick: cb }, title)));
const Jumbotron = memo(({ dispatch }) => (jsx("div", { className: "jumbotron" },
    jsx("div", { className: "row" },
        jsx("div", { className: "col-md-6" },
            jsx("h1", null, "React Hooks keyed")),
        jsx("div", { className: "col-md-6" },
            jsx("div", { className: "row" },
                jsx(Button, { id: "run", title: "Create 1,000 rows", cb: () => dispatch({ type: 'RUN' }) }),
                jsx(Button, { id: "runlots", title: "Create 10,000 rows", cb: () => dispatch({ type: 'RUN_LOTS' }) }),
                jsx(Button, { id: "add", title: "Append 1,000 rows", cb: () => dispatch({ type: 'ADD' }) }),
                jsx(Button, { id: "update", title: "Update every 10th row", cb: () => dispatch({ type: 'UPDATE' }) }),
                jsx(Button, { id: "clear", title: "Clear", cb: () => dispatch({ type: 'CLEAR' }) }),
                jsx(Button, { id: "swaprows", title: "Swap Rows", cb: () => dispatch({ type: 'SWAP_ROWS' }) })))))), () => true);
export const BenchMain = ({ dispatchRef, }) => {
    const [{ data, selected }, dispatch] = useReducer(listReducer, initialState);
    dispatchRef.current = dispatch;
    return (jsx("div", { className: "container" },
        jsx(Jumbotron, { dispatch: dispatch }),
        jsx("table", { className: "table table-hover table-striped test-data" },
            jsx("tbody", null, data.map((item) => (jsx(Row, { key: item.id, item: item, selected: selected === item.id, dispatch: dispatch }))))),
        jsx("span", { className: "preloadicon glyphicon glyphicon-remove", "aria-hidden": "true" })));
};
// createRoot(document.getElementById('root')!, <BenchMain />);
