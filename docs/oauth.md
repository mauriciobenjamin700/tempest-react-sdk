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

Quando o fluxo é **redirect** (o provider volta pra `/callback?code=…&state=…`) em vez de popup, você precisa trocar esse código por uma sessão — exatamente uma vez, e **levando o `state` junto**.

Com o backend no [`tempest-fastapi-sdk`](integration-fastapi.md), o fluxo é este:

1. Um link aponta para `GET /auth/oauth/google/login` (navegação, não `fetch`). O backend sorteia o `state`, grava num cookie `HttpOnly` e redireciona pro Google.
2. O Google devolve o usuário pra rota de callback do seu app com `?code=…&state=…`.
3. O app repassa `code` **e** `state` para `GET /auth/oauth/google/callback`. O backend compara o `state` com o cookie (`hmac.compare_digest`, uso único, expira em `AUTH_OAUTH_STATE_TTL_SECONDS`), troca o `code` e devolve o mesmo par JWT do `POST /auth/login`.

O passo 3 é o `exchangeOAuthCallback`:

```tsx
import {
  ErrorState,
  Spinner,
  createApiClient,
  exchangeOAuthCallback,
  useNavigate,
  useOAuthCallback,
} from "tempest-react-sdk";

const api = createApiClient({ baseURL: import.meta.env.VITE_API_URL });

interface LoginResponse {
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
}

export function OAuthCallbackPage() {
  const navigate = useNavigate();

  const { loading, error } = useOAuthCallback<LoginResponse>({
    exchange: () => exchangeOAuthCallback<LoginResponse>(api, "google"),
    onSuccess: () => navigate("/dashboard", { replace: true }),
    onError: () => navigate("/login?error=oauth", { replace: true }),
  });

  if (loading) return <Spinner />;
  if (error) return <ErrorState description="Não foi possível concluir o login." />;
  return null;
}
```

Resultado: enquanto a troca está em voo aparece o spinner; ao resolver, o hook chama `onSuccess` e você redireciona; se estourar, `onError` manda pro login com a flag de erro.

O que `exchangeOAuthCallback(api, provider, options?)` faz por você:

- Lê `code` e `state` com `readOAuthCallbackParams` e **lança `OAuthCallbackError` antes de qualquer requisição** quando o provider mandou `error` (`reason: "provider_error"`), quando falta o `state` (`"missing_state"`) ou o `code` (`"missing_code"`).
- Envia os dois para `{prefix}/oauth/{provider}/callback` com `credentials: "include"` — o cookie do `state` é a outra metade da comparação.
- Usa `skipAuth` e `retry: false`: ainda não há sessão, um `401` ali é callback forjado ou expirado (não token a renovar), e o backend apaga o cookie do `state` na primeira tentativa.

| Opção    | Default                  | Para que serve                                               |
| -------- | ------------------------ | ------------------------------------------------------------ |
| `prefix` | `"/auth"`                | O `prefix` passado ao `make_auth_router` no backend.         |
| `search` | `window.location.search` | De onde ler o redirect do provider.                          |
| `signal` | —                        | Aborta a troca.                                              |

!!! danger "Por que o `state` não pode ficar pra trás"
    Sem ele, um atacante manda a vítima para `/callback?code=<code da conta dele>` e a vítima fica logada na conta do atacante (login CSRF) — tudo o que ela digitar depois vai pra lá. A receita antiga lia só o `code`, então nenhum backend tinha como conferir o `state`. Agora o leitor devolve os dois ou lança.

!!! note "Backend que não é o `tempest-fastapi-sdk`"
    Use `readOAuthCallbackParams()` dentro do seu `exchange` e mande `code` **e** `state` para a sua rota. A comparação do `state` com o valor amarrado ao navegador que iniciou o fluxo é do backend: o navegador não lê um cookie `HttpOnly`, então uma checagem no cliente não provaria nada.

!!! check "Roda uma vez, mesmo em StrictMode"
    Em desenvolvimento o React 18/19 monta cada componente duas vezes de propósito. Sem guarda, `exchange` dispararia duas trocas e o segundo falharia — código OAuth é de uso único. O hook usa um `ref` pra garantir uma execução só, então você não vê o erro fantasma "code already redeemed" em dev.

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
import {
  createApiClient,
  createAuthStore,
  exchangeOAuthCallback,
  useNavigate,
  useOAuthCallback,
} from "tempest-react-sdk";

interface User {
  id: string;
}

interface LoginResponse {
  user_id: string;
  access_token: string;
}

const useAuthStore = createAuthStore<User>();
const api = createApiClient({ baseURL: import.meta.env.VITE_API_URL });

export function useGoogleCallback() {
  const navigate = useNavigate();
  return useOAuthCallback<LoginResponse>({
    exchange: () => exchangeOAuthCallback<LoginResponse>(api, "google"),
    onSuccess: ({ user_id, access_token }) => {
      useAuthStore.getState().setSession({ user: { id: user_id }, token: access_token });
      navigate("/dashboard", { replace: true });
    },
  });
}
```

## Recapitulando

- `@react-oauth/google` é dependência do **seu** app; o SDK só recebe o `GoogleLogin` pela prop `component`.
- `<GoogleSignIn>` normaliza sucesso e erro — `onSuccess` só roda com `idToken` presente.
- One Tap vem **ligado**; desligue com `disableOneTap` onde não faz sentido.
- Validar o `idToken` é trabalho do backend, sempre.
- `useOAuthCallback` roda a troca uma vez só (à prova de StrictMode) e devolve `loading`/`data`/`error`/`status`.
- `exchangeOAuthCallback` leva `code` **e** `state` ao callback do backend; sem `state`, recusa antes de enviar.
- Casa com [`auth`](auth.md) pra gravar a sessão e com [`routing`](routing.md) pra redirecionar.
