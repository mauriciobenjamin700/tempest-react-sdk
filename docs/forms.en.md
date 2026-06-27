# Forms

Forms almost always stall on two problems that have nothing to do with each
other: **how the fields lay out on screen** and **how the values are validated**.
The SDK splits those two axes on purpose — you can adopt one without the other.

1. **Layout** — `Form` / `FormSection` / `FormRow` / `FormActions` handle how fields are arranged on screen.
2. **Validation** — `validateForm` / `zodResolver` / `useZodForm` handle validating values with zod.

Use them together or separately — the `Form` component is **not** coupled to any
form library.

!!! info "Why zod as the source of truth?"
    Instead of declaring the form's type and _then_ writing validation rules that
    can drift from it, you write a single zod schema and the TypeScript type is
    **inferred** with `z.infer`. Schema and type never go out of sync, and the same
    rule runs on the client (`validateForm`/`zodResolver`) and on the server.

## Layout — `Form` + subcomponents

Replaces the `<form><Stack>` boilerplate pattern when you want a layout-opinionated wrapper.

```tsx
import { Form, FormSection, FormRow, FormActions, Input, Button } from "tempest-react-sdk";
```

### `layout` variants

| `layout`   | Behavior                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------- |
| `"stack"`  | (default) — flex column, gap = `gap` (default 4 → 16px).                                  |
| `"inline"` | Flex row with `flex-wrap: wrap` + `align-items: flex-end`. Filter bars, short login, etc. |
| `"grid"`   | `display: grid` with `grid-template-columns: repeat(columns, minmax(0, 1fr))`.            |

`columns` accepts a `number` (`repeat(N, minmax(0, 1fr))`) or a `string`
(`"2fr 1fr"`, `"min-content auto"`).

`gap` accepts a `number` (4px scale: `2` → `8px`, `4` → `16px`) or a `string`
(any CSS length: `"1.5rem"`, `"20px"`).

### Stacked

```tsx
<Form layout="stack" gap={4} onSubmit={form.handleSubmit(onSubmit)}>
  <Input label="Name" {...form.register("name")} />
  <Input label="Email" type="email" {...form.register("email")} />
  <Input label="Password" type="password" {...form.register("password")} />
  <FormActions align="end">
    <Button type="submit">Create account</Button>
  </FormActions>
</Form>
```

### Grid

```tsx
<Form layout="grid" columns={2} gap={4} onSubmit={form.handleSubmit(onSubmit)}>
  <Input label="First name" {...register("name")} />
  <Input label="Last name" {...register("last_name")} />
  <Input label="Email" type="email" {...register("email")} />
  <Input label="Phone" {...register("phone")} />
  <FormActions align="end" style={{ gridColumn: "1 / -1" }}>
    <Button type="submit">Save</Button>
  </FormActions>
</Form>
```

!!! tip "Full-row span"
    Use `gridColumn: "1 / -1"` to make a field (or `FormActions`) span the whole
    grid row, regardless of how many columns there are.

### Inline

```tsx
<Form layout="inline" gap={2} onSubmit={onSubmit}>
  <Input label="Search" placeholder="name…" />
  <Select label="Status" options={statusOptions} />
  <Button type="submit">Filter</Button>
</Form>
```

Typical filter bars: `align-items: flex-end` keeps the buttons aligned with the
inputs' baseline.

### `FormSection` — subgroups with independent layout

```tsx
<Form layout="stack" gap={5}>
  <Input label="Email" {...register("email")} />

  <FormSection title="Address" description="Used for delivery" layout="grid" columns={3} gap={3}>
    <Input label="ZIP" {...register("cep")} />
    <Input label="City" {...register("city")} />
    <Input label="State" {...register("state")} />
    <Input label="Street" style={{ gridColumn: "1 / -1" }} {...register("street")} />
  </FormSection>

  <FormActions align="end">
    <Button type="submit">Save</Button>
  </FormActions>
</Form>
```

