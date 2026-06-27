# Data entry

Controls for collecting user data. They all forward refs to the native DOM
element (compatible with `react-hook-form`).

## What this category is

This page gathers the SDK's full set of **form controls** — from the plain
`Input` to specialized fields like `PinInput` (OTP), `PasswordInput` (with a
strength meter) and `RangeSlider` (dual-thumb range). They all share the same
label/error/size API (see Conventions below) and forward their `ref`, so they
plug straight into `react-hook-form` with no extra wrappers.

**When to use:** whenever you need to collect a value from the user. Pick the
control by data type — short text (`Input`), long text (`Textarea`), one option
out of a few (`Radio`/`Select`), one option out of many with search
(`Combobox`), a boolean (`Switch`/`Checkbox`), a verification code (`PinInput`),
a number with increment (`StepperInput`), etc.

!!! tip "Start with the Conventions"
    Every field accepts `label`, `helperText`, `error`, `required` and `size`
    the same way. Learn those 5 props once and you know how to use any field on
    this page.

## Conventions

- `label` (string or node) — label above the field.
- `helperText` — auxiliary text below; replaced by `error` when it is set.
- `error` (string) — error message; adds `aria-invalid="true"` + a red border.
- `required` — adds `*` to the label and propagates `required` to the input.
- `size: "sm" | "md" | "lg"` — height/padding/font scale via density tokens.

## `Input`

Single-line text.

```tsx
import { Input } from "tempest-react-sdk";
import { Search } from "lucide-react";

<Input label="Email" type="email" placeholder="user@example.com" required />;
<Input label="Search" leftIcon={<Search size={16} />} placeholder="keyword" />;
<Input label="Password" type="password" error="Minimum 8 characters" />;
```

| Prop               | Type                                            | Default |
| ------------------ | ----------------------------------------------- | ------- |
| `label`            | `string`                                        | —       |
| `helperText`       | `string`                                        | —       |
| `error`            | `string`                                        | —       |
| `leftIcon`         | `ReactNode`                                     | —       |
| `rightIcon`        | `ReactNode`                                     | —       |
| `size`             | `"sm" \| "md" \| "lg"`                          | `"md"`  |
| `wrapperClassName` | `string`                                        | —       |
| ...                | All `HTMLInputElement` attributes except `size` | —       |

## `Textarea`

Multi-line. Same API as `Input` (without `leftIcon`/`rightIcon`).

```tsx
<Textarea label="Message" rows={4} helperText="Maximum 500 characters" />
```

## `Select`

Native `<select>`. Accepts `options` (a list) or `<option>` children.

```tsx
<Select
  label="State"
  options={[
    { value: "SP", label: "São Paulo" },
    { value: "RJ", label: "Rio de Janeiro" },
  ]}
/>
```

| Prop      | Type             | Default |
| --------- | ---------------- | ------- |
| `options` | `SelectOption[]` | —       |
| `label`   | `string`         | —       |
| `error`   | `string`         | —       |

## `Combobox`

**When to use:** one option out of many (dozens+), where the user needs to type
to filter. For a few options use `Select`.

Select with search + filter. Keyboard nav (↑↓ Enter Esc).

```tsx
<Combobox
  label="City"
  options={cities}
  value={city}
  onChange={setCity}
  filter={(opt, query) => opt.label.toLowerCase().includes(query.toLowerCase())}
/>
```

## `Checkbox`

A single checkbox. Supports `indeterminate`.

```tsx
<Checkbox label="I accept the terms" />;
<Checkbox label="Select all" indeterminate={someSelected && !allSelected} />;
```

## `Radio` / `RadioGroup`

Standalone radio OR grouped with a single value.

```tsx
<RadioGroup label="Plan" value={plan} onChange={setPlan}>
  <Radio value="free" label="Free" />
  <Radio value="pro" label="Pro" />
  <Radio value="team" label="Team" />
</RadioGroup>
```

## `Switch`

**When to use:** turn a preference on/off with immediate effect (e.g.
notifications). For an opt-in that only takes effect on form submit (e.g.
accepting terms), prefer `Checkbox`.

On/off toggle.

```tsx
<Switch
  label="Receive emails"
  checked={subscribed}
  onChange={(e) => setSubscribed(e.target.checked)}
/>
```

!!! note "Switch vs Checkbox — not interchangeable"
    A `Switch` signals an action that happens **now**; a `Checkbox` signals a
    state that will be applied **later** (on submit). Swapping one for the other
    confuses the user about when the change takes effect.

## `ChipInput`

A list of chips with add-on-Enter + automatic dedup.

```tsx
<ChipInput label="Tags" value={tags} onChange={setTags} placeholder="add and press Enter" />
```

## `SearchBar`

A search input with a clear button + optional debounce via `useDebounce`.

```tsx
<SearchBar value={q} onChange={setQ} placeholder="What are you looking for?" />
```

## `DatePicker`

`<input type="date">` (or `time`, `datetime-local`, `month`) with label/error.

```tsx
<DatePicker label="Date" value={date} onChange={setDate} mode="date" min="2025-01-01" />;
<DatePicker label="Start" mode="datetime-local" value={start} onChange={setStart} />;
```

