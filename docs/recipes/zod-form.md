# Formulário com validação zod

A Loja Aurora quer que o cliente crie conta antes da primeira compra. O formulário pede
nome, e-mail, CPF, celular e senha. O CPF precisa ser **válido de verdade** (dígitos
verificadores, não só 11 números), o celular já aparece com máscara, e quando o backend
recusa ("CPF já cadastrado") a mensagem aparece **embaixo do campo certo**, não num
alerta genérico. 📝

Você escreve as regras **uma vez**, num schema zod. O tipo dos valores, as mensagens de
erro e a validação no envio saem dele. As peças são
[`useZodForm`](../forms.md#3-usezodform-tudo-em-um),
[`<FormField>`](../forms.md#exemplo-completo-schema-provider-fields-submit) e os
[inputs com máscara](../forms-br.md#inputs-com-mascara).

!!! info "Antes de começar"
    Esta receita usa o cliente `api` da receita
    [Fluxo de autenticação completo](auth-flow.md). Instalação em
    [instalação manual](../index.md#instalacao-manual). `zod` e `react-hook-form` já
    vêm como dependência do SDK.

## O que vamos construir

- ✍️ Um **cadastro** com cinco campos, validado no navegador antes de qualquer
  requisição.
- 🇧🇷 **CPF e celular mascarados** enquanto a pessoa digita, com teclado numérico no
  celular.
- ⏳ **Botão com carregamento** durante o envio.
- ❌ **Erro do servidor no campo certo**, mais um toast com o resumo.
- ✅ **Sucesso** com toast e redirecionamento para o login.

## O contrato com o backend

O backend recebe só dígitos no CPF e no telefone:

```text
POST /api/clientes
{ "name": "Ana Souza", "email": "ana@email.com", "cpf": "39053344705",
  "phone": "81987654321", "password": "••••••••" }

201 → { "id": "c_91", "name": "Ana Souza", "email": "ana@email.com" }
422 → { "detail": { "detail": "CPF já cadastrado", "field": "cpf" },
        "code": "VALIDATION_ERROR", "details": { "field": "cpf" } }
```

## O código, arquivo por arquivo

### 1. O provider de toast

O `useToast` precisa de um `<ToastProvider>` acima dele. Coloque-o uma vez, dentro do
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

### 2. A tela de cadastro

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

## Pedaço por pedaço

### Um schema, três usos

O `schema` é a única fonte das regras. Dele saem:

1. **O tipo**: `z.infer<typeof schema>` vira `SignupValues`. Você não escreve a
   interface do formulário à mão.
2. **A validação no navegador**: `useZodForm(schema, options)` embrulha o `useForm` do
   react-hook-form com o `zodResolver`. Nenhum envio sai com CPF inválido.
3. **As mensagens**: o segundo argumento de cada regra (`"CPF inválido"`) é o texto que
   aparece embaixo do campo.

`mode: "onBlur"` valida quando a pessoa sai do campo. Ela não vê "E-mail inválido" na
primeira letra digitada, e também não descobre o erro só no fim.

### `<FormField>` liga o campo ao formulário

`<FormField name="cpf">` lê o `control` do `<FormProvider>` e injeta no filho `value`,
`onChange`, `onBlur`, `error`, `label` e `required`. É o fim do
`<Controller render={...} />` repetido em cada campo. O `name` é checado contra o tipo
do schema: `name="cfp"` não compila.

### As máscaras brasileiras

`CPFInput` e `PhoneInput` aplicam a máscara enquanto a pessoa digita e abrem o teclado
numérico no celular (`inputMode="numeric"` e `"tel"`). O valor no formulário fica
**mascarado** (`390.533.447-05`), por isso:

- `validateCPF` aceita o valor com ou sem máscara e confere os dígitos verificadores;
- `unmask` tira tudo que não é dígito antes do envio.

!!! tip "`phone` com `min(14)`"
    `(81) 3456-7890` tem 14 caracteres e `(81) 98765-4321` tem 15. O `min(14)` aceita
    fixo e celular. Para exigir celular, troque a regra por
    `.refine((value) => unmask(value).length === 11, "Informe um celular")`. A
    formatação de celular fora do input está em
    [Forms BR](../forms-br.md#campo-so-de-celular-formatphone-mobile-true).

### O erro do servidor volta para o campo

O navegador não sabe que o CPF já está cadastrado. Só o backend sabe, e o
`tempest-fastapi-sdk` diz **qual campo** falhou. O `createApiClient` lê isso e entrega
em `err.fields`:

```ts
const fields: Record<string, string> = { cpf: "CPF já cadastrado" };
```

O laço chama `form.setError` para cada par, e a frase aparece embaixo do input do CPF,
igual a um erro do zod. Veja
[o campo culpado](../integration-fastapi.md#o-campo-culpado-que-o-backend-nomeia-e-o-front-costumava-jogar-fora).

!!! note "Por que o toast não repete a frase"
    Quando `err.fields` está preenchido, `describeApiError` devolve a frase de
    validação ("Confira os campos destacados e tente de novo."). A frase específica já
    está no campo. Falha de rede ou 500 viram o texto do segundo argumento.

### Os estados da tela

- **Editando**: erros aparecem ao sair de cada campo.
- **Enviando**: `form.formState.isSubmitting` liga o `loading` do botão, que bloqueia o
  duplo clique.
- **Erro**: campos destacados + `toast.error`.
- **Sucesso**: `toast.success` e `navigate("/login", { replace: true })`.

### E no celular? 📱

O `Form` com `layout="stack"` empilha um campo por linha em qualquer largura, e o
`fullWidth` deixa o botão do tamanho do polegar. `autoComplete` certo em cada campo
deixa o navegador preencher nome, e-mail e telefone com um toque. O
`<ToastProvider position="top-center">` evita que o toast cubra o teclado.

??? tip "Quer o endereço também?"
    CEP com busca no ViaCEP, UF e cidade são assunto da receita
    [Cadastro BR + checkout](br-signup-checkout.md). Os validadores e o hook `useViaCEP`
    estão em [Forms BR](../forms-br.md#viacep).

## Recap

- ✅ Um schema zod gera o tipo, a validação e as mensagens.
- ✅ `useZodForm` + `<FormProvider>` + `<FormField>` ligam tudo sem `Controller` à mão.
- ✅ `CPFInput`, `PhoneInput`, `validateCPF` e `unmask` cuidam do Brasil.
- ✅ `err.fields` + `form.setError` põem o erro do backend no campo certo.
- ✅ `useToast` fecha o fluxo com sucesso ou falha.
