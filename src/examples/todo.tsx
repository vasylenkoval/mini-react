/** @jsx jsx */
import { createRoot } from '../fiber.js';
import { jsx, JSXElement } from '../jsx.js';
import { useState, useEffect, useReducer } from '../hooks.js';

// index
function App() {
    return (
        <div className="App">
            <TodoList />
        </div>
    );
}

// New Todo Form
let todoId = 0;
function NewTodoForm({ task, createTodo }: { task?: any; createTodo?: any }) {
    const [userInput, setUserInput] = useReducer(
        (state: any, newState: any) => ({ ...state, ...newState }),
        {
            task: '',
        }
    );

    const handleChange = (evt: any) => {
        console.log(evt.target.value);
        setUserInput({ [evt.target.name]: evt.target.value });
    };

    const handleSubmit = (evt: any) => {
        evt.preventDefault();
        const newTodo = { id: todoId++, task: userInput.task, completed: false };
        createTodo(newTodo);
        setUserInput({ task: '' });
    };

    return (
        <form className="NewTodoForm" onSubmit={handleSubmit}>
            <label htmlFor="task">New todo</label>
            <input
                value={userInput.task}
                onChange={handleChange}
                id="task"
                type="text"
                name="task"
                placeholder="New Todo"
            />
            <button>Add Todo</button>
        </form>
    );
}

// TODO

function Todo({
    key,
    todo,
    remove,
    update,
    toggleComplete,
}: {
    key: any;
    todo: any;
    remove: any;
    update: any;
    toggleComplete: any;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [task, setTask] = useState(todo.task);

    const handleClick = (id: any) => {
        remove(id);
    };
    const toggleFrom = (evt?: any) => {
        console.log(evt);
        setIsEditing(!isEditing);
    };
    const handleUpdate = (evt: any) => {
        evt.preventDefault();
        update(todo.id, task);
        toggleFrom();
    };
    const handleChange = (evt: any) => {
        setTask(evt.target.value);
    };
    const toggleCompleted = (evt: any) => {
        toggleComplete(evt.target.id);
    };

    let result;
    if (isEditing) {
        result = (
            <div className="Todo">
                <form className="Todo-edit-form" onSubmit={handleUpdate}>
                    <input onChange={handleChange} value={task} type="text" />
                    <button>Save</button>
                </form>
            </div>
        );
    } else {
        console.log(todo.id);
        result = (
            <div className="Todo">
                <li
                    id={todo.id}
                    onClick={toggleCompleted}
                    className={todo.completed ? 'Todo-task completed' : 'Todo-task'}
                >
                    {todo.task}
                </li>
                <div className="Todo-buttons">
                    <button onClick={toggleFrom}>Edit</button>
                    <button onClick={() => handleClick(todo.id)}>DELETE</button>
                </div>
            </div>
        );
    }
    return result;
}

function TodoList() {
    const [todos, setTodos] = useState([
        { id: todoId++, task: 'task 1', completed: false },
        { id: todoId++, task: 'task 2', completed: true },
    ]);

    const create = (newTodo: any) => {
        setTodos([...todos, newTodo]);
    };

    const remove = (id: any) => {
        setTodos(todos.filter((todo) => todo.id !== id));
    };

    const update = (id: any, updtedTask: any) => {
        const updatedTodos = todos.map((todo) => {
            if (todo.id === id) {
                return { ...todo, task: updtedTask };
            }
            return todo;
        });
        setTodos(updatedTodos);
    };

    const toggleComplete = (id: any) => {
        const updatedTodos = todos.map((todo) => {
            if (todo.id === id) {
                return { ...todo, completed: !todo.completed };
            }
            return todo;
        });
        setTodos(updatedTodos);
    };

    const todosList = todos.map((todo) => (
        <Todo
            toggleComplete={toggleComplete}
            update={update}
            remove={remove}
            key={todo.id}
            todo={todo}
        />
    ));

    return (
        <div className="TodoList">
            <h1>
                Todo List <span>A simple React Todo List App</span>
            </h1>
            <ul>{todosList}</ul>
            <NewTodoForm createTodo={create} />
        </div>
    );
}

const root = document.getElementById('root');
if (root) {
    createRoot(root, <App />);
}