`FormSection` renders a `<section>` with a `<header>` (when `title` or
`description` is present) + body. The body has its own `layout` / `columns` /
`gap`.

### `FormRow` — side-by-side inside a stack

```tsx
<Form layout="stack" gap={4}>
  <Input label="Card number" />
  <FormRow gap={3}>
    <Input label="Expiry" placeholder="MM/YY" />
    <Input label="CVV" />
  </FormRow>
</Form>
```

`FormRow` is always horizontal with `flex-wrap: wrap`. Children share the width
equally (`flex: 1 1 0`).

### `FormActions` — footer buttons

```tsx
<FormActions align="between" gap={2}>
  <Button variant="ghost" type="button" onClick={onCancel}>
    Cancel
  </Button>
  <Button type="submit" loading={form.formState.isSubmitting}>
    Save
  </Button>
</FormActions>
```

`align`: `"start"` / `"center"` / `"end"` (default) / `"between"`.

## Validation — zod

Three levels of zod integration, from lightest to most opinionated. The schema is
the **source of truth** — the type is inferred.

### 1. `validateForm` — agnostic

Does not require `react-hook-form`. Useful for manual controlled forms or batch
validation.

```ts
import { validateForm } from "tempest-react-sdk";

const result = validateForm(schema, values);
if (!result.success) {
  setErrors(result.errors); // Record<path, message>
  return;
}
await save(result.data);
```

Path in dot-notation (`"address.city"`, `"items.0.name"`). Root errors: `_root`.

!!! note "First error per field wins"
    `validateForm` keeps only the **first** issue per path in the error map — form
    UIs almost always show one message per field. If you need _all_ the messages
    (e.g. a password-rules checklist), read
    `schema.safeParse(values).error.issues` directly.

### 2. `zodResolver` — react-hook-form

Replaces `@hookform/resolvers/zod` (no extra dependency).

```ts
import { useForm } from "react-hook-form";
import { zodResolver } from "tempest-react-sdk";

const form = useForm({ resolver: zodResolver(loginSchema) });
```

### 3. `useZodForm` — all-in-one

```tsx
const form = useZodForm(loginSchema, { defaultValues: { email: "", password: "" } });

<Form layout="stack" onSubmit={form.handleSubmit(login)}>
  <Input label="Email" {...form.register("email")} error={form.formState.errors.email?.message} />
  <Input
    label="Password"
    type="password"
    {...form.register("password")}
    error={form.formState.errors.password?.message}
  />
  <FormActions>
    <Button type="submit" loading={form.formState.isSubmitting}>
      Sign in
    </Button>
  </FormActions>
</Form>;
```

## End-to-end example — schema → provider → fields → submit

The three snippets above are slices of the same story. Here is an end-to-end
signup form: a single schema drives types, validation **and** `<FormField>` wires
the RHF state into every control without a repeated `<Controller>`.

```tsx
import {
  Form,
  FormField,
  FormProvider,
  FormActions,
  Button,
  Input,
  useZodForm,
  type SubmitHandler,
} from "tempest-react-sdk";
import { z } from "zod";

// 1. Schema = source of truth. The SignupValues type is inferred from it.
const signupSchema = z
  .object({
    name: z.string().min(2, "Enter your name"),
    email: z.string().email("Invalid email"),
    password: z.string().min(8, "At least 8 characters"),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Passwords do not match",
    path: ["confirm"], // error attached to the "confirm" field
  });

type SignupValues = z.infer<typeof signupSchema>;

export function SignupForm() {
  // 2. useZodForm wires the zod resolver + infers SignupValues automatically.
  const form = useZodForm(signupSchema, {
    defaultValues: { name: "", email: "", password: "", confirm: "" },
  });

  // 4. handleSubmit only fires the submit once the schema passes.
  const onSubmit: SubmitHandler<SignupValues> = async (values) => {
    await fetch("/api/signup", {
      method: "POST",
      body: JSON.stringify(values),
    });
  };

  return (
    // 3. FormProvider exposes `control` to the tree; FormField reads it from context.
    <FormProvider {...form}>
      <Form layout="stack" gap={4} onSubmit={form.handleSubmit(onSubmit)}>
        <FormField name="name" label="Name" required>
          <Input />
        </FormField>
        <FormField name="email" label="Email" required>
          <Input type="email" />
        </FormField>
        <FormField name="password" label="Password" required>
          <Input type="password" />
        </FormField>
        <FormField name="confirm" label="Confirm password" required>
          <Input type="password" />
        </FormField>
        <FormActions align="end">
          <Button type="submit" loading={form.formState.isSubmitting}>
            Create account
          </Button>
        </FormActions>
      </Form>
    </FormProvider>
  );
}
```

