# Passkeys (WebAuthn)

Login sem senha, com a biometria que o usuário já usa pra desbloquear o aparelho.

O SDK cobre **a metade do cliente**: as duas cerimônias (`navigator.credentials.create` e `.get`), a conversão base64url ↔ `ArrayBuffer` que todo mundo reimplementa errado, os sondadores de capacidade e a classificação de erro. A outra metade é o seu backend — e esta página diz exatamente o que ele precisa mandar e receber, porque um cliente WebAuthn que documenta só o próprio lado é inútil.

!!! info "Por que passkey e não senha"
    A chave privada nunca sai do aparelho, então não existe base de senhas pra vazar, nem phishing que funcione: o navegador só assina para o domínio que registrou a credencial. Pro usuário é um toque no sensor.

## A superfície

| Símbolo | Para quê |
| --- | --- |
| `createPasskeyClient` | Cliente sem framework: `register` + `authenticate` + sondadores |
| `usePasskeyRegistration` | Hook do fluxo "criar passkey" |
| `usePasskeySignIn` | Hook do fluxo "entrar com passkey", com autofill opcional |
| `usePasskeyCapabilities` | Só os três sondadores, quando você quer decidir a UI antes |
| `isPasskeySupported` | O navegador tem WebAuthn |
| `isPlatformAuthenticatorAvailable` | **Este aparelho** tem Face ID / Hello / digital |
| `isConditionalMediationAvailable` | O autofill de passkey está disponível |
| `classifyPasskeyError` / `PasskeyError` | Erro com `kind` no qual a UI faz `switch` |
| `base64UrlToBytes` / `bytesToBase64Url` | O encanamento, exposto porque você vai precisar |

## Comece pelo hook

Dois botões, dois hooks. Este é o cadastro, na tela de conta:

```tsx
import { usePasskeyRegistration } from "tempest-react-sdk";

import { api } from "../lib/api";

export function CriarPasskey() {
  const passkey = usePasskeyRegistration({
    getOptions: () => api.post("/api/webauthn/register/begin"),
    verify: (credential) =>
      api.post("/api/webauthn/register/finish", { body: credential }),
  });

  if (passkey.platformAvailable === null) return null;

  if (passkey.error?.kind === "already-registered") {
    return <p>Este aparelho já tem uma passkey da sua conta. 👍</p>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void passkey.register()}
        disabled={passkey.status === "prompting" || passkey.status === "verifying"}
      >
        {passkey.status === "prompting" ? "Confirme no aparelho…" : "Criar passkey"}
      </button>
      {passkey.error && <p role="alert">{passkey.error.message}</p>}
      {passkey.status === "success" && <p>Passkey criada. ✅</p>}
    </>
  );
}
```

Peça por peça:

- **`getOptions`** é a sua rota `begin`. O servidor sorteia o desafio e devolve as opções.
- **`verify`** é a sua rota `finish`. Recebe o JSON que o SDK serializou.
- **`platformAvailable === null`** significa "ainda não sei" — o sondador é assíncrono. Não renderize nada de passkey nesse estado.
- **`register()` resolve, nunca rejeita.** Toda falha já é estado (`status`, `error.kind`) que a UI precisa desenhar; obrigar um `try/catch` num handler de botão só duplicaria o que o hook guarda.

!!! warning "`platformAvailable === false` não é "sem passkey""
    Significa "sem autenticador embutido **aqui**". O usuário ainda pode usar o celular por QR/hybrid. Ofereça como "usar meu celular", não como um toque.

## O login, e o autofill que faz a diferença

