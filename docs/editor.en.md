# Rich Text Editor (`tempest-react-sdk/editor`)

A controlled WYSIWYG editor built on [tiptap](https://tiptap.dev). It lives in
its own subpath (`tempest-react-sdk/editor`) because tiptap is heavy — and apps
that **don't** use the editor pay nothing for it.

## Why a separate subpath?

A rich-text editor drags in a large dependency tree (tiptap + ProseMirror).
Forcing that on every app that installs the SDK would be unfair to anyone who
just wants a `Button` and a `createApiClient`.

The fix is the same pattern as the SDK's other wrappers: **the caller injects the
heavy dependency**. `RichTextEditor` imports `@tiptap/react` and
`@tiptap/starter-kit`, but those packages are **optional peer deps** — declared
as optional in the SDK and externalized from the bundle. As a result:

- Editor users install tiptap explicitly, once.
- Non-users never pull tiptap into their bundle — the subpath stays out of the
  root barrel.

!!! tip "Import from the subpath, not the root barrel"
    `RichTextEditor` only exists in `tempest-react-sdk/editor`. It is **not**
    re-exported from `tempest-react-sdk` — so tiptap never leaks into the bundle
    of apps that only import the main barrel.

## Installation

Install the SDK as usual and add the two tiptap peers:

```bash
npm install tempest-react-sdk
npm install @tiptap/react @tiptap/starter-kit
```

!!! info "Why the peers are optional"
    `@tiptap/react` and `@tiptap/starter-kit` are declared as **optional**
    `peerDependencies`. Apps that never import `tempest-react-sdk/editor` can
    ignore them without an install warning. The moment you import the editor
    without them installed, the bundler reports the missing module — just run the
    `npm install` above.

## Styles

`RichTextEditor` uses CSS Modules with `--tempest-*` tokens, so it already
follows your app's theme (light/dark) with no extra config. Just import the
SDK's `styles.css` once in your app entry (you already do this for the other
components):

```ts
// src/main.tsx
import "tempest-react-sdk/styles.css";
```

The editable area (the `.ProseMirror`) and the toolbar inherit text color,
border, focus ring, and radius from the `--tempest-*` tokens. To customize,
override the tokens on `:root` like any other component — see
[Styles & tokens](./styles.md).

## API

```tsx
<RichTextEditor
  value={html} // controlled HTML string (required)
  onChange={setHtml} // (html: string) => void (required)
  placeholder="Write something…" // text shown when empty (optional)
  editable // false = read-only (default true)
  toolbar // false = hide the toolbar (default true)
  className="my-editor" // extra classes on the wrapper (optional)
/>
```

| Prop          | Type                      | Default | Description                                       |
| ------------- | ------------------------- | ------- | ------------------------------------------------- |
| `value`       | `string`                  | —       | Editor content as **HTML** (controlled).          |
| `onChange`    | `(html: string) => void`  | —       | Called with the updated HTML on every change.     |
| `placeholder` | `string`                  | —       | Text shown when the editor is empty.              |
| `editable`    | `boolean`                 | `true`  | `false` makes the content read-only.              |
| `toolbar`     | `boolean`                 | `true`  | `false` hides the formatting toolbar.             |
| `className`   | `string`                  | —       | Extra classes applied to the wrapper element.     |

### The built-in toolbar

When `toolbar` is `true` (default), the editor renders a bar above the editable
area with the `StarterKit` commands:

- **Bold**, **Italic**, **Strike**, **Code** (inline)
- **Heading 1**, **Heading 2**
- **Bullet list**, **Ordered list**, **Blockquote**
- **Undo** / **Redo** (disabled when there's no history)

The buttons reflect the cursor state (they become active when the selection is
already bold, inside a list, etc.) and carry `aria-label` + `aria-pressed` for
accessibility.

## Full example — a controlled editor

A copy-paste, end-to-end program. The HTML state lives in React via `useState`,
the editor reflects it, and a `<details>` shows the emitted HTML live.

```tsx
import { useState } from "react";
import { RichTextEditor } from "tempest-react-sdk/editor";
import "tempest-react-sdk/styles.css";

export function ArticleEditor() {
  const [html, setHtml] = useState<string>("<p>Start writing your article…</p>");

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <h1>New article</h1>

      <RichTextEditor
        value={html}
        onChange={setHtml}
        placeholder="Write something great…"
      />

      <details style={{ marginTop: 16 }}>
        <summary>Emitted HTML</summary>
        <pre>{html}</pre>
      </details>
    </div>
  );
}
```

!!! note "`value` is HTML, `onChange` receives HTML"
    The editor is fully controlled by an HTML string. You keep that HTML wherever
    you want (state, a form, an API) and pass it back in via `value`. External
    changes to `value` are synced into the editor **without** re-triggering
    `onChange`, so there's no update loop.

### Read-only

To display content without allowing edits (an article preview, for example),
pass `editable={false}`. You usually hide the toolbar too:

```tsx
<RichTextEditor value={savedHtml} onChange={() => {}} editable={false} toolbar={false} />
```

!!! tip "Render saved HTML with the same theme"
    Using `RichTextEditor` in `editable={false}` mode is the simplest way to
    render saved HTML with the **same** typography and tokens as editing — the
    `.ProseMirror` applies the theme styling for both writing and reading.

!!! warning "`onChange` is still required"
    `onChange` is a required prop even in read-only mode. In `editable={false}`
    it's never called, so pass a no-op (`() => {}`) to satisfy the type.

### No toolbar (bring your own UI)

Pass `toolbar={false}` when you want your own formatting bar or a minimal editor
(a comment field, for example):

```tsx
<RichTextEditor value={comment} onChange={setComment} toolbar={false} placeholder="Comment…" />
```

## Recap

- `RichTextEditor` is a **controlled** WYSIWYG editor on top of tiptap, exposed
  on the `tempest-react-sdk/editor` subpath — outside the root barrel, so
  non-users pay nothing.
- `@tiptap/react` and `@tiptap/starter-kit` are **optional peer deps**: the
  caller injects the heavy dependency with `npm i @tiptap/react @tiptap/starter-kit`.
- `value` is an **HTML** string and `onChange(html)` returns the HTML on every
  edit; external changes to `value` sync in without re-triggering `onChange`.
- The built-in toolbar covers bold/italic/strike/code, H1/H2, lists, blockquote,
  and undo/redo — turn it off with `toolbar={false}`.
- `editable={false}` makes the editor read-only (great for previews); the
  `.ProseMirror` look follows the `--tempest-*` tokens via `styles.css`.

## See also

- [Styles & tokens](./styles.md) — customize the `--tempest-*` theme of the `.ProseMirror`.
- [Forms](./forms.md) — integrate the editor's HTML into a controlled form.
