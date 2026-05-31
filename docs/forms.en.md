# Forms

Two independent axes:

1. **Layout** — `Form` / `FormSection` / `FormRow` / `FormActions` handle how fields are arranged on screen.
2. **Validation** — `validateForm` / `zodResolver` / `useZodForm` handle validating values with zod.

Use them together or separately — the `Form` component is **not** coupled to any
form library.

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

Use `gridColumn: "1 / -1"` to make a field (or `FormActions`) span the whole row.

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

## Schema pattern

Keep schemas in `src/schemas/<domain>.ts`, export the `z.infer` in
`src/types/<domain>.ts` via `declare global` when you want global types.
Convention inherited from alofans-frontend.

## See also

- [Forms BR](./forms-br.md) — `CPFInput` / `CNPJInput` / `CEPInput` / `MoneyInput` / `useViaCEP` / BR validation algorithms
- [HTTP](./http.md) — `parseResponse` uses the same zod
- [Components](./components.md) — `Input` / `Select` / `Textarea` that live inside the Form