How the pieces fit together:

- **`useZodForm(schema)`** returns react-hook-form's `UseFormReturn` object, with
  the zod resolver already plugged in. You get `register`, `handleSubmit`,
  `formState`, `control`, etc., typed against `SignupValues`.
- **`<FormProvider {...form}>`** publishes that return value into RHF's context.
  This is what lets `<FormField>` find `control` on its own.
- **`<FormField name="..." label="...">`** wraps a `<Controller>` under the hood
  and uses `cloneElement` to inject `value` / `onChange` / `onBlur` / `ref` /
  `error` / `aria-invalid` into the child control. You pass a "dumb" `<Input />`
  and FormField wires everything up.
- **`form.handleSubmit(onSubmit)`** runs the schema first; `onSubmit` only ever
  receives already-validated, typed `values`.

!!! tip "FormField removes the repeated `<Controller>`"
    Without it, each controlled field becomes a 5-line
    `<Controller name=... render={({ field, fieldState }) => ...} />`. `<FormField>`
    does that render-prop once and forwards `error` + `aria-invalid` to the control
    automatically.

!!! warning "FormField needs a control or a Provider"
    `<FormField>` looks up `control` from the `<FormProvider>` context. If you
    don't want a provider, pass `control={form.control}` explicitly on each
    `<FormField>`. With neither, it throws
    `"FormField requires either a control prop or a <FormProvider> in the tree."`.

!!! note "The child control must accept the injected props"
    `<FormField>` expects the child to accept `value` / `onChange` / `onBlur` /
    `ref` / `error` / `label`. The SDK components (`Input`, `Select`, and the
    [BR masked inputs](./forms-br.md)) already do — a raw DOM `<input>` does **not**
    understand `error`/`label` and will warn about unknown props.

!!! tip "Cross-field errors"
    Validations that depend on two fields (password × confirmation) go in a
    `.refine()` on the schema with `path: ["field"]` — that way the error shows up
    attached to the right field in `formState.errors`.

## Schema pattern

Keep schemas in `src/schemas/<domain>.ts`, export the `z.infer` in
`src/types/<domain>.ts` via `declare global` when you want global types.
Convention inherited from alofans-frontend.

## Recap

- The SDK splits **layout** (`Form`/`FormSection`/`FormRow`/`FormActions`) from **validation** (zod) — adopt one without the other.
- Validation has three rungs: `validateForm` (agnostic), `zodResolver` (RHF), `useZodForm` (all-in-one).
- A single **zod schema** drives the type (`z.infer`), validation, and error messages.
- `<FormProvider>` + `<FormField>` remove the repeated `<Controller>` and propagate `error` + `aria-invalid` to the controls.
- `handleSubmit` only calls your `onSubmit` with already-validated values.

## See also

- [Forms BR](./forms-br.md) — `CPFInput` / `CNPJInput` / `CEPInput` / `MoneyInput` / `useViaCEP` / BR validation algorithms
- [HTTP](./http.md) — `parseResponse` uses the same zod
- [Components](./components.md) — `Input` / `Select` / `Textarea` that live inside the Form
- [Hooks](./hooks.md) — `useAsync` for submit state when you are not using RHF
