# Forms

Forms quase sempre travam em dois problemas que não têm nada a ver um com o outro:
**como os campos se arrumam na tela** e **como os valores são validados**. O SDK
separa esses dois eixos de propósito — você pode adotar um sem o outro.

1. **Layout** — `Form` / `FormSection` / `FormRow` / `FormActions` cuidam de como os campos se arranjam na tela.
2. **Validação** — `validateForm` / `zodResolver` / `useZodForm` cuidam de validar valores com zod.

Use os dois juntos ou separados — o `Form` component **não** se acopla a nenhuma form library.

!!! info "Por que zod como fonte de verdade?"
    Em vez de declarar o tipo do form e _depois_ escrever regras de validação que
    podem divergir dele, você escreve um schema zod e o tipo TypeScript é
    **inferido** com `z.infer`. Schema e tipo nunca saem de sincronia, e a mesma
    regra vale no client (`validateForm`/`zodResolver`) e no servidor.

## Layout — `Form` + subcomponentes

Substitui o padrão `<form><Stack>` boilerplate quando você quer um wrapper opinionado por layout.

```tsx
import { Form, FormSection, FormRow, FormActions, Input, Button } from "tempest-react-sdk";
```

### Variantes de `layout`

| `layout`   | Comportamento                                                                            |
| ---------- | ---------------------------------------------------------------------------------------- |
| `"stack"`  | (default) — flex coluna, gap = `gap` (default 4 → 16px).                                 |
| `"inline"` | Flex row com `flex-wrap: wrap` + `align-items: flex-end`. Filter bars, login curto, etc. |
| `"grid"`   | `display: grid` com `grid-template-columns: repeat(columns, minmax(0, 1fr))`.            |

`columns` aceita `number` (`repeat(N, minmax(0, 1fr))`) ou `string` (`"2fr 1fr"`, `"min-content auto"`).

`gap` aceita `number` (escala 4px: `2` → `8px`, `4` → `16px`) ou `string` (qualquer CSS length: `"1.5rem"`, `"20px"`).

### Stacked

```tsx
<Form layout="stack" gap={4} onSubmit={form.handleSubmit(onSubmit)}>
  <Input label="Nome" {...form.register("name")} />
  <Input label="Email" type="email" {...form.register("email")} />
  <Input label="Senha" type="password" {...form.register("password")} />
  <FormActions align="end">
    <Button type="submit">Criar conta</Button>
  </FormActions>
</Form>
```

### Grid

```tsx
<Form layout="grid" columns={2} gap={4} onSubmit={form.handleSubmit(onSubmit)}>
  <Input label="Nome" {...register("name")} />
  <Input label="Sobrenome" {...register("last_name")} />
  <Input label="Email" type="email" {...register("email")} />
  <Input label="Telefone" {...register("phone")} />
  <FormActions align="end" style={{ gridColumn: "1 / -1" }}>
    <Button type="submit">Salvar</Button>
  </FormActions>
</Form>
```

!!! tip "Span de linha inteira"
    Use `gridColumn: "1 / -1"` para um campo (ou o `FormActions`) ocupar a linha
    inteira do grid, independente de quantas colunas existem.

### Inline

```tsx
<Form layout="inline" gap={2} onSubmit={onSubmit}>
  <Input label="Buscar" placeholder="nome…" />
  <Select label="Status" options={statusOptions} />
  <Button type="submit">Filtrar</Button>
</Form>
```

Filter bars típicos: `align-items: flex-end` faz os botões ficarem alinhados com o baseline dos inputs.

### `FormSection` — subgrupos com layout independente

```tsx
<Form layout="stack" gap={5}>
  <Input label="Email" {...register("email")} />

  <FormSection title="Endereço" description="Usado para entrega" layout="grid" columns={3} gap={3}>
    <Input label="CEP" {...register("cep")} />
    <Input label="Cidade" {...register("city")} />
    <Input label="UF" {...register("state")} />
    <Input label="Rua" style={{ gridColumn: "1 / -1" }} {...register("street")} />
  </FormSection>

  <FormActions align="end">
    <Button type="submit">Salvar</Button>
  </FormActions>
</Form>
```

