# BR sign-up + checkout

**Feira Fresca** delivers organic produce baskets in São Paulo. Ana built this week's basket on her
phone and tapped "Finalizar compra". It is her first order: the shop needs her CPF for the
invoice, her address for the delivery and a confirmed payment before packing anything. The
restaurant around the corner buys from the same shop, but with a CNPJ.

This recipe builds that screen end to end: sign-up with a document that is really validated, an
address that fills itself from the CEP, a basket review with an optional tip and payment by Pix or
card, with the backend deciding when the money arrived. 🚀

!!! note "The UI copy stays in Portuguese"
    The app in this recipe is Brazilian, so the strings inside the code (labels, errors, button
    text) are pt-BR, exactly as a real Brazilian checkout ships them. The code blocks are the same
    as in the Portuguese page.

## What we are going to build

A three-step checkout, marked by a [`Stepper`](../components/navigation.md#stepper):

1. **Your details** — individual (CPF) or company (CNPJ), name, e-mail, mobile and address. The
   CEP fills street, district, city and state on its own.
2. **Review** — basket items, delivery fee, an optional tip for the courier and the total.
3. **Payment** — Pix with QR, copy-and-paste code and countdown, or credit card with
   installments. The screen confirms on its own when the backend says it was paid.

And the states a real screen has:

| Situation                   | What the person sees                                                |
| --------------------------- | ------------------------------------------------------------------- |
| Basket loading              | A skeleton where the summary goes                                   |
| Empty basket                | An empty state linking back to the shop                             |
| Network or backend error    | A sentence in Portuguese, with the reason when the backend named one |
| CPF/CNPJ with a wrong digit | An error on the field itself, before any request                    |
| Unknown CEP                 | An error on the CEP, and the address fields free to type            |
| Expired Pix                 | "Gerar novo Pix" (generate a new Pix) instead of the QR             |
| Card declined               | The bank's reason, rewritten for the payer, and an offer to use Pix |
| Paid                        | Order confirmed, with its reference number                          |
| Mobile                      | One column, full-width buttons, numeric keyboard on documents       |

## The contract with the backend

The backend is a FastAPI service built on `tempest-fastapi-sdk` (see the
[full-stack integration](../integration-fastapi.md)). Five routes, all under `/api`:

| Method | Route                   | Body                                  | Response                  |
| ------ | ----------------------- | ------------------------------------- | ------------------------- |
| `POST` | `/api/customers`        | sign-up (below)                       | `201` + `Customer`        |
| `GET`  | `/api/cart`             | —                                     | `Cart`                    |
| `POST` | `/api/orders`           | `{ customer_id, tip_cents }`          | `201` + `Order`           |
| `POST` | `/api/orders/{id}/pix`  | —                                     | `PixCharge` (from the SDK) |
| `GET`  | `/api/orders/{id}/pix`  | —                                     | `PixCharge` (from the SDK) |
| `POST` | `/api/orders/{id}/card` | `CardChargeRequest` (from the SDK)    | `CardCharge` (from the SDK) |

The sign-up travels as **digits only**, and money travels as **integer cents**:

```json
{
  "kind": "pf",
  "document": "52998224725",
  "name": "Ana Souza",
  "email": "ana.souza@exemplo.com.br",
  "phone": "11987654321",
  "address": {
    "cep": "01310100",
    "street": "Avenida Paulista",
    "number": "1578",
    "complement": "Apto 42",
    "district": "Bela Vista",
    "city": "São Paulo",
    "uf": "SP"
  }
}
```

And the basket arrives like this:

```json
{
  "items": [
    {
      "sku": "TOM-ORG-1KG",
      "name": "Tomate orgânico",
      "unit": "1 kg",
      "quantity": 2,
      "unit_price_cents": 1290,
      "total_cents": 2580
    },
    {
      "sku": "ALF-CRESPA",
      "name": "Alface crespa",
      "unit": "maço",
      "quantity": 1,
      "unit_price_cents": 450,
      "total_cents": 450
    }
  ],
  "subtotal_cents": 3030,
  "delivery_fee_cents": 990
}
```

`PixCharge`, `CardChargeRequest` and `CardCharge` are the SDK's own types, mirroring the backend's
Pydantic schemas. The field-by-field detail is in
[Payments](../payments.md#the-contract-that-comes-from-the-backend).

!!! info "Errors the backend names"
    When a business rule refuses, the backend answers with the `tempest-fastapi-sdk` envelope,
    which carries a `code`. This screen handles three: `DOCUMENT_TAKEN` (CPF/CNPJ already
    registered), `CART_CHANGED` (an item changed price or ran out) and `ORDER_ALREADY_PAID` (the
    Pix landed while the person was trying the card). Anything else goes through the
    [`describeApiError`](../http.md#from-a-typed-error-to-the-sentence-on-screen-describeapierror)
    funnel.

## The files

Eight files, all under `src/checkout/` (plus the HTTP client in `src/lib/`). One at a time.

### 1. The domain types

The types the SDK does not have — customer, basket and order. The payment ones come from the SDK.

```ts
// src/checkout/types.ts
export type CustomerKind = "pf" | "pj";

export interface Customer {
  id: string;
  kind: CustomerKind;
  name: string;
  document: string;
  email: string;
}

export interface CartItem {
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
}

export interface Cart {
  items: CartItem[];
  subtotal_cents: number;
  delivery_fee_cents: number;
}

export interface Order {
  id: string;
  reference: string;
  total_cents: number;
}
```

### 2. The HTTP client

One [`createApiClient`](../http.md#createapiclient) for the whole app. It already delivers typed
errors, serializes JSON and accepts a `signal` to cancel.

```ts
// src/lib/api.ts
import { createApiClient } from "tempest-react-sdk";

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
});
```

### 3. The sign-up schema

A zod schema is the form's source of truth: types, validation and messages.

```ts
// src/checkout/signup-schema.ts
import { unmask, validateCNPJ, validateCPF } from "tempest-react-sdk";
import { z } from "zod";

export const signupSchema = z.object({
  kind: z.enum(["pf", "pj"]),
  document: z
    .string()
    .refine((value) => validateCPF(value) || validateCNPJ(value), "Confira os dígitos do documento"),
  name: z.string().trim().min(3, "Informe o nome completo"),
  email: z.email("Informe um e-mail válido"),
  phone: z.string().refine((value) => unmask(value).length === 11, "Informe o celular com DDD"),
  address: z.object({
    cep: z.string().refine((value) => unmask(value).length === 8, "O CEP tem 8 dígitos"),
    street: z.string().trim().min(1, "Informe a rua"),
    number: z.string().trim().min(1, "Informe o número"),
    complement: z.string().trim(),
    district: z.string().trim().min(1, "Informe o bairro"),
    city: z.string().trim().min(1, "Informe a cidade"),
    uf: z.string().trim().length(2, "Use a sigla do estado, como SP"),
  }),
});

export type SignupValues = z.infer<typeof signupSchema>;

export const EMPTY_SIGNUP: SignupValues = {
  kind: "pf",
  document: "",
  name: "",
  email: "",
  phone: "",
  address: {
    cep: "",
    street: "",
    number: "",
    complement: "",
    district: "",
    city: "",
    uf: "",
  },
};
```

The document accepts **a CPF or a CNPJ** through [`validateCPF` / `validateCNPJ`](../forms-br.md#validators),
which run the full check-digit algorithm. Which of the two the person types is decided by the
masked input: `CPFInput` stops at 11 digits and `CNPJInput` at 14, so the two cases never mix.

!!! tip "Why not a `.superRefine` reading `kind`?"
    In zod 4, a refinement on the **object** only runs once every field passed. With a
    `.superRefine` reading `kind`, Ana would only see "CPF inválido" after filling the whole
    address. Validating on the field itself shows the error as soon as she leaves it. ✅

### 4. The "Your details" step

The sign-up form. It is the largest file of the recipe: document, contact and the address that
fills itself from the CEP.

```tsx
// src/checkout/SignupStep.tsx
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  CEPInput,
  CNPJInput,
  CPFInput,
  Form,
  FormActions,
  FormField,
  FormProvider,
  FormSection,
  Grid,
  Input,
  PhoneInput,
  SegmentedControl,
  describeApiError,
  isApiError,
  unmask,
  useBreakpoint,
  useViaCEP,
  useWatch,
  useZodForm,
  type Path,
  type SubmitHandler,
} from "tempest-react-sdk";
import { EMPTY_SIGNUP, signupSchema, type SignupValues } from "@/checkout/signup-schema";
import type { Customer, CustomerKind } from "@/checkout/types";
import { api } from "@/lib/api";

const KIND_OPTIONS: { value: CustomerKind; label: string }[] = [
  { value: "pf", label: "Pessoa física" },
  { value: "pj", label: "Empresa (CNPJ)" },
];

const SIGNUP_ERRORS: Record<string, string> = {
  DOCUMENT_TAKEN: "Já existe uma conta com este documento. Entre com seu e-mail para continuar.",
};

export interface SignupStepProps {
  onCreated: (customer: Customer) => void;
}

export function SignupStep({ onCreated }: SignupStepProps) {
  const form = useZodForm(signupSchema, { defaultValues: EMPTY_SIGNUP, mode: "onTouched" });
  const { control, setValue, setError, clearErrors, setFocus } = form;
  const kind = useWatch({ control, name: "kind" });
  const cep = useWatch({ control, name: "address.cep" });
  const { lookup, loading: searchingCep } = useViaCEP();
  const { isMobile } = useBreakpoint();
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const digits = unmask(cep);
    if (digits.length !== 8) return undefined;
    let current = true;
    void lookup(digits).then((address) => {
      if (!current) return;
      if (address === null) {
        setError("address.cep", {
          message: "Não achamos esse CEP. Confira ou preencha o endereço à mão.",
        });
        return;
      }
      clearErrors("address.cep");
      setValue("address.street", address.logradouro, { shouldValidate: true });
      setValue("address.district", address.bairro, { shouldValidate: true });
      setValue("address.city", address.localidade, { shouldValidate: true });
      setValue("address.uf", address.uf, { shouldValidate: true });
      setFocus(address.logradouro === "" ? "address.street" : "address.number");
    });
    return () => {
      current = false;
    };
  }, [cep, lookup, setValue, setError, clearErrors, setFocus]);

  function changeKind(next: CustomerKind): void {
    setValue("kind", next);
    setValue("document", "");
    clearErrors("document");
  }

  const onSubmit: SubmitHandler<SignupValues> = async (values) => {
    setSubmitError(null);
    try {
      const customer = await api.post<Customer>("/customers", {
        body: {
          ...values,
          document: unmask(values.document),
          phone: unmask(values.phone),
          address: { ...values.address, cep: unmask(values.address.cep) },
        },
      });
      onCreated(customer);
    } catch (error) {
      if (isApiError(error) && error.fields) {
        for (const [field, message] of Object.entries(error.fields)) {
          setError(field as Path<SignupValues>, { message });
        }
      }
      setSubmitError(
        describeApiError(error, "Não foi possível criar sua conta", { codes: SIGNUP_ERRORS }),
      );
    }
  };

  return (
    <FormProvider {...form}>
      <Form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        {submitError !== null && (
          <Alert variant="danger" title="Cadastro não concluído" description={submitError} />
        )}

        <FormSection
          title="Quem está comprando"
          description="Usamos esses dados na nota fiscal e para avisar sobre a entrega."
        >
          <SegmentedControl
            aria-label="Tipo de cliente"
            options={KIND_OPTIONS}
            value={kind}
            onChange={changeKind}
            fullWidth={isMobile}
          />
          <FormField key={kind} name="document" label={kind === "pf" ? "CPF" : "CNPJ"} required>
            {kind === "pf" ? <CPFInput autoComplete="off" /> : <CNPJInput autoComplete="off" />}
          </FormField>
          <FormField name="name" label={kind === "pf" ? "Nome completo" : "Razão social"} required>
            <Input autoComplete={kind === "pf" ? "name" : "organization"} />
          </FormField>
          <Grid columns={{ mobile: 1, desktop: 2 }} gap={4}>
            <FormField name="email" label="E-mail" required>
              <Input type="email" autoComplete="email" />
            </FormField>
            <FormField name="phone" label="Celular (WhatsApp)" required>
              <PhoneInput autoComplete="tel-national" />
            </FormField>
          </Grid>
        </FormSection>

        <FormSection
          title="Endereço de entrega"
          description="Digite o CEP e a gente completa o resto."
        >
          <Grid columns={{ mobile: 1, desktop: 3 }} gap={4}>
            <FormField
              name="address.cep"
              label="CEP"
              helperText={searchingCep ? "Buscando endereço…" : undefined}
              required
            >
              <CEPInput autoComplete="postal-code" />
            </FormField>
          </Grid>
          <Grid columns={{ mobile: "1fr", desktop: "3fr 1fr" }} gap={4}>
            <FormField name="address.street" label="Rua" required>
              <Input autoComplete="address-line1" />
            </FormField>
            <FormField name="address.number" label="Número" required>
              <Input inputMode="numeric" />
            </FormField>
          </Grid>
          <Grid columns={{ mobile: 1, desktop: 2 }} gap={4}>
            <FormField name="address.complement" label="Complemento">
              <Input autoComplete="address-line2" placeholder="Apto, bloco, referência" />
            </FormField>
            <FormField name="address.district" label="Bairro" required>
              <Input />
            </FormField>
          </Grid>
          <Grid columns={{ mobile: "1fr", desktop: "3fr 1fr" }} gap={4}>
            <FormField name="address.city" label="Cidade" required>
              <Input autoComplete="address-level2" />
            </FormField>
            <FormField name="address.uf" label="UF" required>
              <Input autoComplete="address-level1" maxLength={2} />
            </FormField>
          </Grid>
        </FormSection>

        <FormActions>
          <Button type="submit" loading={form.formState.isSubmitting} fullWidth={isMobile}>
            Continuar para a revisão
          </Button>
        </FormActions>
      </Form>
    </FormProvider>
  );
}
```

Piece by piece:

1. **`useZodForm(signupSchema)`** wires the schema into react-hook-form, and **`<FormProvider>`**
   lets each [`<FormField>`](../forms.md#end-to-end-example-schema-provider-fields-submit) find
   the form on its own. `FormField` injects `value`, `onChange`, `error` and `ref` into the child
   input.
2. **`<SegmentedControl>`** switches between individual and company. On a switch the document is
   cleared: half a CPF does not become a CNPJ. The `key={kind}` remounts the field with the right
   mask.
3. **`<CPFInput>` / `<CNPJInput>` / `<PhoneInput>` / `<CEPInput>`** are the
   [masked inputs](../forms-br.md#masked-inputs). They format while the person types and open
   the numeric keyboard on mobile (`inputMode`).
4. **The CEP fills the address.** `useWatch` observes the field; once it reaches 8 digits,
   [`useViaCEP`](../forms-br.md#viacep) queries ViaCEP. Found: it fills the fields and moves the
   focus to the **number**, the only field the CEP does not know. Not found: an error on the CEP,
   and the fields stay free to type.
5. **`unmask` before sending.** The screen shows `529.982.247-25`; the backend gets
   `52998224725`.
6. **Backend errors land in two places.** The ones naming a field (`error.fields`) go to the
   right input through `setError`. The overall sentence goes to the `<Alert>` at the top, built
   by `describeApiError` with the `DOCUMENT_TAKEN` code translated.

!!! tip "A small town's CEP has no street"
    In towns with a single CEP, ViaCEP returns an empty `logradouro` and `bairro`. That is why the
    focus goes to the **street** when it came back empty, and why every address field stays
    editable. Never lock the address to what the CEP returned.

!!! note "The `current` flag in the effect"
    Ana types `01310-100`, deletes a digit and types another CEP. The first lookup may answer
    after the second. The `current = false` in the effect's cleanup drops the stale answer, so one
    CEP's address never shows up under another.

!!! warning "`autoComplete=\"off\"` on the document"
    The browser offers CPFs typed on other sites. In a checkout where the same person may buy as
    an individual and as a company, the wrong suggestion is the most common mistake. E-mail,
    mobile and address do use the standard `autocomplete` tokens: that is what makes the mobile
    autofill work.

### 5. The order summary

A pure component: it takes the basket and the tip, shows the lines and the total.

```tsx
// src/checkout/OrderSummary.tsx
import { Card, Divider, Stack, formatCents } from "tempest-react-sdk";
import type { Cart } from "@/checkout/types";

interface SummaryLineProps {
  label: string;
  cents: number;
  strong?: boolean;
}

function SummaryLine({ label, cents, strong = false }: SummaryLineProps) {
  const text = formatCents(cents);
  return (
    <Stack direction="horizontal" justify="between">
      <span>{strong ? <strong>{label}</strong> : label}</span>
      <span>{strong ? <strong>{text}</strong> : text}</span>
    </Stack>
  );
}

export interface OrderSummaryProps {
  cart: Cart;
  tipCents: number | null;
}

export function OrderSummary({ cart, tipCents }: OrderSummaryProps) {
  const totalCents = cart.subtotal_cents + cart.delivery_fee_cents + (tipCents ?? 0);
  return (
    <Card title="Resumo do pedido">
      <Stack gap={3}>
        {cart.items.map((item) => (
          <SummaryLine
            key={item.sku}
            label={`${item.quantity}× ${item.name} (${item.unit})`}
            cents={item.total_cents}
          />
        ))}
        <Divider />
        <SummaryLine label="Subtotal" cents={cart.subtotal_cents} />
        <SummaryLine label="Entrega" cents={cart.delivery_fee_cents} />
        {tipCents !== null && <SummaryLine label="Gorjeta do entregador" cents={tipCents} />}
        <Divider />
        <SummaryLine label="Total" cents={totalCents} strong />
      </Stack>
    </Card>
  );
}
```

[`formatCents`](../utilities.md#format-cents) formats straight from cents (`3030` → `R$ 30,30`),
never through a float. The tip only shows up when it was given: `null` means "not given", and
does not turn into an `R$ 0,00` line.

### 6. The "Review" step

It loads the basket, offers the tip and creates the order.

```tsx
// src/checkout/ReviewStep.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  EmptyState,
  Grid,
  MoneyInput,
  Skeleton,
  Stack,
  describeApiError,
  generateIdempotencyKey,
  useBreakpoint,
} from "tempest-react-sdk";
import { OrderSummary } from "@/checkout/OrderSummary";
import type { Cart, Customer, Order } from "@/checkout/types";
import { api } from "@/lib/api";

const ORDER_ERRORS: Record<string, string> = {
  CART_CHANGED: "Algum item mudou de preço ou acabou. Revise a cesta antes de pagar.",
};

export interface ReviewStepProps {
  customer: Customer;
  onOrderCreated: (order: Order) => void;
}

export function ReviewStep({ customer, onOrderCreated }: ReviewStepProps) {
  const cart = useQuery({
    queryKey: ["cart"],
    queryFn: ({ signal }) => api.get<Cart>("/cart", { signal }),
  });
  const [tipCents, setTipCents] = useState<number | null>(null);
  const [idempotencyKey] = useState<string>(() => generateIdempotencyKey());
  const [creating, setCreating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { isMobile } = useBreakpoint();

  async function createOrder(): Promise<void> {
    setCreating(true);
    setError(null);
    try {
      const order = await api.post<Order>("/orders", {
        body: { customer_id: customer.id, tip_cents: tipCents },
        headers: { "Idempotency-Key": idempotencyKey },
      });
      onOrderCreated(order);
    } catch (reason) {
      setError(describeApiError(reason, "Não foi possível fechar o pedido", { codes: ORDER_ERRORS }));
    } finally {
      setCreating(false);
    }
  }

  if (cart.isPending) {
    return (
      <Stack gap={3}>
        <Skeleton variant="text" width="40%" />
        <Skeleton height={180} />
        <Skeleton height={44} />
      </Stack>
    );
  }

  if (cart.isError) {
    return (
      <Stack gap={3}>
        <Alert
          variant="danger"
          title="Não carregamos sua cesta"
          description={describeApiError(cart.error, "Tente de novo em instantes")}
        />
        <Button variant="outline" onClick={() => void cart.refetch()}>
          Tentar de novo
        </Button>
      </Stack>
    );
  }

  if (cart.data.items.length === 0) {
    return (
      <EmptyState
        title="Sua cesta está vazia"
        description="Escolha os produtos da semana e volte aqui para pagar."
        action={<Button href="/feira">Ver produtos da feira</Button>}
      />
    );
  }

  return (
    <Grid columns={{ mobile: "1fr", desktop: "3fr 2fr" }} gap={6}>
      <OrderSummary cart={cart.data} tipCents={tipCents} />
      <Stack gap={4}>
        <MoneyInput
          nullable
          value={tipCents}
          onChange={setTipCents}
          maxCents={5_000}
          label="Gorjeta para o entregador (opcional)"
          placeholder="R$ 0,00"
          helperText="O valor vai inteiro para quem entrega. Máximo de R$ 50,00."
        />
        {error !== null && <Alert variant="danger" title="Pedido não criado" description={error} />}
        <Button onClick={() => void createOrder()} loading={creating} fullWidth={isMobile}>
          Ir para o pagamento
        </Button>
      </Stack>
    </Grid>
  );
}
```

The four states come in order: **loading** ([`Skeleton`](../components/feedback.md#skeleton)),
**error** ([`Alert`](../components/feedback.md#alert) with "Tentar de novo"), **empty**
([`EmptyState`](../components/feedback.md#emptystate)) and **success**. The
[`Grid`](../components/layout.md#grid) puts the summary and the tip side by side on desktop and
stacks them on mobile.

The tip is a [`MoneyInput`](../forms-br.md#money-nullable) with `nullable`:

- It works in **integer cents**, like banking apps: typing `500` shows `R$ 5,00`.
- With `nullable`, the empty field reports `null`. "I don't want to tip" stays different from
  "I tipped R$ 0,00", and the summary shows no empty line.
- `maxCents={5_000}` ignores the digit that would go past R$ 50,00, instead of accepting an amount
  nobody meant to type.

!!! check "The order is created once"
    On a shaky 4G connection, the tap on "Ir para o pagamento" may reach the backend and the
    response may get lost. The person taps again. [`generateIdempotencyKey`](../http.md#generateidempotencykey)
    creates **one** key per visit to the screen, and the backend returns the same order for the
    same key. Two taps, one order.

!!! note "The total that counts is the backend's"
    `OrderSummary` adds up on the client so Ana sees the total while choosing the tip. But the
    amount charged is the `order.total_cents` that `POST /api/orders` returned, computed with the
    database's prices. That is the one the payment steps use.

#### Tip field variants

The controlled `MoneyInput` above is the common case. Two others show up in real apps:

=== "Uncontrolled form (`name`)"

    When the form is read through `FormData`, the visible text (`R$ 5,00`) is useless to the
    backend. With [`name`](../forms-br.md#money-name), `MoneyInput` renders an
    `<input type="hidden">` holding the raw amount.

    ```tsx
    // src/checkout/TipForm.tsx
    import { useState, type FormEvent } from "react";
    import { Button, MoneyInput } from "tempest-react-sdk";

    export interface TipFormProps {
      onTip: (tipCents: string) => void;
    }

    export function TipForm({ onTip }: TipFormProps) {
      const [tipCents, setTipCents] = useState<number | null>(null);

      function submit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onTip(String(data.get("tip_cents") ?? ""));
      }

      return (
        <form onSubmit={submit}>
          <MoneyInput
            nullable
            value={tipCents}
            onChange={setTipCents}
            name="tip_cents"
            maxCents={5_000}
            label="Gorjeta para o entregador"
          />
          <Button type="submit">Salvar gorjeta</Button>
        </form>
      );
    }
    ```

    `FormData` carries `"500"` for R$ 5,00, or `""` when left empty. With
    `nameFormat="decimal"`, it carries `"5.00"`.

=== "Field with its own look (`useMoneyMask`)"

    When the design puts suggested-amount buttons next to the field, the frame of the SDK's
    `<Input>` gets in the way. [`useMoneyMask`](../forms-br.md#use-money-mask) is the same mask, to
    spread on your own `<input>`.

    ```tsx
    // src/checkout/TipChips.tsx
    import { useState } from "react";
    import { Button, Stack, useMoneyMask } from "tempest-react-sdk";

    const SUGGESTIONS: number[] = [300, 500, 1_000];

    export function TipChips() {
      const [tipCents, setTipCents] = useState<number | null>(null);
      const mask = useMoneyMask({ value: tipCents, onChange: setTipCents, maxCents: 5_000 });

      return (
        <Stack gap={2}>
          <Stack direction="horizontal" gap={2} wrap>
            {SUGGESTIONS.map((cents) => (
              <Button
                key={cents}
                size="sm"
                variant={tipCents === cents ? "primary" : "outline"}
                onClick={() => setTipCents(cents)}
              >
                {`R$ ${cents / 100}`}
              </Button>
            ))}
          </Stack>
          <input {...mask} aria-label="Outro valor de gorjeta" placeholder="Outro valor" />
        </Stack>
      );
    }
    ```

### 7. Pix

Pix is what most people pick. The backend creates the charge at Mercado Pago and the app shows the
screen until the backend says it is over.

```tsx
// src/checkout/PixPayment.tsx
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  PixCheckout,
  Stack,
  describeApiError,
  encodeIdSegment,
  usePixCharge,
  useBreakpoint,
  type PixCharge,
} from "tempest-react-sdk";
import type { Order } from "@/checkout/types";
import { api } from "@/lib/api";

interface PixChargeScreenProps {
  orderId: string;
  created: PixCharge;
  regenerating: boolean;
  onRegenerate: () => void;
  onPaid: () => void;
}

function PixChargeScreen({
  orderId,
  created,
  regenerating,
  onRegenerate,
  onPaid,
}: PixChargeScreenProps) {
  const { isMobile } = useBreakpoint();
  const { charge, error } = usePixCharge(created, {
    refresh: (signal) => api.get<PixCharge>(`/orders/${encodeIdSegment(orderId)}/pix`, { signal }),
    intervalMs: 4_000,
  });

  useEffect(() => {
    if (charge.status === "paid") onPaid();
  }, [charge.status, onPaid]);

  const canRegenerate =
    charge.status === "expired" || charge.status === "cancelled" || charge.status === "failed";

  return (
    <Stack gap={3}>
      <PixCheckout
        charge={charge}
        qrSize={isMobile ? 180 : 240}
        footer={
          canRegenerate ? (
            <Button onClick={onRegenerate} loading={regenerating}>
              Gerar novo Pix
            </Button>
          ) : undefined
        }
      />
      {error !== null && (
        <Alert
          variant="warning"
          title="Conexão instável"
          description="Seu pagamento não se perde. Assim que a conexão voltar, esta tela se atualiza."
        />
      )}
    </Stack>
  );
}

export interface PixPaymentProps {
  order: Order;
  onPaid: () => void;
}

export function PixPayment({ order, onPaid }: PixPaymentProps) {
  const [charge, setCharge] = useState<PixCharge | null>(null);
  const [creating, setCreating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(): Promise<void> {
    setCreating(true);
    setError(null);
    try {
      setCharge(await api.post<PixCharge>(`/orders/${encodeIdSegment(order.id)}/pix`));
    } catch (reason) {
      setError(describeApiError(reason, "Não foi possível gerar o Pix"));
    } finally {
      setCreating(false);
    }
  }

  if (charge === null) {
    return (
      <Stack gap={3}>
        <p>
          O código vale por 30 minutos. Pague no app do seu banco: esta tela confirma sozinha.
        </p>
        {error !== null && <Alert variant="danger" title="Pix não gerado" description={error} />}
        <Button onClick={() => void generate()} loading={creating}>
          Gerar código Pix
        </Button>
      </Stack>
    );
  }

  return (
    <PixChargeScreen
      orderId={order.id}
      created={charge}
      regenerating={creating}
      onRegenerate={() => void generate()}
      onPaid={onPaid}
    />
  );
}
```

Piece by piece:

1. **The charge is born from a tap.** "Gerar código Pix" calls `POST /api/orders/{id}/pix`.
   Creating it in a mount `useEffect` would create two charges under React's `StrictMode`.
2. **[`usePixCharge`](../payments.md#step-1-the-pix-screen)** re-reads the charge every 4 seconds
   through **your** endpoint and stops on its own once the status is final (`paid`, `expired`,
   …). Reads are sequential: a slow backend never gets overlapping requests.
3. **`<PixCheckout>`** shows the amount, the QR, the copy-and-paste code with a copy button and
   the countdown to `expires_at`. It only **shows**: the backend decides it was paid.
4. **Expired?** The `footer` replaces the QR with "Gerar novo Pix". The new charge has another
   `provider_charge_id`, and `usePixCharge` starts following it.
5. **Paid?** The effect calls `onPaid`, and `CheckoutPage` shows the confirmation.
6. **Network dropped?** The hook's `error` becomes a yellow warning, and the polling goes on. A
   lost request is not a payment state.

!!! tip "On mobile, the QR is plan B 📱"
    Ana is paying **on the same phone** where she will open her banking app: she cannot scan her
    own screen. Her path is the **copy-and-paste code**, which `PixCheckout` shows with a copy
    button. That is why `qrSize` shrinks on mobile: the QR is still there for whoever opened the
    shop on a computer, without pushing the copy button down the screen.

!!! warning "When the clock hits zero, the screen says \"confirming\", not \"expired\""
    A Pix sent in the last second may still land. With the deadline gone and the status still
    `pending`, `PixCheckout` hides the QR and says it is confirming with the bank. Only when the
    backend answers `expired` does the button to generate another one show up.

??? info "Backend: return the open charge"
    Ana generates the Pix, switches to "Cartão", gives up and goes back to "Pix". `PixPayment`
    remounted and offers "Gerar código Pix" again. If `POST /api/orders/{id}/pix` always creates
    a new charge, the order ends up with two valid QR codes. Have the backend return the `pending`
    charge that is still within its deadline, and create another only when the previous one is
    over.

### 8. Credit card

The card number is typed **inside** Mercado Pago's iframes (the Secure Fields). The app only
receives a token.

The iframes fill the box they are mounted in, so the box needs a height and a border. A short CSS:

```css
/* src/checkout/card-payment.css */
.secure-field {
  height: 44px;
  padding: 0 12px;
  border: 1px solid var(--tempest-border);
  border-radius: var(--tempest-radius-md);
  background: var(--tempest-surface);
}

.secure-field-label {
  display: block;
  margin-bottom: 4px;
  font-size: var(--tempest-text-sm);
  font-weight: 500;
}
```

And the component:

```tsx
// src/checkout/CardPayment.tsx
import { useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Form,
  FormActions,
  Grid,
  Input,
  Select,
  Spinner,
  describeApiError,
  describeCardCharge,
  encodeIdSegment,
  formatCents,
  generateIdempotencyKey,
  useBreakpoint,
  useMercadoPagoCard,
  type CardCharge,
  type CardChargeRequest,
  type PaymentOutcome,
} from "tempest-react-sdk";
import type { Customer, Order } from "@/checkout/types";
import { api } from "@/lib/api";
import "./card-payment.css";

const CARD_ERRORS: Record<string, string> = {
  ORDER_ALREADY_PAID: "Este pedido já foi pago. Atualize a página para ver a confirmação.",
};

interface SecureFieldProps {
  id: string;
  label: string;
}

function SecureField({ id, label }: SecureFieldProps) {
  return (
    <div>
      <span className="secure-field-label">{label}</span>
      <div id={id} className="secure-field" />
    </div>
  );
}

export interface CardPaymentProps {
  order: Order;
  customer: Customer;
  onPaid: (outcome: PaymentOutcome) => void;
  onUsePix: () => void;
}

export function CardPayment({ order, customer, onPaid, onUsePix }: CardPaymentProps) {
  const card = useMercadoPagoCard({
    publicKey: import.meta.env.VITE_MP_PUBLIC_KEY,
    amountCents: order.total_cents,
    containers: {
      cardNumber: "mp-card-number",
      expirationDate: "mp-card-expiration",
      securityCode: "mp-card-cvv",
    },
    fieldOptions: {
      cardNumber: { placeholder: "0000 0000 0000 0000" },
      expirationDate: { placeholder: "MM/AA" },
      securityCode: { placeholder: "123" },
    },
  });
  const [holder, setHolder] = useState<string>("");
  const [installments, setInstallments] = useState<number>(1);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [outcome, setOutcome] = useState<PaymentOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isMobile } = useBreakpoint();

  async function pay(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setOutcome(null);
    setError(null);
    try {
      const token = await card.tokenize({
        cardholderName: holder.trim(),
        installments,
        identificationType: customer.kind === "pf" ? "CPF" : "CNPJ",
        identificationNumber: customer.document,
      });
      const body: CardChargeRequest = {
        amount_cents: order.total_cents,
        reference: order.reference,
        card_token: token.token,
        payment_method_id: token.payment_method_id,
        installments: token.installments,
        payer: { name: customer.name, email: customer.email, tax_id: customer.document },
      };
      const charge = await api.post<CardCharge>(`/orders/${encodeIdSegment(order.id)}/card`, {
        body,
        headers: { "Idempotency-Key": generateIdempotencyKey() },
      });
      const result = describeCardCharge(charge);
      if (charge.status === "paid" || charge.status === "authorized") onPaid(result);
      else setOutcome(result);
    } catch (reason) {
      setError(
        describeApiError(
          reason,
          "Não conseguimos validar o cartão. Confira os dados e tente de novo.",
          { codes: CARD_ERRORS },
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (card.status === "error") {
    return (
      <Alert
        variant="warning"
        title="O pagamento com cartão não carregou"
        description="Confira sua conexão, ou pague com Pix: a confirmação sai na hora."
      />
    );
  }

  const installmentsHint = card.installmentsLoading
    ? "Calculando parcelas…"
    : card.paymentMethodId === null
      ? "As parcelas aparecem quando você digitar o número do cartão."
      : undefined;

  return (
    <Form onSubmit={(event) => void pay(event)}>
      {outcome !== null && (
        <Alert variant={outcome.tone} title={outcome.title} description={outcome.message} />
      )}
      {outcome !== null && outcome.canRetry && (
        <Button variant="outline" onClick={onUsePix}>
          Pagar com Pix
        </Button>
      )}
      {error !== null && <Alert variant="danger" title="Pagamento não enviado" description={error} />}
      {card.status === "loading" && <Spinner label="Carregando campos seguros do cartão" />}

      <SecureField id="mp-card-number" label="Número do cartão" />
      <Grid columns={2} gap={4}>
        <SecureField id="mp-card-expiration" label="Validade" />
        <SecureField id="mp-card-cvv" label="CVV" />
      </Grid>
      <Input
        label="Nome impresso no cartão"
        autoComplete="cc-name"
        value={holder}
        onChange={(event) => setHolder(event.target.value)}
        required
      />
      <Select
        label="Parcelas"
        value={installments}
        onChange={(event) => setInstallments(Number(event.target.value))}
        disabled={card.installmentOptions.length === 0}
        helperText={installmentsHint}
        options={card.installmentOptions.map((option) => ({
          value: option.installments,
          label: option.recommendedMessage,
        }))}
      />

      <FormActions>
        <Button
          type="submit"
          loading={submitting}
          disabled={card.status !== "ready" || card.paymentMethodId === null || holder.trim() === ""}
          fullWidth={isMobile}
        >
          {`Pagar ${formatCents(order.total_cents)}`}
        </Button>
      </FormActions>
    </Form>
  );
}
```

Piece by piece:

1. **[`useMercadoPagoCard`](../payments.md#step-2-tokenize-the-card)** loads MercadoPago.js,
   mounts the three Secure Fields in the `<div>`s by `id` and, once Ana types the first digits,
   finds the card brand and fetches the installments.
2. **`publicKey`** is the application's Public Key at Mercado Pago, not the access token. It only
   tokenizes; it is safe in the front end's `.env`.
3. **Installments with the provider's text.** `recommendedMessage` already says "3x de R$ 35,40
   (R$ 106,20)", with interest when there is any. Show it as it came: the total has to be Mercado
   Pago's.
4. **`tokenize`** takes the cardholder, the installments and the document from the sign-up (`CPF`
   for individuals, `CNPJ` for companies) and returns `{ token, payment_method_id, installments }`.
   That is everything that goes to the backend in the `CardChargeRequest`.
5. **A decline is an answer, not an error.** The backend returns a `CardCharge` with
   `status: "failed"` and the reason in `status_detail`.
   [`describeCardCharge`](../payments.md#step-3-explain-the-card-result) turns that into a title
   and a sentence for the payer ("O banco emissor recusou o pagamento…"), and its `tone` goes
   straight into the `<Alert>`'s `variant`.
6. **`paid` or `authorized`** move on to the confirmation. `authorized` means "amount reserved":
   the `describeCardCharge` text never says "paid" in that case.
7. **Declined, but a retry is possible?** The "Pagar com Pix" button takes Ana to the method that
   does not depend on the issuing bank.

!!! info "Why the number never goes through your code 🔒"
    An `<input>` of yours holding the card number puts your page in the PCI scope of whoever
    **handles** card data. With the Secure Fields, number, expiry and CVV only exist inside
    Mercado Pago's iframes. The hook does not even accept the number as a parameter: there is no
    way to misuse it.

!!! warning "The Content-Security-Policy must allow Mercado Pago"
    If your app has a CSP, the script and iframe hosts must be in `script-src`, `frame-src` and
    `connect-src`. The list read from the script is in
    [Payments → Mercado Pago's script](../payments.md#mercado-pagos-script).

!!! note "A `tokenize` error becomes the general sentence"
    `tokenize` rejects before calling the backend when the fields did not load, the brand was not
    identified yet or the person changed the number after the quote. Those rejections are plain
    `Error`s, so `describeApiError` returns the Portuguese `fallback` ("Confira os dados e tente de
    novo"). To test in the sandbox, use the card and cardholders from
    [Payments → Sandbox](../payments.md#sandbox).

### 9. The page that ties it together

`CheckoutPage` derives the step from what already exists: no customer, sign-up; a customer and no
order, review; an order, payment.

```tsx
// src/checkout/CheckoutPage.tsx
import { useCallback, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Container,
  SegmentedControl,
  Stack,
  Stepper,
  formatCents,
  useBreakpoint,
  type PaymentOutcome,
} from "tempest-react-sdk";
import { CardPayment } from "@/checkout/CardPayment";
import { PixPayment } from "@/checkout/PixPayment";
import { ReviewStep } from "@/checkout/ReviewStep";
import { SignupStep } from "@/checkout/SignupStep";
import type { Customer, Order } from "@/checkout/types";

type PaymentMethod = "pix" | "card";

const STEPS = [{ label: "Seus dados" }, { label: "Revisão" }, { label: "Pagamento" }];

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "pix", label: "Pix" },
  { value: "card", label: "Cartão de crédito" },
];

export function CheckoutPage() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const { isMobile } = useBreakpoint();

  const handlePixPaid = useCallback(() => setConfirmation("Recebemos o seu Pix."), []);
  const handleCardPaid = useCallback(
    (outcome: PaymentOutcome) => setConfirmation(outcome.message),
    [],
  );

  if (customer !== null && order !== null && confirmation !== null) {
    return (
      <Container size="sm">
        <Stack gap={4}>
          <Alert
            variant="success"
            title={`Pedido ${order.reference} confirmado`}
            description={`${confirmation} Enviamos o resumo para ${customer.email} e avisamos no WhatsApp quando a cesta sair para entrega.`}
          />
          <Button href="/pedidos" fullWidth={isMobile}>
            Acompanhar pedido
          </Button>
        </Stack>
      </Container>
    );
  }

  const current = customer === null ? 0 : order === null ? 1 : 2;

  return (
    <Container size="md">
      <Stack gap={6}>
        <h1>Finalizar compra</h1>
        <Stepper steps={STEPS} current={current} />

        {customer === null && <SignupStep onCreated={setCustomer} />}

        {customer !== null && order === null && (
          <ReviewStep customer={customer} onOrderCreated={setOrder} />
        )}

        {customer !== null && order !== null && (
          <Card title={`Pagamento · ${formatCents(order.total_cents)}`}>
            <Stack gap={4}>
              <SegmentedControl
                aria-label="Forma de pagamento"
                options={METHODS}
                value={method}
                onChange={setMethod}
                fullWidth={isMobile}
              />
              {method === "pix" ? (
                <PixPayment order={order} onPaid={handlePixPaid} />
              ) : (
                <CardPayment
                  order={order}
                  customer={customer}
                  onPaid={handleCardPaid}
                  onUsePix={() => setMethod("pix")}
                />
              )}
            </Stack>
          </Card>
        )}
      </Stack>
    </Container>
  );
}
```

The current step **is not a state of its own**: it comes from `customer` and `order`. So there
is no "step 3 without an order". The [`SegmentedControl`](../components/navigation.md#segmentedcontrol)
switches between Pix and card without losing the order, and the `useCallback` on the Pix
`onPaid` keeps `PixChargeScreen`'s effect from running again on every render.

!!! tip "Mount it inside `AppProviders`"
    `ReviewStep` uses `useQuery`, which needs the `QueryClient`. [`AppProviders`](../app-providers.md)
    already turns the `QueryProvider` on by default. A `/checkout` route with `<CheckoutPage />`
    inside it is all that is left.

## On mobile 📱

No separate mobile screen. What changes is decided piece by piece:

- **One column.** Every `Grid` uses `columns={{ mobile: ..., desktop: ... }}`: on a phone, street
  and number stack, and the summary sits above the tip. The only exception is expiry + CVV, which
  fit side by side at any width.
- **Full-width buttons.** [`useBreakpoint`](../hooks.md#responsive-usebreakpoint) turns on
  `fullWidth` for the main buttons and the `SegmentedControl`s. The thumb finds the button
  without aiming.
- **The right keyboard.** The masked inputs already declare `inputMode` (`numeric` for CPF, CNPJ
  and CEP; `tel` for the mobile number), and so does `MoneyInput`. The letter keyboard never shows
  up on a number field.
- **Copy-and-paste first on Pix.** A smaller QR, so the copy button stays close to the top.
- **Autofill.** `autoComplete` on name, e-mail, mobile and address lets the browser fill the
  sign-up in one tap.

## Recap

- 🧾 **CPF/CNPJ**: `CPFInput`/`CNPJInput` mask, `validateCPF`/`validateCNPJ` check the check
  digit, `unmask` cleans up before sending.
- 📮 **CEP**: `useViaCEP` fills the address once the CEP reaches 8 digits; a stale answer is
  dropped and the address stays editable.
- 💰 **Money**: integer cents end to end. `MoneyInput nullable` for the optional tip,
  `formatCents` to display, `name` for `FormData`, `useMoneyMask` for a field with its own look.
- 🔁 **Idempotency**: `generateIdempotencyKey` on the order and on the card charge.
- ⚡ **Pix**: `usePixCharge` follows the charge, `PixCheckout` shows it, the backend decides.
- 💳 **Card**: `useMercadoPagoCard` tokenizes in the Secure Fields, `describeCardCharge` explains
  the decline.
- ✅ **States**: loading, empty, error, success and mobile, each with the right SDK piece.
