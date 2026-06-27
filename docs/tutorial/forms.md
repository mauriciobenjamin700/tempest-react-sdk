# Tutorial — Formulários

Antes do usuário entrar no app, ele precisa se cadastrar — e o cadastro precisa
ser **validado**: e-mail com formato certo, senha com tamanho mínimo, telefone
preenchido. Nesta página você monta um formulário de cadastro com `useZodForm`
(validação por schema), `FormField` (cola a validação aos componentes) e um campo
mascarado de telefone BR (`PhoneInput`), e por fim envia os dados pro cliente HTTP.

A regra de ouro: o **schema zod é a fonte de verdade**. O tipo dos valores é
inferido dele — você não declara o tipo duas vezes.

## Passo 1 — O schema com zod

`zod` é dependência **direta** do SDK, já instalada. Descreva o formato do
formulário com `z.object`:

```ts
// src/schemas/signup.ts
import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().min(2, "Informe seu nome"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().min(14, "Telefone incompleto"),
  password: z.string().min(8, "Mínimo de 8 caracteres"),
});

export type SignupValues = z.infer<typeof signupSchema>;
```

Cada `.min(...)` / `.email(...)` carrega a **mensagem de erro** que aparece no
campo. O `z.infer` deriva o tipo `SignupValues` — a única definição de tipo que
você precisa.

## Passo 2 — `useZodForm`, o tudo-em-um

`useZodForm` embrulha o `useForm` do react-hook-form já ligado ao seu schema, sem
precisar de pacote de resolver extra. Você passa o schema e os valores iniciais:

```tsx
// src/pages/Signup.tsx (esqueleto)
import { useZodForm } from "tempest-react-sdk";
import { signupSchema, type SignupValues } from "@/schemas/signup";

export function Signup() {
  const form = useZodForm(signupSchema, {
    defaultValues: { name: "", email: "", phone: "", password: "" },
  });

  // form.register, form.handleSubmit, form.formState, form.control ...
}
```

O `form` devolvido é o objeto padrão do react-hook-form — `register`,
`handleSubmit`, `control`, `formState.errors`, `formState.isSubmitting`.

## Passo 3 — `FormField` + `FormProvider`

Ligar cada campo à validação na mão dá trabalho. O `FormField` é a cola entre o
react-hook-form e os componentes controlados do SDK: ele injeta `value`,
`onChange`, `label`, `error` e o estado de erro no componente filho
automaticamente. Para o `FormField` achar o `control`, envolva tudo num
`FormProvider` (também re-exportado pelo SDK).

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
    console.log("válido!", values);
  }

  return (
    <FormProvider {...form}>
      <Form layout="stack" gap={4} onSubmit={form.handleSubmit(onSubmit)}>
        <FormField name="name" label="Nome" required>
          <Input />
        </FormField>
        <FormField name="email" label="E-mail" required>
          <Input type="email" />
        </FormField>
        <FormField name="phone" label="Telefone" required>
          <PhoneInput />
        </FormField>
        <FormField name="password" label="Senha" required>
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

Peça por peça:

- `<FormProvider {...form}>` publica o `form` no contexto — é o que o `FormField`
  lê pra achar o `control`.
- `<Form layout="stack" gap={4}>` é só **layout** (flex coluna, gap de 16px) — ele
  não se acopla a nenhuma form library.
- Cada `<FormField name="..." label="...">` casa o `name` com uma chave do schema e
  injeta `value`/`onChange`/`error` no filho. Os erros do zod aparecem
  automaticamente abaixo do campo.
- `form.handleSubmit(onSubmit)` só chama o `onSubmit` quando **tudo** valida.

!!! warning "O `name` precisa bater com uma chave do schema"

    `<FormField name="email">` exige uma chave `email` no `signupSchema`. Como
    `useZodForm` é tipado pelo schema, escrever `name="emial"` vira erro de
    compilação — você pega o engano antes de rodar. ✅

## Passo 4 — O campo mascarado de telefone

Você não escreveu nenhuma lógica de máscara — `PhoneInput` é um dos campos BR
prontos do SDK. Ele formata o que o usuário digita (`11999998888` →
`(11) 99999-8888`) e repassa o valor mascarado pro form. Outros disponíveis:

| Componente   | Formata                    |
| ------------ | -------------------------- |
| `PhoneInput` | telefone `(11) 99999-8888` |
| `CPFInput`   | CPF `123.456.789-09`       |
| `CNPJInput`  | CNPJ `12.345.678/0001-90`  |
| `CEPInput`   | CEP `01310-100`            |
| `MoneyInput` | moeda `R$ 1.234,56`        |

Todos funcionam dentro de um `FormField` exatamente como o `PhoneInput` acima —
basta trocar o filho.

!!! info "A máscara afeta o valor validado"

    O `phone` chega ao schema **já mascarado** (`(11) 99999-8888`, 15 caracteres).
    Por isso o `.min(14)` do schema considera os caracteres da máscara. Se o seu
    backend quiser só dígitos, desmascare no `onSubmit` antes de enviar (o SDK
    exporta `unmask` pra isso).

## Passo 5 — Enviando pro backend

Agora ligue o `onSubmit` ao cliente HTTP que você criou na página de
[busca de dados](data-fetching.md). Em vez de `console.log`, faça o `POST` e, no
sucesso, navegue pra tela de login:

```tsx
// src/pages/Signup.tsx (apenas o onSubmit)
import { useNavigate } from "tempest-react-sdk";
import { api } from "@/lib/api";
import type { SignupValues } from "@/schemas/signup";

// dentro do componente:
const navigate = useNavigate();

async function onSubmit(values: SignupValues) {
  await api.post("/auth/signup", { body: values });
  navigate("/login");
}
```

Repare que `form.formState.isSubmitting` (passado em `loading={...}` no botão)
fica `true` enquanto a `Promise` do `onSubmit` não resolve — o botão mostra o
estado de carregamento sozinho, porque o react-hook-form acompanha a `async`
function.

!!! tip "Erros de validação x erros de rede"

    O zod cuida da validação **antes** do envio: campos inválidos nem chegam ao
    `onSubmit`. Já um erro **de rede** (o `POST` falhar) é um `throw` do
    `api.post` — trate com `try/catch` no `onSubmit` se quiser mostrar uma
    mensagem de "falha ao cadastrar".

## Recap

- O **schema zod é a fonte de verdade**: mensagens de erro moram nele e o tipo
  sai de `z.infer`. ✅
- **`useZodForm(schema, { defaultValues })`** embrulha o react-hook-form já ligado
  ao zod — sem pacote de resolver extra.
- **`<FormProvider {...form}>`** publica o form no contexto; cada
  **`<FormField name="..." label="...">`** cola validação e erros ao componente
  filho. O `name` é checado contra o schema em tempo de compilação.
- **`<Form layout="stack">`** cuida só do layout — não se acopla a form library.
- Campos BR mascarados (`PhoneInput`, `CPFInput`, `CNPJInput`, `CEPInput`,
  `MoneyInput`) entram como filhos do `FormField` sem código de máscara seu.
- `form.handleSubmit(onSubmit)` só chama o `onSubmit` quando tudo valida; lá
  dentro você chama `api.post(...)` e navega no sucesso.

➡️ **Próxima página:** [Fluxo de autenticação — juntando store, guard e cliente HTTP](auth-flow.md)