## `FileUpload`

Drag-and-drop + click-to-upload + file list.

```tsx
<FileUpload
  label="Attach"
  accept="image/*"
  multiple
  onFilesChange={(files) => setFiles(files)}
  maxSize={5 * 1024 * 1024}
/>
```

## `RangeSlider`

Dual-thumb slider with a `low ≤ high` clamp.

```tsx
<RangeSlider
  label="Price range"
  min={0}
  max={1000}
  step={10}
  value={range}
  onChange={setRange}
  format={(n) => `R$ ${n}`}
/>
```

## `RatingStars`

A radio group of stars.

```tsx
<RatingStars value={rating} onChange={setRating} max={5} size="md" />;
<RatingStars value={4.5} readonly size="lg" />;
```

## `PinInput`

**When to use:** short verification codes (OTP, 2FA, SMS/email confirmation).
For passwords use `PasswordInput`.

OTP / one-time-code with N cells. Paste, auto-advance, backspace flowback, arrow
nav.

!!! tip "Pasting the whole code works"
    The user can paste `123456` into any cell and `PinInput` distributes the
    digits automatically — set `type="numeric"` so the mobile keyboard opens in
    numeric mode.

```tsx
<PinInput length={6} type="numeric" onComplete={(otp) => verify(otp)} />;
<PinInput length={4} type="alphanumeric" masked autoFocus />;
```

| Prop           | Type                          | Default        |
| -------------- | ----------------------------- | -------------- |
| `length`       | `number`                      | `6`            |
| `type`         | `"numeric" \| "alphanumeric"` | `"numeric"`    |
| `value`        | `string`                      | — (controlled) |
| `defaultValue` | `string`                      | `""`           |
| `onChange`     | `(value: string) => void`     | —              |
| `onComplete`   | `(value: string) => void`     | —              |
| `masked`       | `boolean`                     | `false`        |
| `size`         | `"sm" \| "md" \| "lg"`        | `"md"`         |
| `autoFocus`    | `boolean`                     | `false`        |

## `PasswordInput`

A `password`-type field with a visibility toggle + an optional strength meter (5
levels).

```tsx
<PasswordInput label="Password" autoComplete="new-password" showStrength />
```

Exposed helper: `estimatePasswordStrength(value)` returns `0-4` (length, case
mix, digits, symbols).

!!! warning "Use the correct `autoComplete`"
    On signup screens use `autoComplete="new-password"`; on login use
    `autoComplete="current-password"`. The wrong value makes the browser's
    password manager suggest/save the password incorrectly.

| Prop             | Type                                      | Default                                                  |
| ---------------- | ----------------------------------------- | -------------------------------------------------------- |
| `showStrength`   | `boolean`                                 | `false`                                                  |
| `strength`       | `0 \| 1 \| 2 \| 3 \| 4` (manual override) | `estimatePasswordStrength(value)`                        |
| `strengthLabels` | `[string,string,string,string,string]`    | `["Muito fraca","Fraca","Razoável","Forte","Excelente"]` |
| `toggleLabels`   | `{ show, hide }`                          | `{ show: "Mostrar senha", hide: "Esconder senha" }`      |

## `StepperInput`

`+ / −` numeric with a clamp on `min/max`.

```tsx
<StepperInput value={qty} onChange={setQty} min={1} max={10} />;
<StepperInput value={price} onChange={setPrice} step={5} format={(n) => `R$ ${n}`} />;
```

## `Form` / `FormSection` / `FormRow` / `FormActions` / `FormField`

Layout wrappers for forms (`stack`/`inline`/`grid`) + RHF integration.

```tsx
<Form layout="grid" columns={2} gap={4}>
  <Input label="Name" />
  <Input label="Email" type="email" />
  <FormActions style={{ gridColumn: "1 / -1" }}>
    <Button type="submit">Save</Button>
  </FormActions>
</Form>
```

Full details in [../forms.md](../forms.md).

## A11y

- Always use `label` — screen readers announce the field.
- `error` adds `aria-invalid="true"` + describes it via `aria-describedby`.
- `required` propagates the native `required` attribute + a visual `*` indicator.
- `PinInput` cells expose individual `aria-label="Digit N"`.
- `PasswordInput.toggle` uses `aria-pressed` and a localized `aria-label`.

## Recap

- Pick the control by **data type** — don't force an `Input` where a `Select`,
  `Switch` or `PinInput` communicates intent better.
- Every field shares `label` / `helperText` / `error` / `required` / `size` and
  forwards its `ref` → they plug straight into `react-hook-form`.
- `error` replaces `helperText` and adds `aria-invalid` automatically — don't
  duplicate the message.

Related pages:

- [Form validation](../forms.md) — `validateForm`, `useZodForm`, BR masks,
  `useViaCEP` and the `<FormField>` wrapper.
- [Layout](./layout.md) — `Form`/`FormSection`/`FormRow`/`FormActions` to
  structure the fields.
- [Actions](./actions.md) — `Button` for the form submit.
- [Status & feedback](./feedback.md) — `Alert`/`Toast` to confirm submit success
  or error.
