# OAuth (Google)

O módulo `oauth` cobre as **duas pontas** de um login social: o botão que o usuário clica (`<GoogleSignIn>`) e a rota de callback que troca a credencial do provider por uma sessão da sua API (`useOAuthCallback`).

!!! info "Por que envolver o `@react-oauth/google`?"
    Duas dores. Primeiro, o payload de sucesso do Google vem como `{ credential?: string }` — opcional, então todo call site precisa checar se veio vazio, e o `onError` não recebe argumento nenhum. Segundo, se o SDK declarasse `@react-oauth/google` como peer dep, **todo** app que instala `tempest-react-sdk` pagaria por ele, inclusive os que não têm login social. O wrapper resolve os dois: normaliza sucesso/erro em `OAuthCredential`/`OAuthError`, e você passa o `GoogleLogin` pela prop `component`.

## Instale o SDK do Google

O `@react-oauth/google` é do **seu app**, não do SDK:

```bash
npm install @react-oauth/google
```

## O botão: `<GoogleSignIn>`

Programa completo, copiável:

```tsx
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { GoogleSignIn } from "tempest-react-sdk";

export function LoginPage() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <GoogleSignIn
        component={GoogleLogin}
        locale="pt-BR"
        text="continue_with"
        onSuccess={async ({ idToken }) => {
          await fetch("/api/auth/google", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id_token: idToken }),
          });
        }}
        onError={(error) => console.error(error.message)}
      />
    </GoogleOAuthProvider>
  );
}
```

Peça por peça:

1. `GoogleOAuthProvider` (do `@react-oauth/google`) carrega o script do Google e injeta o `clientId`. Ele fica **em volta**, normalmente no topo da árvore ou só na página de login.
2. `component={GoogleLogin}` é a injeção de dependência — é assim que o SDK renderiza o botão oficial do Google sem depender dele.
3. `onSuccess` recebe um `OAuthCredential` já validado: se o Google devolver resposta sem `credential`, o wrapper chama `onError` e **não** chama `onSuccess`. Você nunca lida com `idToken` vazio.
4. `onError` recebe um `OAuthError` com `provider` e `message` preenchidos.

### Props

| Prop            | Tipo                                         | Descrição                                                                 |
| --------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| `component`     | `(props) => ReactNode`                       | **Obrigatório.** O `GoogleLogin` importado pelo seu app.                  |
| `onSuccess`     | `(c: OAuthCredential) => void \| Promise`    | **Obrigatório.** Recebe `{ idToken, provider, raw }`.                     |
| `onError`       | `(e: OAuthError) => void`                    | Erro normalizado (inclui o caso "veio sem credential").                   |
| `locale`        | `string`                                     | Idioma do botão (ex.: `"pt-BR"`). Default: locale do browser.             |
| `theme`         | `"filled_blue" \| "filled_black" \| "outline"` | Tema visual repassado ao Google.                                        |
| `text`          | `"signin_with" \| "signup_with" \| "continue_with" \| "signin"` | Texto do botão.                                       |
| `shape`         | `"rectangular" \| "pill" \| "circle" \| "square"` | Forma do botão.                                                     |
| `size`          | `"large" \| "medium" \| "small"`             | Tamanho.                                                                  |
| `disableOneTap` | `boolean`                                    | Desliga o auto-prompt "One Tap". Default `false` (One Tap **ligado**).     |
| `width`         | `number`                                     | Largura em px — o botão do Google é fixo por padrão.                      |
| `className`     | `string`                                     | Aplicada no wrapper.                                                      |
| `style`         | `CSSProperties`                              | Aplicado no wrapper.                                                      |

!!! warning "One Tap vem ligado"
    `disableOneTap` tem default `false`, ou seja o SDK passa `useOneTap: true` pro Google. Se você não quer o prompt automático aparecendo sozinho no canto da tela (comum em telas que não são de login), passe `disableOneTap`.

### O que chega no `onSuccess` / `onError`

```ts
interface OAuthCredential {
  idToken: string; // JWT do provider — manda pro seu backend validar
  provider: string; // "google"
  raw?: unknown; // resposta crua do SDK do provider
}

interface OAuthError {
  provider: string;
  code?: string;
  message: string;
  raw?: unknown;
}
```

