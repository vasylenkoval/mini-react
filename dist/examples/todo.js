/** @jsx jsx */
import { createRoot } from '../fiber.js';
import { jsx } from '../jsx.js';
import { useState, useReducer } from '../hooks.js';
// index
function App() {
    return (jsx("div", { className: "App" },
        jsx(TodoList, null)));
}
// New Todo Form
let todoId = 0;
function NewTodoForm({ task, createTodo }) {
    const [userInput, setUserInput] = useReducer((state, newState) => ({ ...state, ...newState }), {
        task: '',
    });
    const handleChange = (evt) => {
        console.log(evt.target.value);
        setUserInput({ [evt.target.name]: evt.target.value });
    };
    const handleSubmit = (evt) => {
        evt.preventDefault();
        const newTodo = { id: todoId++, task: userInput.task, completed: false };
        createTodo(newTodo);
        setUserInput({ task: '' });
    };
    return (jsx("form", { className: "NewTodoForm", onSubmit: handleSubmit },
        jsx("label", { htmlFor: "task" }, "New todo"),
        jsx("input", { value: userInput.task, onChange: handleChange, id: "task", type: "text", name: "task", placeholder: "New Todo" }),
        jsx("button", null, "Add Todo")));
}
// TODO
function Todo({ key, todo, remove, update, toggleComplete, }) {
    const [isEditing, setIsEditing] = useState(false);
    const [task, setTask] = useState(todo.task);
    const handleClick = (id) => {
        remove(id);
    };
    const toggleFrom = (evt) => {
        console.log(evt);
        setIsEditing(!isEditing);
    };
    const handleUpdate = (evt) => {
        evt.preventDefault();
        update(todo.id, task);
        toggleFrom();
    };
    const handleChange = (evt) => {
        setTask(evt.target.value);
    };
    const toggleCompleted = (evt) => {
        toggleComplete(evt.target.id);
    };
    let result;
    if (isEditing) {
        result = (jsx("div", { className: "Todo" },
            jsx("form", { className: "Todo-edit-form", onSubmit: handleUpdate },
                jsx("input", { onChange: handleChange, value: task, type: "text" }),
                jsx("button", null, "Save"))));
    }
    else {
        console.log(todo.id);
        result = (jsx("div", { className: "Todo" },
            jsx("li", { id: todo.id, onClick: toggleCompleted, className: todo.completed ? 'Todo-task completed' : 'Todo-task' }, todo.task),
            jsx("div", { className: "Todo-buttons" },
                jsx("button", { onClick: toggleFrom },
                    jsx("i", { className: "fas fa-pen" })),
                jsx("button", { onClick: () => handleClick(todo.id) }, "DELETE"))));
    }
    return result;
}
function TodoList() {
    const [todos, setTodos] = useState([
        { id: todoId++, task: 'task 1', completed: false },
        { id: todoId++, task: 'task 2', completed: true },
    ]);
    const create = (newTodo) => {
        setTodos([...todos, newTodo]);
    };
    const remove = (id) => {
        setTodos(todos.filter((todo) => todo.id !== id));
    };
    const update = (id, updtedTask) => {
        const updatedTodos = todos.map((todo) => {
            if (todo.id === id) {
                return { ...todo, task: updtedTask };
            }
            return todo;
        });
        setTodos(updatedTodos);
    };
    const toggleComplete = (id) => {
        const updatedTodos = todos.map((todo) => {
            if (todo.id === id) {
                return { ...todo, completed: !todo.completed };
            }
            return todo;
        });
        setTodos(updatedTodos);
    };
    const todosList = todos.map((todo) => (jsx(Todo, { toggleComplete: toggleComplete, update: update, remove: remove, key: todo.id, todo: todo })));
    return (jsx("div", { className: "TodoList" },
        jsx("h1", null,
            "Todo List ",
            jsx("span", null, "A simple React Todo List App")),
        jsx("ul", null, todosList),
        jsx(NewTodoForm, { createTodo: create })));
}
const root = document.getElementById('root');
if (root) {
    createRoot(root, jsx(App, null));
}
