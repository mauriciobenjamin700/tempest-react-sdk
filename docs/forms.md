# Forms

Dois eixos independentes:

1. **Layout** — `Form` / `FormSection` / `FormRow` / `FormActions` cuidam de como os campos se arranjam na tela.
2. **Validação** — `validateForm` / `zodResolver` / `useZodForm` cuidam de validar valores com zod.

Use os dois juntos ou separados — o `Form` component **não** se acopla a nenhuma form library.

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

Use `gridColumn: "1 / -1"` para um campo (ou o `FormActions`) ocupar a linha inteira.

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

## Padrão de schema

Mantenha schemas em `src/schemas/<dominio>.ts`, exporte o `z.infer` em `src/types/<dominio>.ts` via `declare global` quando quiser tipos globais. Convenção herdada do alofans-frontend.

## Veja também

- [Forms BR](./forms-br.md) — `CPFInput` / `CNPJInput` / `CEPInput` / `MoneyInput` / `useViaCEP` / algoritmos de validação BR
- [HTTP](./http.md) — `parseResponse` usa o mesmo zod
- [Componentes](./components.md) — `Input` / `Select` / `Textarea` que vivem dentro do Form