`FormSection` renderiza um `<section>` com `<header>` (quando `title` ou `description` presente) + body. O body tem o seu próprio `layout` / `columns` / `gap`.

### `FormRow` — side-by-side dentro de stack

```tsx
<Form layout="stack" gap={4}>
  <Input label="Número do cartão" />
  <FormRow gap={3}>
    <Input label="Validade" placeholder="MM/AA" />
    <Input label="CVV" />
  </FormRow>
</Form>
```

`FormRow` sempre é horizontal com `flex-wrap: wrap`. Children dividem largura igualmente (`flex: 1 1 0`).

### `FormActions` — footer buttons

```tsx
<FormActions align="between" gap={2}>
  <Button variant="ghost" type="button" onClick={onCancel}>
    Cancelar
  </Button>
  <Button type="submit" loading={form.formState.isSubmitting}>
    Salvar
  </Button>
</FormActions>
```

`align`: `"start"` / `"center"` / `"end"` (default) / `"between"`.

## Validação — zod

Três níveis de integração com zod, do mais leve ao mais opinativo. Schema é a **fonte de verdade** — o tipo é inferido.

### 1. `validateForm` — agnóstico

Não requer `react-hook-form`. Útil pra forms controlados manuais ou validação em batch.

```ts
import { validateForm } from "tempest-react-sdk";

const result = validateForm(schema, values);
if (!result.success) {
  setErrors(result.errors); // Record<path, message>
  return;
}
await save(result.data);
```

Path em dot-notation (`"address.city"`, `"items.0.name"`). Erros de root: `_root`.

!!! note "Primeiro erro por campo vence"
    `validateForm` mantém só a **primeira** issue de cada path no map de erros —
    UIs de form quase sempre mostram uma mensagem por campo. Se você precisa de
    _todas_ as mensagens (ex.: checklist de regras de senha), use
    `schema.safeParse(values).error.issues` direto.

### 2. `zodResolver` — react-hook-form

Substitui `@hookform/resolvers/zod` (sem dependência extra).

```ts
import { useForm } from "react-hook-form";
import { zodResolver } from "tempest-react-sdk";

const form = useForm({ resolver: zodResolver(loginSchema) });
```

### 3. `useZodForm` — tudo-em-um

```tsx
const form = useZodForm(loginSchema, { defaultValues: { email: "", password: "" } });

<Form layout="stack" onSubmit={form.handleSubmit(login)}>
  <Input label="Email" {...form.register("email")} error={form.formState.errors.email?.message} />
  <Input
    label="Senha"
    type="password"
    {...form.register("password")}
    error={form.formState.errors.password?.message}
  />
  <FormActions>
    <Button type="submit" loading={form.formState.isSubmitting}>
      Entrar
    </Button>
  </FormActions>
</Form>;
```

## Exemplo completo — schema → provider → fields → submit

Os três trechos acima são fatias da mesma história. Aqui está um form ponta-a-ponta
de cadastro: um único schema dirige tipos, validação **e** o `<FormField>` injeta o
estado do RHF em cada controle sem `<Controller>` repetido.

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

// 1. Schema = fonte de verdade. O tipo SignupValues é inferido dele.
const signupSchema = z
  .object({
    name: z.string().min(2, "Informe seu nome"),
    email: z.string().email("Email inválido"),
    password: z.string().min(8, "Mínimo de 8 caracteres"),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "As senhas não conferem",
    path: ["confirm"], // erro atribuído ao campo "confirm"
  });

type SignupValues = z.infer<typeof signupSchema>;

