# Forms and accessibility

!!! tip "Skip this page if you already know…"

    - why `<label for>` has to match the field's `id`;
    - the difference between `name`, `id` and `value`;
    - what `required`, `type` and `aria-invalid` do with no JS at all;
    - why `aria-label` is the **last** resort, not the first.

## The problem

This field looks right:

```html
<div>Email</div>
<input type="text" />
```

The word "Email" is right there, you can read it on screen. But to the browser
those are two completely unrelated things:

- clicking the text does **not** focus the field;
- the screen reader announces "edit box, blank" — no name;
- in a form with six fields like this, they all announce identically.

The fix is not `aria-label`. It is the missing relationship:

```html
<label for="email">Email</label>
<input id="email" name="email" type="email" required />
```

## A complete form

A whole file, no JS. Open it in a browser and try submitting it empty — the browser
already validates:

```html
<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <title>Sign up</title>
    </head>
    <body>
        <main>
            <h1>Create account</h1>

            <form action="/signup" method="post">
                <p>
                    <label for="email">Email</label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        autocomplete="email"
                        aria-describedby="email-hint"
                    />
                    <small id="email-hint">We only use it for login.</small>
                </p>

                <p>
                    <label for="password">Password</label>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        required
                        minlength="8"
                        autocomplete="new-password"
                    />
                </p>

                <p>
                    <label for="plan">Plan</label>
                    <select id="plan" name="plan">
                        <option value="free">Free</option>
                        <option value="pro">Pro</option>
                    </select>
                </p>

                <button type="submit">Create account</button>
            </form>
        </main>
    </body>
</html>
```

### Piece by piece

| Attribute                | What it buys                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `for` + `id`             | The **relationship** between label and field. Clicking the label focuses the field; the screen reader announces "Email, edit box". |
| `name`                   | The **key** sent on submit. It names the data, not the element — `id` names the element.               |
| `type="email"`           | An `@` key on mobile keyboards, plus native format validation.                                          |
| `required`               | Blocks submit and shows the browser's message, with no JS.                                              |
| `minlength="8"`          | The same for a minimum length.                                                                          |
| `autocomplete`           | Lets the password manager fill **and save**. `new-password` offers to generate a strong one.            |
| `aria-describedby`       | Ties the hint to the field, so it is read **with** the label instead of floating loose.                 |

!!! warning "`id` is unique across the whole page"

    Two fields with `id="email"` make every `for` point at the first one, always.
    In React this happens constantly when the same form renders twice on screen —
    it is exactly what `useId()` solves, and what the SDK's `<Input>` uses under
    the hood.

## The accessible-name precedence order

Every control has an **accessible name**, and the browser resolves it in a fixed
order. Simplified, and in practice this is what matters:

1. `aria-labelledby` (points at another element's `id`)
2. `aria-label` (a hand-written string)
3. an associated `<label for>`
4. `placeholder`, `title` — and at this point you are scraping the barrel

`aria-label` **wins** over `<label>`. That is what makes it useful and also what
makes it dangerous: write both and let them diverge, and the screen-reader user
hears one name while the sighted user reads another. A voice-control user saying
"click Email" will not find a field whose `aria-label` says something else.

!!! danger "`placeholder` is not a label"

    It disappears when you type. A form labelled only by `placeholder` has no
    labels at all at the exact moment the user is reviewing what they filled in —
    and its contrast usually fails 4.5:1 anyway.

## Where it shows up in the SDK

`tempest-react-sdk`'s `<Input>` builds that whole relationship for you:

```tsx
import { Input } from "tempest-react-sdk";

export function EmailField() {
    return <Input label="Email" type="email" required helperText="We only use it for login." />;
}
```

Without you passing an `id`, it generates one with `useId()`, uses that value for
the `<label>`'s `htmlFor` and the `<input>`'s `id`, and wires the helper text
through `aria-describedby` (which switches to the error's id when there is an
error, alongside `aria-invalid`).

`<FormField>` is the layer above: it reads `react-hook-form` state and injects
`value`, `onChange`, `onBlur`, `error`, `required` and `aria-invalid` into the
child field. You declare validation once in the zod schema and the accessible
markup comes for free — see [Forms (zod)](../forms.md).

### The case where `aria-label` is the right answer

`<Slider>` takes `aria-label` on purpose:

```tsx
import { Slider } from "tempest-react-sdk";

export function VolumeControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    return <Slider aria-label="Call volume" value={value} onChange={onChange} min={0} max={100} />;
}
```

A slider in a one-line footer, a table cell or a toolbar has no room for the label
row above the track. Without `aria-label`, **every** one of them announces itself
as "Slider" and they become indistinguishable. That is the rule: `aria-label` is
for when the visible label **does not fit** — not for when you did not feel like
writing one.

## Recap

- `<label for>` + `id` is the relationship that makes the label exist for the
  browser. ✅
- `name` is the key of the submitted data; `id` is the element's identity on the
  page.
- `type`, `required`, `minlength` and `autocomplete` buy validation, keyboards and
  password managers **with no JS**.
- `aria-label` beats `<label>` — use it when the visible label does not fit, and
  never let it diverge from visible text.
- `placeholder` is not a label: it vanishes right when the user needs it most.
- In the SDK, `<Input>` generates the `id` with `useId()` and wires everything up;
  `<FormField>` brings validation state into the field.

📚 **Canonical reference:** [MDN — Forms](https://developer.mozilla.org/en-US/docs/Learn/Forms)

➡️ **Next page:** [CSS: selectors, cascade, specificity](css.md)
