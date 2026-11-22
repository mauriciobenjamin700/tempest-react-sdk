# Cadastro BR + checkout

A **Feira Fresca** entrega cestas de orgânicos em São Paulo. A Ana montou a cesta da semana no
celular e tocou em "Finalizar compra". É a primeira vez dela: a loja precisa do CPF para a nota,
do endereço para a entrega e de um pagamento confirmado antes de separar os produtos. O
restaurante da esquina compra da mesma loja, mas com CNPJ.

Esta receita constrói essa tela de ponta a ponta: cadastro com documento validado de verdade,
endereço que se completa pelo CEP, revisão da cesta com gorjeta opcional e pagamento por Pix ou
cartão, com o backend decidindo quando o dinheiro chegou. 🚀

## O que vamos construir

Um checkout em três passos, marcado por um [`Stepper`](../components/navigation.md#stepper):

1. **Seus dados** — pessoa física (CPF) ou empresa (CNPJ), nome, e-mail, celular e endereço. O
   CEP preenche rua, bairro, cidade e UF sozinho.
2. **Revisão** — itens da cesta, frete, uma gorjeta opcional para o entregador e o total.
3. **Pagamento** — Pix com QR, copia-e-cola e contagem regressiva, ou cartão de crédito com
   parcelas. A tela confirma sozinha quando o backend diz que pagou.

E os estados que uma tela real tem:

| Situação                      | O que a pessoa vê                                                   |
| ----------------------------- | ------------------------------------------------------------------- |
| Cesta carregando              | Esqueleto no lugar do resumo                                        |
| Cesta vazia                   | Estado vazio com link para a feira                                  |
| Erro de rede ou do backend    | Frase em português, com o motivo quando o backend nomeou um         |
| CPF/CNPJ com dígito errado    | Erro no próprio campo, antes de qualquer requisição                 |
| CEP inexistente               | Erro no CEP e os campos de endereço livres para digitar             |
| Pix expirado                  | "Gerar novo Pix" no lugar do QR                                     |
| Cartão recusado               | O motivo do banco, reescrito para o pagador, e o convite para o Pix |
| Pago                          | Pedido confirmado, com o número de referência                       |
| Celular                       | Uma coluna, botões na largura toda, teclado numérico nos documentos |

## O contrato com o backend

O backend é um serviço FastAPI feito com o `tempest-fastapi-sdk` (veja a
[integração full-stack](../integration-fastapi.md)). Cinco rotas, todas sob `/api`:

| Método | Rota                    | Corpo                                 | Resposta                  |
| ------ | ----------------------- | ------------------------------------- | ------------------------- |
| `POST` | `/api/customers`        | cadastro (abaixo)                     | `201` + `Customer`        |
| `GET`  | `/api/cart`             | —                                     | `Cart`                    |
| `POST` | `/api/orders`           | `{ customer_id, tip_cents }`          | `201` + `Order`           |
| `POST` | `/api/orders/{id}/pix`  | —                                     | `PixCharge` (do SDK)      |
| `GET`  | `/api/orders/{id}/pix`  | —                                     | `PixCharge` (do SDK)      |
| `POST` | `/api/orders/{id}/card` | `CardChargeRequest` (do SDK)          | `CardCharge` (do SDK)     |

O cadastro trafega **só dígitos** e dinheiro trafega em **centavos inteiros**:

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

E a cesta chega assim:

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

`PixCharge`, `CardChargeRequest` e `CardCharge` são os tipos do próprio SDK, espelho dos schemas
Pydantic do backend. O detalhe campo a campo está em [Pagamentos](../payments.md#o-contrato-que-vem-do-backend).

!!! info "Erros que o backend nomeia"
    Quando a regra de negócio recusa, o backend responde com o envelope do `tempest-fastapi-sdk`,
    que carrega um `code`. Esta tela trata três: `DOCUMENT_TAKEN` (CPF/CNPJ já cadastrado),
    `CART_CHANGED` (item mudou de preço ou acabou) e `ORDER_ALREADY_PAID` (o Pix caiu enquanto a
    pessoa tentava o cartão). Qualquer outro segue o funil do
    [`describeApiError`](../http.md#do-erro-tipado-para-a-frase-na-tela-describeapierror).

## Os arquivos

Oito arquivos, todos sob `src/checkout/` (mais o cliente HTTP em `src/lib/`). Vamos um a um.

### 1. Os tipos do domínio

Os tipos que o SDK não tem — cliente, cesta e pedido. Os de pagamento vêm do SDK.

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

### 2. O cliente HTTP

Um [`createApiClient`](../http.md#createapiclient) para o app inteiro. Ele já entrega erro
tipado, serializa JSON e aceita `signal` para cancelar.

```ts
// src/lib/api.ts
import { createApiClient } from "tempest-react-sdk";

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
});
```

### 3. O schema do cadastro

Um schema zod é a fonte de verdade do formulário: tipos, validação e mensagens.

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

O documento aceita **CPF ou CNPJ** com [`validateCPF` / `validateCNPJ`](../forms-br.md#validadores),
que rodam o algoritmo de dígito verificador completo. Qual dos dois a pessoa digita quem decide é
o input com máscara: o `CPFInput` para em 11 dígitos e o `CNPJInput` em 14, então os dois casos
nunca se confundem.

!!! tip "Por que não um `.superRefine` olhando o `kind`?"
    No zod 4, um refinamento no **objeto** só roda quando todos os campos passaram. Com o
    `.superRefine` lendo `kind`, a Ana só veria "CPF inválido" depois de preencher o endereço
    inteiro. Validar no próprio campo mostra o erro assim que ela sai dele. ✅

### 4. O passo "Seus dados"

O formulário de cadastro. É o maior arquivo da receita: documento, contato e o endereço que se
completa pelo CEP.

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

Peça por peça:

1. **`useZodForm(signupSchema)`** liga o schema ao react-hook-form, e o **`<FormProvider>`** deixa
   cada [`<FormField>`](../forms.md#exemplo-completo-schema-provider-fields-submit) achar o
   formulário sozinho. O `FormField` injeta `value`, `onChange`, `error` e `ref` no input filho.
2. **`<SegmentedControl>`** troca entre pessoa física e empresa. Ao trocar, o documento é zerado:
   um CPF pela metade não vira CNPJ. O `key={kind}` remonta o campo com a máscara certa.
3. **`<CPFInput>` / `<CNPJInput>` / `<PhoneInput>` / `<CEPInput>`** são os
   [inputs com máscara](../forms-br.md#inputs-com-mascara). Eles formatam enquanto a pessoa
   digita e abrem o teclado numérico no celular (`inputMode`).
4. **O CEP completa o endereço.** O `useWatch` observa o campo; quando ele chega a 8 dígitos, o
   [`useViaCEP`](../forms-br.md#viacep) consulta o ViaCEP. Achou: preenche e manda o foco para o
   **número**, o único campo que o CEP não sabe. Não achou: erro no CEP, e os campos continuam
   livres para digitar.
5. **`unmask` antes de enviar.** A tela mostra `529.982.247-25`; o backend recebe `52998224725`.
6. **Erro do backend em dois lugares.** O que nomeia um campo (`error.fields`) vai para o input
   certo com `setError`. A frase geral vai para o `<Alert>` do topo, montada pelo
   `describeApiError` com o `code` `DOCUMENT_TAKEN` traduzido.

!!! tip "CEP de cidade pequena não tem rua"
    Em cidades com CEP único, o ViaCEP devolve `logradouro` e `bairro` vazios. Por isso o foco vai
    para a **rua** quando ela veio vazia, e por isso todos os campos de endereço continuam
    editáveis. Nunca trave o endereço no que o CEP trouxe.

!!! note "O `current` no efeito"
    A Ana digita `01310-100`, apaga um dígito e digita outro CEP. A primeira consulta pode
    responder depois da segunda. O `current = false` da limpeza do efeito descarta a resposta
    velha, para o endereço de um CEP não aparecer embaixo do outro.

!!! warning "`autoComplete=\"off\"` no documento"
    O navegador oferece CPFs digitados em outros sites. Num checkout onde a mesma pessoa pode
    comprar como pessoa física e como empresa, a sugestão errada é o erro mais comum. Já e-mail,
    celular e endereço usam os tokens de `autocomplete` padrão: é o que faz o preenchimento
    automático do celular funcionar.

### 5. O resumo do pedido

Um componente puro: recebe a cesta e a gorjeta, mostra as linhas e o total.

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

[`formatCents`](../utilities.md#format-cents) formata direto dos centavos (`3030` →
`R$ 30,30`), sem passar por float. A gorjeta só aparece quando foi informada: `null` é "não
informada", e não vira uma linha de `R$ 0,00`.

### 6. O passo "Revisão"

Carrega a cesta, oferece a gorjeta e cria o pedido.

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

Os quatro estados aparecem em ordem: **carregando** ([`Skeleton`](../components/feedback.md#skeleton)),
**erro** ([`Alert`](../components/feedback.md#alert) com "Tentar de novo"), **vazio**
([`EmptyState`](../components/feedback.md#emptystate)) e **sucesso**. O
[`Grid`](../components/layout.md#grid) põe o resumo e a gorjeta lado a lado no desktop e
empilha no celular.

A gorjeta é um [`MoneyInput`](../forms-br.md#money-nullable) com `nullable`:

- Ele trabalha em **centavos inteiros**, no estilo dos apps de banco: digitar `500` mostra
  `R$ 5,00`.
- Com `nullable`, o campo vazio entrega `null`. "Não quero dar gorjeta" fica diferente de
  "dei R$ 0,00", e o resumo não mostra uma linha vazia.
- `maxCents={5_000}` ignora o dígito que passaria de R$ 50,00, em vez de aceitar um valor que
  ninguém quis digitar.

!!! check "Pedido criado uma vez só"
    No 4G da feira, o toque em "Ir para o pagamento" pode chegar ao backend e a resposta se
    perder. A pessoa toca de novo. O
    [`generateIdempotencyKey`](../http.md#generateidempotencykey) cria **uma** chave por visita à
    tela, e o backend devolve o mesmo pedido para a mesma chave. Dois toques, um pedido.

!!! note "O total que vale é o do backend"
    O `OrderSummary` soma no cliente para a Ana ver o total enquanto escolhe a gorjeta. Mas o
    valor cobrado é o `order.total_cents` que o `POST /api/orders` devolveu, calculado com os
    preços do banco. É esse que os passos de pagamento usam.

#### Variantes do campo de gorjeta

O `MoneyInput` controlado acima é o caso comum. Dois outros aparecem em apps reais:

=== "Formulário não controlado (`name`)"

    Quando o formulário é lido com `FormData`, o texto visível (`R$ 5,00`) não serve para o
    backend. Com [`name`](../forms-br.md#money-name), o `MoneyInput` renderiza um
    `<input type="hidden">` com o valor cru.

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

    O `FormData` traz `"500"` para R$ 5,00, ou `""` quando ficou vazio. Com
    `nameFormat="decimal"`, traz `"5.00"`.

=== "Campo com visual próprio (`useMoneyMask`)"

    Quando o design pede botões de valor sugerido ao lado do campo, a moldura do `<Input>` do SDK
    atrapalha. O [`useMoneyMask`](../forms-br.md#use-money-mask) é a mesma máscara, para espalhar
    no seu `<input>`.

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

O Pix é o meio que a maioria escolhe. O backend cria a cobrança no Mercado Pago e o app mostra a
tela até o backend dizer que acabou.

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

Peça por peça:

1. **A cobrança nasce de um toque.** "Gerar código Pix" chama `POST /api/orders/{id}/pix`. Criar
   no `useEffect` de montagem geraria duas cobranças no `StrictMode` do React.
2. **[`usePixCharge`](../payments.md#passo-1-a-tela-do-pix)** relê a cobrança a cada 4 segundos
   pelo **seu** endpoint e para sozinho quando o status é final (`paid`, `expired`, …). As
   leituras são sequenciais: backend lento não recebe requisição sobreposta.
3. **`<PixCheckout>`** mostra valor, QR, copia-e-cola com botão de copiar e a contagem regressiva
   até `expires_at`. Ele só **mostra**: quem decide que pagou é o backend.
4. **Expirou?** O `footer` troca o QR por "Gerar novo Pix". A cobrança nova tem outro
   `provider_charge_id`, e o `usePixCharge` recomeça a seguir a partir dela.
5. **Pagou?** O efeito chama `onPaid`, e o `CheckoutPage` mostra a confirmação.
6. **Caiu a rede?** O `error` do hook vira um aviso amarelo, e o polling continua. Requisição
   perdida não é estado de pagamento.

!!! tip "No celular, o QR é o plano B 📱"
    A Ana está pagando **no mesmo celular** em que vai abrir o app do banco: não tem como ela
    escanear a própria tela. O caminho dela é o **copia-e-cola**, que o `PixCheckout` mostra com
    botão de copiar. Por isso o `qrSize` encolhe no celular: o QR continua lá para quem abriu a
    loja no computador, sem empurrar o botão de copiar para fora da tela.

!!! warning "Quando o relógio zera, a tela diz \"confirmando\", não \"expirado\""
    Um Pix enviado no último segundo ainda pode cair. Com o prazo vencido e o status ainda
    `pending`, o `PixCheckout` esconde o QR e diz que está confirmando com o banco. Só quando o
    backend responder `expired` aparece o botão de gerar outro.

??? info "Backend: devolva a cobrança aberta"
    A Ana gera o Pix, troca para "Cartão", desiste e volta para "Pix". O `PixPayment` remontou e
    oferece "Gerar código Pix" de novo. Se o `POST /api/orders/{id}/pix` criar sempre uma
    cobrança nova, o pedido fica com dois QR válidos. Faça o backend devolver a cobrança
    `pending` que ainda está no prazo, e criar outra só quando a anterior acabou.

### 8. Cartão de crédito

O número do cartão é digitado **dentro** dos iframes do Mercado Pago (os Secure Fields). O app
recebe só um token.

Os iframes ocupam a caixa onde são montados, então ela precisa de altura e borda. Um CSS curto:

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

E o componente:

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

Peça por peça:

1. **[`useMercadoPagoCard`](../payments.md#passo-2-tokenizar-o-cartao)** carrega o MercadoPago.js,
   monta os três Secure Fields nos `<div>` pelos `id` e, quando a Ana digita os primeiros
   dígitos, descobre a bandeira e busca as parcelas.
2. **`publicKey`** é a Public Key da aplicação no Mercado Pago, não o access token. Ela só serve
   para tokenizar; fica no `.env` do front sem risco.
3. **Parcelas com o texto do provedor.** `recommendedMessage` já diz "3x de R$ 35,40 (R$ 106,20)",
   com juros quando há. Mostre como veio: o total tem de ser o do Mercado Pago.
4. **`tokenize`** recebe o titular, as parcelas e o documento do cadastro (`CPF` para pessoa
   física, `CNPJ` para empresa) e devolve `{ token, payment_method_id, installments }`. É tudo
   o que vai para o backend no `CardChargeRequest`.
5. **Recusa é resposta, não erro.** O backend devolve um `CardCharge` com `status: "failed"` e o
   motivo em `status_detail`. O
   [`describeCardCharge`](../payments.md#passo-3-explicar-o-resultado-do-cartao) vira isso em
   título e frase para o pagador ("O banco emissor recusou o pagamento…"), e o `tone` vai direto
   no `variant` do `<Alert>`.
6. **`paid` ou `authorized`** seguem para a confirmação. `authorized` é "valor reservado": o
   texto do `describeCardCharge` nunca diz "pago" nesse caso.
7. **Recusado com nova tentativa possível?** O botão "Pagar com Pix" leva a Ana para o meio que
   não depende do banco emissor.

!!! info "Por que o número nunca passa pelo seu código 🔒"
    Um `<input>` seu com o número do cartão coloca a sua página no escopo de PCI de quem
    **manipula** dado de cartão. Com os Secure Fields, número, validade e CVV existem só dentro
    dos iframes do Mercado Pago. O hook nem aceita o número como parâmetro: não existe jeito de
    usá-lo errado.

!!! warning "A Content-Security-Policy precisa liberar o Mercado Pago"
    Se o seu app tem CSP, os hosts do script e dos iframes precisam estar em `script-src`,
    `frame-src` e `connect-src`. A lista lida do script está em
    [Pagamentos → O script do Mercado Pago](../payments.md#o-script-do-mercado-pago).

!!! note "Erro do `tokenize` vira a frase geral"
    O `tokenize` rejeita antes de chamar o backend quando os campos não carregaram, a bandeira
    ainda não foi identificada ou a pessoa trocou o número depois da cotação. Essas rejeições são
    `Error` comuns, então o `describeApiError` devolve o `fallback` em português ("Confira os dados
    e tente de novo"). Para testar no sandbox, use o cartão e os titulares de
    [Pagamentos → Sandbox](../payments.md#sandbox).

### 9. A página que junta tudo

O `CheckoutPage` decide o passo a partir do que já existe: sem cliente, cadastro; com cliente e
sem pedido, revisão; com pedido, pagamento.

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

O passo atual **não é um estado próprio**: ele sai de `customer` e `order`. Assim não existe um
"passo 3 sem pedido". O [`SegmentedControl`](../components/navigation.md#segmentedcontrol) troca
entre Pix e cartão sem perder o pedido, e o `useCallback` no `onPaid` do Pix evita que o efeito
do `PixChargeScreen` rode de novo a cada render.

!!! tip "Monte dentro do `AppProviders`"
    O `ReviewStep` usa `useQuery`, que precisa do `QueryClient`. O
    [`AppProviders`](../app-providers.md) já liga o `QueryProvider` por padrão. Uma rota
    `/checkout` com o `<CheckoutPage />` dentro dele é tudo o que falta.

## No celular 📱

Nada de tela separada para mobile. O que muda é decidido por peça:

- **Uma coluna.** Todo `Grid` usa `columns={{ mobile: ..., desktop: ... }}`: no celular, rua e
  número empilham, e o resumo fica acima da gorjeta. A única exceção é validade + CVV, que cabem
  lado a lado em qualquer largura.
- **Botões na largura toda.** O [`useBreakpoint`](../hooks.md#responsive-usebreakpoint) liga o
  `fullWidth` dos botões principais e dos `SegmentedControl`. O polegar acha o botão sem mirar.
- **Teclado certo.** Os inputs com máscara já declaram `inputMode` (`numeric` para CPF, CNPJ e
  CEP; `tel` para o celular), e o `MoneyInput` também. O teclado de letras nunca aparece num
  campo de número.
- **Copia-e-cola primeiro no Pix.** QR menor, para o botão de copiar ficar perto do topo.
- **Preenchimento automático.** `autoComplete` em nome, e-mail, celular e endereço deixa o
  navegador preencher o cadastro em um toque.

## Recap

- 🧾 **CPF/CNPJ**: `CPFInput`/`CNPJInput` mascaram, `validateCPF`/`validateCNPJ` conferem o
  dígito verificador, `unmask` limpa antes de enviar.
- 📮 **CEP**: `useViaCEP` completa o endereço quando o CEP chega a 8 dígitos; resposta velha é
  descartada e o endereço continua editável.
- 💰 **Dinheiro**: centavos inteiros de ponta a ponta. `MoneyInput nullable` para a gorjeta
  opcional, `formatCents` para mostrar, `name` para `FormData`, `useMoneyMask` para o campo
  com visual próprio.
- 🔁 **Idempotência**: `generateIdempotencyKey` no pedido e na cobrança do cartão.
- ⚡ **Pix**: `usePixCharge` segue a cobrança, `PixCheckout` mostra, o backend decide.
- 💳 **Cartão**: `useMercadoPagoCard` tokeniza nos Secure Fields, `describeCardCharge` explica
  a recusa.
- ✅ **Estados**: carregando, vazio, erro, sucesso e celular, cada um com a peça do SDK certa.
