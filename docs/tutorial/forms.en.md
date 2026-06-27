# Tutorial — Forms

Before the user enters the app, they need to sign up — and the sign-up must be
**validated**: well-formed e-mail, password with a minimum length, phone filled
in. On this page you build a sign-up form with `useZodForm` (schema validation),
`FormField` (glues validation to the components) and a BR masked phone field
(`PhoneInput`), then submit the data to the HTTP client.

The golden rule: the **zod schema is the source of truth**. The values' type is
inferred from it — you don't declare the type twice.

## Step 1 — The schema with zod

`zod` is a **direct** dependency of the SDK, already installed. Describe the form
shape with `z.object`:

```ts
// src/schemas/signup.ts
import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().min(2, "Enter your name"),
  email: z.string().email("Invalid e-mail"),
  phone: z.string().min(14, "Phone incomplete"),
  password: z.string().min(8, "Minimum of 8 characters"),
});

export type SignupValues = z.infer<typeof signupSchema>;
```

Each `.min(...)` / `.email(...)` carries the **error message** shown on the field.
`z.infer` derives the `SignupValues` type — the only type definition you need.

## Step 2 — `useZodForm`, the all-in-one

`useZodForm` wraps react-hook-form's `useForm` already wired to your schema, with
no extra resolver package. You pass the schema and the initial values:

```tsx
// src/pages/Signup.tsx (skeleton)
import { useZodForm } from "tempest-react-sdk";
import { signupSchema, type SignupValues } from "@/schemas/signup";

export function Signup() {
  const form = useZodForm(signupSchema, {
    defaultValues: { name: "", email: "", phone: "", password: "" },
  });

  // form.register, form.handleSubmit, form.formState, form.control ...
}
```

The returned `form` is the standard react-hook-form object — `register`,
`handleSubmit`, `control`, `formState.errors`, `formState.isSubmitting`.

## Step 3 — `FormField` + `FormProvider`

Wiring each field to validation by hand is tedious. `FormField` is the glue
between react-hook-form and the SDK's controlled components: it injects `value`,
`onChange`, `label`, `error` and the error state into the child component
automatically. For `FormField` to find the `control`, wrap everything in a
`FormProvider` (also re-exported by the SDK).

```tsx
// src/pages/Signup.tsx
import {
  useZodForm,
  FormProvider,
  Form,
  FormField,
  FormActions,
  Input,
  Button,
  PhoneInput,
} from "tempest-react-sdk";
import { signupSchema, type SignupValues } from "@/schemas/signup";

export function Signup() {
  const form = useZodForm(signupSchema, {
    defaultValues: { name: "", email: "", phone: "", password: "" },
  });

  function onSubmit(values: SignupValues) {
    console.log("valid!", values);
  }

  return (
    <FormProvider {...form}>
      <Form layout="stack" gap={4} onSubmit={form.handleSubmit(onSubmit)}>
        <FormField name="name" label="Name" required>
          <Input />
        </FormField>
        <FormField name="email" label="E-mail" required>
          <Input type="email" />
        </FormField>
        <FormField name="phone" label="Phone" required>
          <PhoneInput />
        </FormField>
        <FormField name="password" label="Password" required>
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

Piece by piece:

- `<FormProvider {...form}>` publishes the `form` to context — that's what
  `FormField` reads to find the `control`.
- `<Form layout="stack" gap={4}>` is just **layout** (flex column, 16px gap) — it
  doesn't couple to any form library.
- Each `<FormField name="..." label="...">` matches the `name` to a schema key and
  injects `value`/`onChange`/`error` into the child. zod errors appear
  automatically below the field.
- `form.handleSubmit(onSubmit)` only calls `onSubmit` when **everything**
  validates.

!!! warning "The `name` must match a schema key"

    `<FormField name="email">` requires an `email` key in `signupSchema`. Since
    `useZodForm` is typed by the schema, writing `name="emial"` becomes a compile
    error — you catch the slip before running. ✅

## Step 4 — The masked phone field

You wrote no masking logic — `PhoneInput` is one of the SDK's ready-made BR
fields. It formats what the user types (`11999998888` → `(11) 99999-8888`) and
passes the masked value to the form. Others available:

| Component    | Formats                   |
| ------------ | ------------------------- |
| `PhoneInput` | phone `(11) 99999-8888`   |
| `CPFInput`   | CPF `123.456.789-09`      |
| `CNPJInput`  | CNPJ `12.345.678/0001-90` |
| `CEPInput`   | ZIP code `01310-100`      |
| `MoneyInput` | currency `R$ 1.234,56`    |

They all work inside a `FormField` exactly like `PhoneInput` above — just swap the
child.

!!! info "The mask affects the validated value"

    `phone` reaches the schema **already masked** (`(11) 99999-8888`, 15
    characters). That's why the schema's `.min(14)` counts the mask characters. If
    your backend wants digits only, unmask in `onSubmit` before sending (the SDK
    exports `unmask` for that).

## Step 5 — Submitting to the backend

Now wire `onSubmit` to the HTTP client you created on the
[data fetching](data-fetching.md) page. Instead of `console.log`, do the `POST`
and, on success, navigate to the login screen:

```tsx
// src/pages/Signup.tsx (just the onSubmit)
import { useNavigate } from "tempest-react-sdk";
import { api } from "@/lib/api";
import type { SignupValues } from "@/schemas/signup";

// inside the component:
const navigate = useNavigate();

async function onSubmit(values: SignupValues) {
  await api.post("/auth/signup", { body: values });
  navigate("/login");
}
```

Notice that `form.formState.isSubmitting` (passed as `loading={...}` on the
button) is `true` while the `onSubmit` `Promise` is pending — the button shows the
loading state on its own, because react-hook-form tracks the `async` function.

!!! tip "Validation errors vs network errors"

    zod handles validation **before** the submit: invalid fields never reach
    `onSubmit`. A **network** error (the `POST` failing) is a `throw` from
    `api.post` — handle it with `try/catch` in `onSubmit` if you want to show a
    "sign-up failed" message.

## Recap

- The **zod schema is the source of truth**: error messages live in it and the
  type comes from `z.infer`. ✅
- **`useZodForm(schema, { defaultValues })`** wraps react-hook-form already wired
  to zod — no extra resolver package.
- **`<FormProvider {...form}>`** publishes the form to context; each
  **`<FormField name="..." label="...">`** glues validation and errors to the
  child component. The `name` is checked against the schema at compile time.
- **`<Form layout="stack">`** handles layout only — it doesn't couple to a form
  library.
- Masked BR fields (`PhoneInput`, `CPFInput`, `CNPJInput`, `CEPInput`,
  `MoneyInput`) drop in as `FormField` children with no masking code of yours.
- `form.handleSubmit(onSubmit)` only calls `onSubmit` when everything validates;
  inside it you call `api.post(...)` and navigate on success.

➡️ **Next page:** [Auth flow — tying store, guard and HTTP client together](auth-flow.md)
