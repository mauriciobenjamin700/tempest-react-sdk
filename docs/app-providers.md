# AppProviders

Todo app React precisa de um punhado de _providers_ no topo da árvore: cache de
dados, tema, internacionalização, captura de erros. `<AppProviders>` reúne todos
eles em **um único bloco declarativo** — você diz o que quer ligado e como
configurar, e o SDK monta a pirâmide na ordem certa pra você. 🚀

## O problema: a pirâmide de providers

Sem o `<AppProviders>`, a raiz da sua aplicação costuma virar uma pirâmide
aninhada à mão. Você precisa lembrar **quais** providers existem, **a ordem**
certa de aninhamento e repetir isso em todo projeto:

```tsx
// App.tsx — montagem manual (o que queremos evitar)
import {
  ErrorBoundary,
  QueryProvider,
  ThemeProvider,
  I18nProvider,
  AppRouter,
} from "tempest-react-sdk";
import { routes } from "@/routes";

export function App() {
  return (
    <ErrorBoundary fallback={<p>Something went wrong.</p>}>
      <QueryProvider>
        <ThemeProvider>
          <I18nProvider locale="pt-BR" messages={messages}>
            <AppRouter routes={routes} fallback={<p>Loading…</p>} />
          </I18nProvider>
        </ThemeProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}
```

Funciona, mas é frágil: a ordem importa (o `ErrorBoundary` precisa ficar por
fora pra capturar erros dos providers internos), o aninhamento cresce em
diagonal e cada app reescreve a mesma estrutura.

!!! note "Os providers continuam existindo isolados"

    `QueryProvider`, `ThemeProvider`, `I18nProvider` e `ErrorBoundary` seguem
    exportados individualmente — use-os direto quando precisar de controle fino.
    O `<AppProviders>` é só a conveniência que conecta os quatro pra você.

## A solução: um bloco só

```tsx
// App.tsx
import { AppProviders, AppRouter } from "tempest-react-sdk";
import { routes } from "@/routes";

export function App() {
  return (
    <AppProviders errorBoundary={{ fallback: <p>Something went wrong.</p> }}>
      <AppRouter routes={routes} fallback={<p>Loading…</p>} />
    </AppProviders>
  );
}
```

É isso. O `<AppProviders>` aninha tudo de fora pra dentro nesta ordem:

```text
ErrorBoundary → QueryProvider → ThemeProvider → I18nProvider → children
```

Repare que **Query e Theme já vêm ligados** com os defaults do SDK — você não
precisou configurar nada. Só pedimos o `errorBoundary` porque ele é opcional
(veja abaixo).

!!! tip "Onde o `<AppProviders>` mora"

    Os providers ficam **por fora** do roteamento; o `<AppRouter>` (e portanto
    todas as suas rotas) fica **por dentro**. Assim cada página tem acesso a
    cache, tema e i18n, e qualquer erro de renderização de qualquer rota cai no
    `ErrorBoundary`. Veja a página de roteamento pra detalhes do `<AppRouter>`.

## O que vem ligado por padrão vs. opt-in

| Prop            | Estado padrão      | Como ligar / configurar                  |
| --------------- | ------------------ | ---------------------------------------- |
| `query`         | **Ligado**         | Já ativo. Passe um objeto pra ajustar.   |
| `theme`         | **Ligado**         | Já ativo. Passe um objeto pra ajustar.   |
| `i18n`          | Desligado (opt-in) | Passe `{ locale, messages }` pra montar. |
| `errorBoundary` | Desligado (opt-in) | Passe `{ fallback }` pra montar.         |

- **`query`** e **`theme`** já estão ativos com os defaults do SDK — o caso
  comum (você quer cache de dados e tema) não exige nenhuma configuração.
- **`i18n`** e **`errorBoundary`** só entram na árvore quando você passa a prop
  correspondente. Omitiu? O provider simplesmente não é montado.

!!! info "Defaults de query"

    Quando ligado por padrão, o `QueryProvider` usa: `staleTime` de 5 minutos,
    `gcTime` de 30 minutos, `retry: 1` e `refetchOnWindowFocus: false`.