```tsx
import { usePasskeySignIn } from "tempest-react-sdk";

import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";

export function LoginForm() {
  const passkey = usePasskeySignIn<{ access_token: string }>({
    conditional: true,
    getOptions: () => api.post("/api/webauthn/signin/begin"),
    verify: (assertion) =>
      api.post<{ access_token: string }>("/api/webauthn/signin/finish", {
        body: assertion,
      }),
    onSuccess: ({ access_token }) => useAuthStore.getState().setToken(access_token),
  });

  return (
    <form>
      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" autoComplete="username webauthn" />

      <button type="button" onClick={() => void passkey.signIn()}>
        Entrar com passkey
      </button>
      {passkey.error && <p role="alert">{passkey.error.message}</p>}
    </form>
  );
}
```

`conditional: true` liga o fluxo de **autofill**: nenhum modal aparece; o navegador lista as passkeys **dentro do campo de e-mail**. O usuário toca em uma e está dentro, sem digitar nada.

!!! danger "`autocomplete="username webauthn"` não é opcional"
    Sem esse atributo no input, a lista **nunca** aparece — e não há erro nenhum, o pedido só fica pendurado. O hook não pode fazer essa parte por você: quem sabe qual campo é o de identificação é a sua tela.

Duas outras regras do modo condicional:

- **Um por página.** Um segundo pedido condicional simultâneo derruba o primeiro.
- **Abortar não é erro.** Se o usuário digitar a senha em vez de escolher a passkey, ou a tela desmontar, o pedido é abortado e o hook **não** marca erro — nada falhou, a pessoa escolheu outra porta.

## Os erros, e o que fazer com cada um

`error.kind` é o que a UI olha. `error.message` é texto em inglês, seguro de mostrar, mas o normal é você escrever a sua cópia por `kind`:

| `kind` | Causa | O que a UI faz |
| --- | --- | --- |
| `cancelled` | `NotAllowedError` | Nada de vermelho. Volte ao estado inicial |
| `already-registered` | `InvalidStateError` | **Sucesso disfarçado**: "já configurado neste aparelho" |
| `rp-mismatch` | `SecurityError` | Bug seu: `rp.id` não bate com a origem |
| `not-supported` | `NotSupportedError` | Nenhum autenticador aceita os algoritmos pedidos |
| `invalid-options` | `TypeError` | O `begin` mandou base64url quebrado |
| `insecure` | Página em HTTP | Sirva por HTTPS |
| `unsupported` | Navegador sem WebAuthn | Esconda a opção |
| `aborted` | Seu `signal` abortou | Silencie |
| `unknown` | O resto | Log + mensagem genérica |

!!! danger "`cancelled` é "cancelou **ou** expirou" — e é impossível saber qual"
    `NotAllowedError` cobre os dois casos **por design**: dizer ao site "essa conta não tem credencial aqui" vazaria a existência da conta. Trate como um só evento e nunca escreva "você cancelou" com certeza.

!!! tip "`rp-mismatch` é o erro de integração nº 1"
    `rp.id` tem que ser o domínio da página ou um **pai registrável** dele. `app.acme.com` pode usar `acme.com`; `acme.com` **não** pode usar `app.acme.com`. Em `localhost` deixe `rp.id` de fora.

## Sem React: `createPasskeyClient`

Os hooks são uma casca. O cliente é o que faz o trabalho, e serve num formulário puro, num worker ou num teste:

```ts
import { createPasskeyClient } from "tempest-react-sdk";

const passkeys = createPasskeyClient({ rpId: "acme.com", timeoutMs: 60_000 });

const options = await fetch("/api/webauthn/signin/begin", { method: "POST" }).then((r) =>
  r.json(),
);
const assertion = await passkeys.authenticate(options);
await fetch("/api/webauthn/signin/finish", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(assertion),
});
```

`rpId` e `timeoutMs` são só **defaults**: o que vier do servidor sempre ganha.

??? info "Injetando um `credentials` falso (testes)"
    `createPasskeyClient({ credentials })` aceita qualquer objeto com `create` e `get` — a interface `CredentialsContainerLike`. É assim que o próprio SDK testa as cerimônias, já que o jsdom não tem `navigator.credentials`.

## O que o seu backend precisa implementar

