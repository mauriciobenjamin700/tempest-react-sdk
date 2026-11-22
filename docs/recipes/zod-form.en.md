# Form with zod validation

Loja Aurora wants customers to create an account before their first purchase. The
form asks for name, e-mail, CPF, mobile number and password. The CPF must be **really
valid** (check digits, not just 11 numbers), the mobile number shows up already
masked, and when the backend refuses ("CPF já cadastrado", CPF already registered) the
message appears **under the right field**, not in a generic alert. 📝

You write the rules **once**, in a zod schema. The values' type, the error messages and
the on-submit validation come out of it. The pieces are
[`useZodForm`](../forms.md#3-usezodform-all-in-one),
[`<FormField>`](../forms.md#end-to-end-example-schema-provider-fields-submit) and the
[masked inputs](../forms-br.md#masked-inputs).

!!! info "Before you start"
    This recipe uses the `api` client from the
    [Full authentication flow](auth-flow.md) recipe. Install in
    [manual install](../index.md#manual-install). `zod` and `react-hook-form` already
    ship as SDK dependencies.

## What we are building

- ✍️ A **sign-up** with five fields, validated in the browser before any request.
- 🇧🇷 **Masked CPF and mobile number** while the person types, with the numeric
  keyboard on phones.
- ⏳ **A loading button** while submitting.
- ❌ **Server errors on the right field**, plus a toast with the summary.
- ✅ **Success** with a toast and a redirect to the login screen.

## The backend contract

The backend takes only digits for CPF and phone:

```text
POST /api/clientes
{ "name": "Ana Souza", "email": "ana@email.com", "cpf": "39053344705",
  "phone": "81987654321", "password": "••••••••" }

201 → { "id": "c_91", "name": "Ana Souza", "email": "ana@email.com" }
422 → { "detail": { "detail": "CPF já cadastrado", "field": "cpf" },
        "code": "VALIDATION_ERROR", "details": { "field": "cpf" } }
```

## The code, file by file

### 1. The toast provider

`useToast` needs a `<ToastProvider>` above it. Put it in once, inside
`<AppProviders>`:

```tsx
// src/App.tsx
import { AppProviders, AppRouter, Spinner, ToastProvider } from "tempest-react-sdk";
import { routes } from "@/routes";

export function App() {
  return (
    <AppProviders errorBoundary={{ fallback: <p>Algo deu errado. Recarregue a página.</p> }}>
      <ToastProvider position="top-center">
        <AppRouter routes={routes} fallback={<Spinner />} />
      </ToastProvider>
    </AppProviders>
  );
}
```

### 2. The sign-up screen

```tsx
// src/pages/Signup.tsx
import {
  Button,
  CPFInput,
  Form,
  FormActions,
  FormField,
  FormProvider,
  Input,
  PasswordInput,
  PhoneInput,
  describeApiError,
  isApiError,
  unmask,
  useNavigate,
  useToast,
  useZodForm,
  validateCPF,
} from "tempest-react-sdk";
import { z } from "zod";
import { api } from "@/lib/api";

const schema = z.object({
  name: z.string().trim().min(2, "Informe seu nome"),
  email: z.string().email("E-mail inválido"),
  cpf: z.string().refine(validateCPF, "CPF inválido"),
  phone: z.string().min(14, "Telefone inválido"),
  password: z.string().min(8, "Use pelo menos 8 caracteres"),
});

type SignupValues = z.infer<typeof schema>;

export function Signup() {
  const navigate = useNavigate();
  const toast = useToast();
  const form = useZodForm(schema, {
    mode: "onBlur",
    defaultValues: { name: "", email: "", cpf: "", phone: "", password: "" },
  });

  async function onSubmit(values: SignupValues): Promise<void> {
    try {
      await api.post("/clientes", {
        body: { ...values, cpf: unmask(values.cpf), phone: unmask(values.phone) },
      });
      toast.success("Conta criada! Agora é só entrar.");
      navigate("/login", { replace: true });
    } catch (err) {
      if (isApiError(err) && err.fields) {
        for (const [field, message] of Object.entries(err.fields)) {
          form.setError(field as keyof SignupValues, { message });
        }
      }
      toast.error(describeApiError(err, "Não foi possível criar sua conta agora."));
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 16 }}>
      <h1>Crie sua conta</h1>
      <FormProvider {...form}>
        <Form layout="stack" gap={4} onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FormField name="name" label="Nome completo" required>
            <Input autoComplete="name" />
          </FormField>
          <FormField name="email" label="E-mail" required>
            <Input type="email" autoComplete="email" />
          </FormField>
          <FormField name="cpf" label="CPF" required>
            <CPFInput placeholder="000.000.000-00" />
          </FormField>
          <FormField name="phone" label="Celular" helperText="Com DDD" required>
            <PhoneInput autoComplete="tel-national" placeholder="(00) 00000-0000" />
          </FormField>
          <FormField name="password" label="Senha" required>
            <PasswordInput autoComplete="new-password" showStrength />
          </FormField>
          <FormActions align="end">
            <Button type="submit" loading={form.formState.isSubmitting} fullWidth>
              Criar conta
            </Button>
          </FormActions>
        </Form>
      </FormProvider>
    </main>
  );
}
```

## Piece by piece

### One schema, three uses

The `schema` is the only source of the rules. Out of it come:

1. **The type**: `z.infer<typeof schema>` becomes `SignupValues`. You do not write the
   form's interface by hand.
2. **Browser validation**: `useZodForm(schema, options)` wraps react-hook-form's
   `useForm` with `zodResolver`. No submission goes out with an invalid CPF.
3. **The messages**: each rule's second argument (`"CPF inválido"`) is the text shown
   under the field.

`mode: "onBlur"` validates when the person leaves the field. They do not see "E-mail
inválido" on the first letter typed, and they do not discover the error only at the
end either.

### `<FormField>` binds the field to the form

`<FormField name="cpf">` reads the `control` from `<FormProvider>` and injects
`value`, `onChange`, `onBlur`, `error`, `label` and `required` into the child. It is
the end of `<Controller render={...} />` repeated on every field. The `name` is checked
against the schema's type: `name="cfp"` does not compile.

### The Brazilian masks

`CPFInput` and `PhoneInput` apply the mask as the person types and open the numeric
keyboard on phones (`inputMode="numeric"` and `"tel"`). The value in the form stays
**masked** (`390.533.447-05`), hence:

- `validateCPF` accepts the value with or without the mask and checks the check digits;
- `unmask` strips everything that is not a digit before submitting.

!!! tip "`phone` with `min(14)`"
    `(81) 3456-7890` has 14 characters and `(81) 98765-4321` has 15. `min(14)` accepts
    landline and mobile. To require a mobile number, swap the rule for
    `.refine((value) => unmask(value).length === 11, "Informe um celular")`. Mobile
    formatting outside the input is in
    [Forms BR](../forms-br.md#mobile-only-field-formatphone-mobile-true).

### The server error goes back to the field

The browser does not know the CPF is already registered. Only the backend does, and
`tempest-fastapi-sdk` says **which field** failed. `createApiClient` reads that and
hands it over in `err.fields`:

```ts
const fields: Record<string, string> = { cpf: "CPF já cadastrado" };
```

The loop calls `form.setError` for each pair, and the sentence shows up under the CPF
input, just like a zod error. See
[the guilty field](../integration-fastapi.md#the-guilty-field-which-the-backend-names-and-the-frontend-used-to-throw-away).

!!! note "Why the toast does not repeat the sentence"
    When `err.fields` is filled, `describeApiError` returns the validation sentence
    ("Confira os campos destacados e tente de novo."). The specific sentence is already
    on the field. Network failure or 500 become the second argument's text.

### The screen's states

- **Editing**: errors appear when leaving each field.
- **Submitting**: `form.formState.isSubmitting` turns on the button's `loading`, which
  blocks the double click.
- **Error**: highlighted fields + `toast.error`.
- **Success**: `toast.success` and `navigate("/login", { replace: true })`.

### And on a phone? 📱

`Form` with `layout="stack"` stacks one field per line at any width, and `fullWidth`
makes the button thumb-sized. The right `autoComplete` on each field lets the browser
fill name, e-mail and phone with one tap. `<ToastProvider position="top-center">` keeps
the toast from covering the keyboard.

??? tip "Want the address too?"
    CEP with a ViaCEP lookup, state and city belong to the
    [BR sign-up + checkout](br-signup-checkout.md) recipe. The validators and the
    `useViaCEP` hook are in [Forms BR](../forms-br.md#viacep).

## Recap

- ✅ One zod schema generates the type, the validation and the messages.
- ✅ `useZodForm` + `<FormProvider>` + `<FormField>` wire everything with no hand-written
  `Controller`.
- ✅ `CPFInput`, `PhoneInput`, `validateCPF` and `unmask` take care of Brazil.
- ✅ `err.fields` + `form.setError` put the backend error on the right field.
- ✅ `useToast` closes the flow with success or failure.