!!! danger "Nunca confie no `idToken` no cliente"
    O `idToken` é um JWT assinado pelo Google, mas quem **valida a assinatura** tem que ser o seu backend (via as chaves públicas do Google), conferindo `aud` (seu `clientId`) e `iss`. Decodificar no cliente com `decodeJWT` serve pra UI (mostrar nome/foto), nunca pra autorizar.

## A rota de callback: `useOAuthCallback`

Quando o fluxo é **redirect** (o provider volta pra `/callback?code=…`) em vez de popup, você precisa trocar esse código por uma sessão — exatamente uma vez.

```tsx
import { useNavigate } from "tempest-react-sdk";
import { ErrorState, Spinner, useOAuthCallback } from "tempest-react-sdk";

interface Session {
  token: string;
  user: { id: string; name: string };
}

export function OAuthCallbackPage() {
  const navigate = useNavigate();

  const { loading, error } = useOAuthCallback<Session>({
    exchange: async () => {
      const code = new URLSearchParams(window.location.search).get("code");
      if (!code) throw new Error("missing code");
      const response = await fetch("/api/auth/google/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) throw new Error("exchange failed");
      return (await response.json()) as Session;
    },
    onSuccess: () => navigate("/dashboard", { replace: true }),
    onError: () => navigate("/login?error=oauth", { replace: true }),
  });

  if (loading) return <Spinner />;
  if (error) return <ErrorState description="Não foi possível concluir o login." />;
  return null;
}
```

Resultado: enquanto o POST está em voo aparece o spinner; ao resolver, o hook chama `onSuccess` e você redireciona; se estourar, `onError` manda pro login com a flag de erro.

!!! check "Roda uma vez, mesmo em StrictMode"
    Em desenvolvimento o React 18/19 monta cada componente duas vezes de propósito. Sem guarda, `exchange` dispararia dois POSTs e o segundo falharia — código OAuth é de uso único. O hook usa um `ref` pra garantir uma execução só, então você não vê o erro fantasma "code already redeemed" em dev.

### Retorno

| Campo     | Tipo                                  | Significado                            |
| --------- | ------------------------------------- | -------------------------------------- |
| `loading` | `boolean`                             | `true` enquanto `exchange` está pendente |
| `data`    | `T \| null`                           | Valor resolvido, quando deu certo      |
| `error`   | `unknown`                             | Motivo da rejeição, quando falhou      |
| `status`  | `"pending" \| "success" \| "error"`   | Estado agregado                        |

!!! tip "`exchange` só precisa ser uma Promise"
    O hook não sabe nada de OAuth — ele só executa uma função assíncrona uma vez e expõe o estado. Serve pra qualquer troca de "callback vira sessão": magic link, SSO corporativo, confirmação de e-mail.

## Fechando o ciclo com o `auth`

O par natural é o [`createAuthStore`](auth.md): o `onSuccess` grava a sessão, e daí em diante o `AuthGuard` e o `createApiClient` já enxergam o usuário logado.

```tsx
const { loading } = useOAuthCallback<Session>({
  exchange: () => api.post<Session>("/auth/google/exchange", { body: { code } }),
  onSuccess: ({ token, user }) => {
    useAuthStore.getState().setSession({ token, user });
    navigate("/dashboard", { replace: true });
  },
});
```

## Recapitulando

- `@react-oauth/google` é dependência do **seu** app; o SDK só recebe o `GoogleLogin` pela prop `component`.
- `<GoogleSignIn>` normaliza sucesso e erro — `onSuccess` só roda com `idToken` presente.
- One Tap vem **ligado**; desligue com `disableOneTap` onde não faz sentido.
- Validar o `idToken` é trabalho do backend, sempre.
- `useOAuthCallback` roda a troca uma vez só (à prova de StrictMode) e devolve `loading`/`data`/`error`/`status`.
- Casa com [`auth`](auth.md) pra gravar a sessão e com [`routing`](routing.md) pra redirecionar.