export function SignupForm() {
  // 2. useZodForm fia o resolver zod + infere SignupValues automaticamente.
  const form = useZodForm(signupSchema, {
    defaultValues: { name: "", email: "", password: "", confirm: "" },
  });

  // 4. handleSubmit só dispara o submit quando o schema passa.
  const onSubmit: SubmitHandler<SignupValues> = async (values) => {
    await fetch("/api/signup", {
      method: "POST",
      body: JSON.stringify(values),
    });
  };

  return (
    // 3. FormProvider expõe o `control` na árvore; FormField o consome via contexto.
    <FormProvider {...form}>
      <Form layout="stack" gap={4} onSubmit={form.handleSubmit(onSubmit)}>
        <FormField name="name" label="Nome" required>
          <Input />
        </FormField>
        <FormField name="email" label="Email" required>
          <Input type="email" />
        </FormField>
        <FormField name="password" label="Senha" required>
          <Input type="password" />
        </FormField>
        <FormField name="confirm" label="Confirmar senha" required>
          <Input type="password" />
        </FormField>
        <FormActions align="end">
          <Button type="submit" loading={form.formState.isSubmitting}>
            Criar conta
          </Button>
        </FormActions>
      </Form>
    </FormProvider>
  );
}
```

Como as peças se encaixam:

- **`useZodForm(schema)`** retorna o objeto `UseFormReturn` do react-hook-form, já
  com o resolver zod plugado. Você ganha `register`, `handleSubmit`, `formState`,
  `control` etc. tipados em cima de `SignupValues`.
- **`<FormProvider {...form}>`** publica esse retorno no contexto do RHF. É o que
  permite o `<FormField>` achar o `control` sozinho.
- **`<FormField name="..." label="...">`** envolve um `<Controller>` por baixo e usa
  `cloneElement` pra injetar `value` / `onChange` / `onBlur` / `ref` / `error` /
  `aria-invalid` no controle filho. Você passa um `<Input />` "burro" e o FormField
  conecta tudo.
- **`form.handleSubmit(onSubmit)`** roda o schema antes; `onSubmit` só recebe
  `values` já validados e tipados.

!!! tip "FormField elimina o `<Controller>` repetido"
    Sem ele, cada campo controlado vira um `<Controller name=... render={({ field, fieldState }) => ...} />`
    de 5 linhas. O `<FormField>` faz esse render-prop uma vez e repassa `error` +
    `aria-invalid` pro controle automaticamente.

!!! warning "FormField precisa de control ou Provider"
    `<FormField>` busca o `control` no contexto do `<FormProvider>`. Se você não
    quer um provider, passe `control={form.control}` explicitamente em cada
    `<FormField>`. Sem nenhum dos dois ele lança
    `"FormField requires either a control prop or a <FormProvider> in the tree."`.

!!! note "O controle filho precisa aceitar as props injetadas"
    O `<FormField>` espera que o filho aceite `value` / `onChange` / `onBlur` /
    `ref` / `error` / `label`. Os componentes do SDK (`Input`, `Select`, e os
    [inputs com máscara BR](./forms-br.md)) já aceitam — um `<input>` cru do DOM
    **não** entende `error`/`label` e vai logar warning de prop desconhecida.

!!! tip "Erros cross-field"
    Validações que dependem de dois campos (senha × confirmação) vão num
    `.refine()` no schema com `path: ["campo"]` — assim o erro aparece atribuído ao
    campo certo no `formState.errors`.

## Padrão de schema

Mantenha schemas em `src/schemas/<dominio>.ts`, exporte o `z.infer` em `src/types/<dominio>.ts` via `declare global` quando quiser tipos globais. Convenção herdada do alofans-frontend.

## Resumo

- O SDK separa **layout** (`Form`/`FormSection`/`FormRow`/`FormActions`) de **validação** (zod) — adote um sem o outro.
- A validação tem três degraus: `validateForm` (agnóstico), `zodResolver` (RHF), `useZodForm` (tudo-em-um).
- Um único **schema zod** dirige tipo (`z.infer`), validação e mensagens de erro.
- `<FormProvider>` + `<FormField>` removem o `<Controller>` repetido e propagam `error` + `aria-invalid` pros controles.
- `handleSubmit` só chama seu `onSubmit` com valores já validados.

## Veja também

- [Forms BR](./forms-br.md) — `CPFInput` / `CNPJInput` / `CEPInput` / `MoneyInput` / `useViaCEP` / algoritmos de validação BR
- [HTTP](./http.md) — `parseResponse` usa o mesmo zod
- [Componentes](./components.md) — `Input` / `Select` / `Textarea` que vivem dentro do Form
- [Hooks](./hooks.md) — `useAsync` para o estado do submit quando você não usa RHF
