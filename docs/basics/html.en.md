# HTML: structure and semantics

!!! tip "Skip this page if you already know…"

    - that the tag you pick changes **behaviour**, not only appearance;
    - the difference between a block element and an inline element;
    - why `<div onClick>` is not a button;
    - what the browser builds from your markup (the accessibility tree).

## The problem

This code works. Click it and the `alert` shows up:

```html
<div class="button" onclick="alert('saved')">Save</div>
```

And it is still wrong in four ways at once, all of them invisible to someone who
only tested with a mouse:

- **It cannot be focused.** `Tab` never reaches it.
- **It ignores the keyboard.** `Enter` and `Space` fire nothing.
- **It does not announce itself.** A screen reader reads "Save", not "Save,
  button".
- **It cannot be disabled.** There is no `disabled` on a `<div>`.

Change one word and all four disappear:

```html
<button class="button" onclick="alert('saved')">Save</button>
```

That is **semantics**: the tag is not a decorative label, it is a behaviour
contract with the browser.

## A complete document

Save it as `index.html` and open it in a browser — a whole file, no dependencies:

```html
<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Task list</title>
    </head>
    <body>
        <header>
            <h1>My tasks</h1>
        </header>

        <main>
            <section aria-labelledby="pending">
                <h2 id="pending">Pending</h2>
                <ul>
                    <li>Buy coffee</li>
                    <li>Write the docs</li>
                </ul>
            </section>

            <button type="button" onclick="alert('new task')">New task</button>
        </main>

        <footer>
            <p>Built with plain HTML.</p>
        </footer>
    </body>
</html>
```

### Piece by piece

| Line                      | Why it is there                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| `<!doctype html>`         | Puts the browser in **standards mode**. Without it you get "quirks mode" and CSS behaves like in 1998. |
| `lang="en"`               | Tells the screen reader **which language to read** and the browser how to hyphenate.                   |
| `<meta charset="utf-8">`  | Without it, accented characters turn into garbage. It comes before any text.                           |
| `<meta name="viewport">`  | Without it, phones render a 980px page and zoom out. It is what makes responsive design exist.         |
| `<main>`                  | Marks the primary content. Screen readers offer "skip to content" because of it.                       |
| `<h1>`/`<h2>`             | Form the document **outline**. Do not pick the level by font size — that is the CSS's job.             |
| `<ul>`/`<li>`             | The screen reader announces "list, 2 items". A stack of `<div>`s announces nothing.                    |
| `aria-labelledby`         | Ties the `<section>` to its own `<h2>`, so the region has a name.                                      |

!!! warning "One `<h1>` per page, and no skipped levels"

    `<h1>` → `<h3>` with no `<h2>` in between breaks heading navigation, which is
    how many people read a whole page. If the `<h2>` looks too big, fix it in CSS,
    not by swapping the tag.

## Block and inline

Every element has a default flow behaviour:

- **Block** (`<div>`, `<p>`, `<section>`, `<h1>`, `<ul>`) takes the full width and
  pushes the next thing down.
- **Inline** (`<span>`, `<a>`, `<strong>`, `<em>`) takes only what the content
  needs and stays on the same line.

This is the **default**, not a law: CSS changes it with `display`. But the default
is what you see before writing a single line of CSS, and understanding it answers
half of the "why is this element stretched?" questions.

!!! info "`<div>` and `<span>` are not forbidden"

    They are the tags **without** semantics, and they exist precisely for when
    there is no meaning to declare — a wrapper that only exists for layout, say.
    The mistake is not using them; it is using them in place of a tag that **had**
    meaning.

## The accessibility tree

From your markup the browser builds two trees: the **DOM**, which CSS and JS
manipulate, and the **accessibility tree**, which is what screen readers, keyboard
navigation and test automation actually see.

`<button>` enters that second tree as `role=button`, focusable, with the accessible
name "Save". `<div onclick>` enters as a generic node, no role and no name. That is
why swapping the tag fixes four bugs at once: you did not add behaviour, you
declared what the thing **is**.

!!! tip "This is testable, and the SDK tests it"

    `@testing-library/react` queries through the accessibility tree —
    `getByRole("button", { name: "Save" })`. A test written that way fails on
    `<div onclick>` and passes on `<button>`. It is the same reason the SDK runs an
    `axe` sweep in jsdom: markup without semantics fails before the merge.

## Where it shows up in the SDK

`tempest-react-sdk` components render **the right tag**, not a styled `<div>` — and
that is what makes the keyboard and the screen reader work for free in your app:

| Component                    | Renders                           |
| ---------------------------- | --------------------------------- |
| `<Button>`                   | a real `<button>`                 |
| `<Table>`                    | `<table>` / `<thead>` / `<tbody>` |
| `<Input>`                    | `<label htmlFor>` + `<input>`     |

`<Stack>` is the exception that proves the rule: it renders a flex `<div>`, because
its job is **only** layout — there is no meaning to declare. When you need a real
list, use `<ul>`; when you need a table, use `<Table>`.

## Recap

- The tag you pick is a **behaviour contract**, not a visual label. ✅
- `<button>` brings focus, keyboard, role and `disabled` for free; `<div onclick>`
  brings none of the four.
- `<!doctype>`, `lang`, `charset` and `viewport` are the four lines that make a
  page behave — none of them is optional.
- Headings form the document outline: one `<h1>`, no skipped levels, size resolved
  in CSS.
- `<div>` and `<span>` are the tags **without** semantics, for when there is no
  meaning to declare.

📚 **Canonical reference:** [MDN — HTML](https://developer.mozilla.org/en-US/docs/Web/HTML)

➡️ **Next page:** [Forms and accessibility](html-forms.md)
