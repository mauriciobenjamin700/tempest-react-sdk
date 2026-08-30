# React: component, state, effect

!!! tip "Skip this page if you already know…"

    - that a component is a function returning JSX;
    - the difference between a prop and state;
    - the two rules of hooks, and why they exist;
    - what `key` does in a list, and when it forces a remount.

## The problem

Without React, keeping the screen in sync with the data is manual work and the bug
is always the same — the data changed in one place and you forgot to update the
screen in another:

```js
let counter = 0;

document.querySelector("#more").addEventListener("click", () => {
    counter++;
    document.querySelector("#value").textContent = counter; // ← and the other 4 places?
});
```

React inverts it: you describe **how the screen should look for a given state**, and
when the state changes it recomputes the description and applies only the difference
to the DOM. You never write `textContent`.

## A complete component

A whole app in one file. It is the mental model the
[Tutorial](../tutorial/index.md) assumes from page one:

```tsx
import { useState, useEffect } from "react";

interface Task {
    id: string;
    title: string;
    done: boolean;
}

function TaskItem({ task, onToggle }: { task: Task; onToggle: (id: string) => void }) {
    return (
        <li>
            <label>
                <input type="checkbox" checked={task.done} onChange={() => onToggle(task.id)} />
                {task.title}
            </label>
        </li>
    );
}

export function TaskList() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [draft, setDraft] = useState("");

    useEffect(() => {
        document.title = `${tasks.filter((t) => !t.done).length} pending`;
    }, [tasks]);

    function add() {
        if (!draft.trim()) return;
        setTasks((current) => [...current, { id: crypto.randomUUID(), title: draft, done: false }]);
        setDraft("");
    }

    function toggle(id: string) {
        setTasks((current) => current.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
    }

    return (
        <section>
            <h1>Tasks</h1>

            <input value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button type="button" onClick={add}>
                Add
            </button>

            <ul>
                {tasks.map((task) => (
                    <TaskItem key={task.id} task={task} onToggle={toggle} />
                ))}
            </ul>
        </section>
    );
}
```

## Piece by piece

### JSX is an expression

`<li>...</li>` is neither a string nor HTML: it is syntactic sugar for a function
call returning an object that describes the element. Hence `className` instead of
`class` (`class` is a reserved word in JS) and `htmlFor` instead of `for`, and hence
`{expression}` interpolating real JavaScript.

### Props come in, state lives here

- A **prop** is the component function's argument. It comes from the parent and is
  **read-only**.
- **State** is the value the component keeps between renders. It changes through the
  `set` function, and changing it triggers a new render.

`TaskItem` has no state at all: it receives `task` and `onToggle` and draws. A
component like that is trivial to test and to reuse.

### State is immutable — always a new value

```tsx
setTasks((current) => [...current, newTask]); // ✅ a new array
tasks.push(newTask); // ❌ React sees no change at all
```

React compares with `Object.is` ([value vs. reference](js.md)). Mutating the array
does not change the reference, so the render never happens. And use the **function
form** (`current => ...`) whenever the next value depends on the previous one: it
reads the value at apply time, not the one captured by the render's closure.

### Effects are for stepping outside React

`useEffect` runs **after** rendering, and exists to synchronise with something
external: the document title, a listener, a timer, a request. The dependency array
says when to repeat it.

```tsx
useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id); // cleanup: runs before repeating and on unmount
}, [tick]);
```

!!! warning "Effects are not for deriving data"

    If a value can be **computed** from state you already hold, compute it during
    render — do not keep it in a second state synchronised by an effect. Derived
    state is a copy that can go stale, and the effect that maintains it is one extra
    render.

    ```tsx
    const pending = tasks.filter((t) => !t.done).length; // ✅ derived during render
    ```

### The two rules of hooks

1. **Top level only.** Never inside an `if`, a loop or a nested function.
2. **From inside React only.** From a component (`PascalCase`) or from another hook
   (a name starting with `use`).

The reason for the first is that React identifies each hook by **call order**, not
by name. A `useState` behind an `if` changes the order between renders, and hook 2's
state lands in hook 3.

The second is what ESLint can verify: the `react-hooks/rules-of-hooks` rule only
accepts hooks inside a `PascalCase` function or a `use*`-named one. A helper called
`checkPermission` that calls a hook **fails your app's lint**, even though it works.

### `key`: identity, not index

In a list, `key` tells React **which item is which** between one render and the
next. With `key={task.id}`, removing the first item removes the first node. With
`key={index}`, React believes every item changed contents — and each row's internal
state (focus, typed text) slides into the neighbouring row.

!!! info "A different key forces a remount — and that is a tool"

    When an element's `key` changes, React **unmounts** the old one and mounts a new
    one with fresh state. It is the idiomatic way of saying "this is now a different
    thing": `<Profile key={userId} />` guarantees that switching users does not leave
    the previous user's state on screen.

## Where it shows up in the SDK

`tempest-react-sdk` is made of this page's two halves: **components**, which you
compose, and **hooks**, which bring behaviour.

```tsx
import { AppProviders, Button, Input, useDebounce } from "tempest-react-sdk";
import { useState } from "react";

export function Search() {
    const [text, setText] = useState("");
    const debouncedText = useDebounce(text, 300);

    return (
        <AppProviders>
            <Input label="Search" value={text} onChange={(e) => setText(e.target.value)} />
            <Button onClick={() => console.log(debouncedText)}>Search</Button>
        </AppProviders>
    );
}
```

That is 128 components and 116 hooks, but the contract is always this one: a
component takes props and draws; a hook takes input and returns state plus
functions.

## Recap

- A component is a function returning JSX; you describe the screen **for a state**,
  and React applies the difference. ✅
- Props come from outside and are read-only; state lives in the component and
  changing it triggers a render.
- State is immutable: create a new value, and use the function form when it depends
  on the previous one.
- Effects synchronise with the world outside React, with cleanup; derivable data is
  computed during render.
- Hooks: top level only, and only inside a component or another `use*` hook.
- `key` is identity — an `id`, never an index; and deliberately changing a `key`
  remounts with clean state.

📚 **Canonical reference:** [React — Learn React](https://react.dev/learn)

🎉 **End of the track.** You now have everything the tutorial assumes.
➡️ **Continue at:** [Tutorial — Start here](../tutorial/index.md)