## Desligando um padrão com `false`

Às vezes o app já monta o seu próprio `QueryClient`, ou você não quer o tema do
SDK. Passe `false` na prop pra **remover aquele provider** da árvore:

```tsx
// query e theme desligados — o app monta os seus por fora
import { AppProviders } from "tempest-react-sdk";

export function App() {
  return (
    <AppProviders query={false} theme={false}>
      <YourOwnProviders />
    </AppProviders>
  );
}
```

!!! warning "`false` remove o provider — não o desativa silenciosamente"

    Com `query={false}`, nenhum `QueryClient` é montado pelo `<AppProviders>`.
    Se algum componente filho usar `useQuery`, ele precisa de um provider montado
    por você mais acima na árvore — senão o React Query lança erro em runtime.

## Ajustando cada provider

Cada prop aceita um objeto com as mesmas opções do provider isolado (menos
`children`, que o `<AppProviders>` controla).

### Query

```tsx
import { AppProviders } from "tempest-react-sdk";

<AppProviders query={{ defaultOptions: { queries: { retry: 3 } } }}>
  <App />
</AppProviders>;
```

Você também pode passar um `client` (`QueryClient`) já configurado em vez de
`defaultOptions`.

### Theme

```tsx
import { AppProviders } from "tempest-react-sdk";

<AppProviders theme={{ defaultTheme: "dark", storageKey: "my-app-theme" }}>
  <App />
</AppProviders>;
```

### i18n

```tsx
import { AppProviders } from "tempest-react-sdk";

const messages = {
  "pt-BR": { hello: "Olá" },
  "en-US": { hello: "Hello" },
};

<AppProviders i18n={{ locale: "pt-BR", messages, fallbackLocale: "en-US" }}>
  <App />
</AppProviders>;
```

`i18n` aceita `locale`, `messages`, e opcionalmente `fallbackLocale` e
`storageKey`.

## A fallback do ErrorBoundary

A prop `errorBoundary` aceita `fallback` em duas formas: um `ReactNode` fixo, ou
uma **função de render** que recebe `{ error, reset }` — útil pra mostrar a
mensagem do erro e oferecer um botão de "tentar de novo":

```tsx
import { AppProviders } from "tempest-react-sdk";

<AppProviders
  errorBoundary={{
    fallback: ({ error, reset }) => <button onClick={reset}>{error.message}</button>,
  }}
>
  <App />
</AppProviders>;
```

Além de `fallback`, você pode passar `onError` (callback ao capturar) e
`resetKeys` (valores que, ao mudarem, resetam o boundary automaticamente).

## Exemplo completo: todas as props juntas

Aqui está tudo em ação — query ajustada, tema desligado, i18n montado e
error boundary com função de render:

```tsx
import { AppProviders } from "tempest-react-sdk";

const messages = {
  "pt-BR": { hello: "Olá" },
  "en-US": { hello: "Hello" },
};

export function Root() {
  return (
    <AppProviders
      query={{ defaultOptions: { queries: { retry: 3 } } }}
      theme={false}
      i18n={{ locale: "pt-BR", messages }}
      errorBoundary={{
        fallback: ({ error, reset }) => <button onClick={reset}>{error.message}</button>,
      }}
    >
      <App />
    </AppProviders>
  );
}
```

## Recap

- `<AppProviders>` substitui a pirâmide manual de providers por **um bloco
  declarativo**, aninhando de fora pra dentro: `ErrorBoundary → QueryProvider →
ThemeProvider → I18nProvider → children`. ✅
- **`query` e `theme` vêm ligados** com os defaults do SDK; **`i18n` e
  `errorBoundary` são opt-in** — só montam quando você passa a prop.
- Passe `false` em `query` ou `theme` pra **remover** aquele provider (quando o
  app monta o seu próprio).
- Passe um **objeto** em qualquer prop pra ajustar o provider correspondente.
- A `fallback` do error boundary pode ser um `ReactNode` ou uma **função** que
  recebe `{ error, reset }`.
- Coloque o `<AppProviders>` **por fora** do `<AppRouter>`: providers fora,
  rotas dentro. 💡