Quatro rotas. O SDK não fala com nenhuma delas por conta própria: você passa `getOptions` e `verify`.

### 1. `POST /webauthn/register/begin` → opções

Devolva um `PasskeyCreationOptionsJSON`. Todo campo binário é **base64url**:

```json
{
  "challenge": "9WVvY2..._Q",
  "rp": { "name": "Acme", "id": "acme.com" },
  "user": { "id": "dXNlci0x", "name": "ada@acme.com", "displayName": "Ada Lovelace" },
  "pubKeyCredParams": [{ "type": "public-key", "alg": -7 }],
  "excludeCredentials": [{ "id": "AQID", "type": "public-key" }],
  "authenticatorSelection": { "residentKey": "required", "userVerification": "preferred" }
}
```

- `challenge`: ≥16 bytes aleatórios, **guardados na sessão**, uso único.
- `user.id`: identificador opaco e estável. **Nunca** o e-mail — ele muda e fica gravado no autenticador.
- `excludeCredentials`: as credenciais que o usuário já tem. É o que faz o autenticador responder `InvalidStateError` (→ `already-registered`) em vez de criar uma duplicada.
- `pubKeyCredParams` pode ser omitido: o SDK oferece `-8` (Ed25519), `-7` (ES256) e `-257` (RS256).
- `residentKey: "required"` é o que torna a passkey **descobrível** — pré-requisito do login sem digitar nada.

### 2. `POST /webauthn/register/finish` ← credencial

Recebe um `PasskeyRegistrationJSON`. No servidor:

1. Decodifique `response.clientDataJSON` e confira `type === "webauthn.create"`, o `challenge` guardado e o `origin`.
2. Parseie `response.attestationObject`, extraia a chave pública e o contador de assinatura.
3. Grave `id`, chave pública, contador e `response.transports` (ajuda o login depois).

### 3. `POST /webauthn/signin/begin` → opções

Um `PasskeyRequestOptionsJSON` com um desafio novo. **Omita `allowCredentials`** para login sem identificação prévia e para o autofill — é o que deixa o navegador oferecer qualquer passkey do domínio.

### 4. `POST /webauthn/signin/finish` ← assertion

Recebe um `PasskeyAuthenticationJSON`:

1. Ache a credencial por `id` (ou por `response.userHandle`, que vem preenchido em credencial descobrível).
2. Confira o `clientDataJSON` como no passo 2, agora com `type === "webauthn.get"`.
3. Verifique `response.signature` sobre `authenticatorData || sha256(clientDataJSON)` com a chave pública guardada.
4. **Rejeite contador que não cresceu** — indica credencial clonada.
5. Só então emita o token de sessão.

!!! tip "Do lado do FastAPI"
    Uma biblioteca de servidor (`py_webauthn`, por exemplo) faz os passos 1–4. O que ela **não** faz é o que está nesta página: guardar o desafio na sessão, escolher o `user.id` e montar o `excludeCredentials`.

## Resumo

- **`createPasskeyClient`** — duas cerimônias, encanamento base64url, um tipo de erro. Sem framework.
- **`usePasskeyRegistration` / `usePasskeySignIn`** — estado (`status`, `error`, `data`) + a ação. Resolvem `null` em falha.
- **`isPlatformAuthenticatorAvailable()`** decide se o botão aparece; `platformAvailable === null` é "ainda não sei".
- **`conditional: true` + `autocomplete="username webauthn"`** é o login de um toque. O atributo é obrigatório.
- **`kind: "already-registered"` é sucesso**, `"cancelled"` é ambíguo por design, `"rp-mismatch"` é bug seu.
- O servidor faz 4 rotas; o cliente não inventa nenhuma delas.

### Veja também

- [Auth](./auth.md) — onde guardar o token que o `finish` devolveu
- [HTTP](./http.md) — o `api` dos exemplos
- [Access Control (RBAC)](./access-control.md) — o que a sessão pode fazer depois
