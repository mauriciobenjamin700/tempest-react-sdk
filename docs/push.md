# Web Push + Service Worker

Notificações push no navegador têm duas metades que conversam: a **main thread** (sua UI pede permissão e cria a inscrição) e a **worker thread** (o service worker recebe o push e desenha a notificação, mesmo com a aba fechada). O módulo `push` do `tempest-react-sdk` cobre as duas metades — a parte browser (permissão, `pushManager.subscribe`, `notificationclick`) é do SDK; os endpoints de persistência e o envio do push são do seu app, via callbacks.

> Diagrama editável: [push-flow.drawio](./diagrams/push-flow.drawio) (abra no [draw.io](https://app.diagrams.net)).

## Como o Web Push funciona (visão de 30 segundos)

1. O app pede **permissão** ao usuário (`Notification.requestPermission()`).
2. Concedida a permissão, o navegador cria uma **`PushSubscription`** assinada com a sua chave **VAPID pública**.
3. O app envia o JSON da inscrição ao **seu backend**, que o guarda.
4. Mais tarde, o backend usa a chave **VAPID privada** para mandar um push pro endpoint da inscrição.
5. O **service worker** acorda no evento `push`, lê o payload e chama `showNotification`.

O SDK te dá os passos 1–3 (e os handlers do passo 5); os passos 3 (storage) e 4 (envio) são responsabilidade do backend.

!!! info "O que é VAPID, em uma frase"
    VAPID (_Voluntary Application Server Identification_) é um par de chaves
    (pública + privada) que identifica o seu servidor para o push service do
    navegador. A **pública** vai no front (`VITE_VAPID_PUBLIC_KEY`); a
    **privada** fica só no backend e nunca é exposta. Gere o par uma vez com
    `npx web-push generate-vapid-keys`.

## Pré-requisitos

1. Backend que armazena `PushSubscriptionJSON` e envia notificações via web-push (VAPID).
2. Service worker registrado (`vite-plugin-pwa`, `registerServiceWorker`, ou `navigator.serviceWorker.register`).
3. Variável `VITE_VAPID_PUBLIC_KEY` no front (chave pública VAPID URL-safe base64).

!!! warning "O hook NÃO registra o service worker"
    `usePushSubscription` assume que o SW já está registrado e usa
    `navigator.serviceWorker.ready` por padrão. Registre o SW você mesmo (passo
    abaixo) — ou passe `getRegistration` para reusar uma registration própria.
    Sem SW registrado, o `subscribe()` nunca resolve.

## Main-thread

### Registrar o SW

```ts
import { registerServiceWorker, skipWaiting } from "tempest-react-sdk";

registerServiceWorker({
  url: "/sw.js",
  onUpdate: (waiting) => {
    if (confirm("Nova versão disponível. Recarregar?")) {
      skipWaiting(waiting);
      window.location.reload();
    }
  },
});
```

### Inscrever o usuário (com o hook)

```tsx
import { usePushSubscription, Button } from "tempest-react-sdk";

const push = usePushSubscription({
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
  onSubscribe: (sub) => api.post("/webpush/subscribe", { body: sub }),
  onUnsubscribe: () => api.delete("/webpush/my"),
});

<Button loading={push.loading} onClick={() => push.subscribe()}>
  {push.subscribed ? "Desinscrever" : "Receber notificações"}
</Button>;
```

O hook expõe `supported`, `permission`, `subscribed`, `loading`, `error`, `subscribe()`, `unsubscribe()` e `refresh()`. Versão imperativa: `WebPushClient`. Erros tipados: `WebPushUnsupportedError`, `WebPushPermissionDeniedError`.

### Fluxo de permissão e inscrição (exemplo completo)

Este componente mostra o estado completo do ciclo de vida — não suportado, permissão negada, inscrito, alternar — e trata o erro de permissão negada:

```tsx
import { usePushSubscription, WebPushPermissionDeniedError, Button } from "tempest-react-sdk";
import { api } from "./api";

export function PushToggle() {
  const push = usePushSubscription({
    vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
    onSubscribe: (sub) => api.post("/webpush/subscribe", { body: sub }),
    onUnsubscribe: () => api.delete("/webpush/my"),
  });

  // 1. Browser sem suporte (iOS Safari fora de PWA, navegadores antigos)
  if (!push.supported) {
    return <p>Notificações não são suportadas neste navegador.</p>;
  }

  // 2. Usuário bloqueou nas configurações do navegador
  if (push.permission === "denied") {
    return <p>Permissão de notificação bloqueada. Libere nas configurações do navegador.</p>;
  }

  async function handleSubscribe() {
    try {
      await push.subscribe();
    } catch (err) {
      if (err instanceof WebPushPermissionDeniedError) {
        alert("Você precisa permitir notificações para recebê-las.");
      }
    }
  }

  // 3. Alternar inscrição
  return (
    <Button
      loading={push.loading}
      onClick={() => (push.subscribed ? push.unsubscribe() : handleSubscribe())}
    >
      {push.subscribed ? "Desinscrever" : "Receber notificações"}
    </Button>
  );
}
```

### Versão imperativa — `WebPushClient`

Quando você precisa do fluxo fora do React (um botão vanilla, um setup script), use a classe direto:

```ts
import { WebPushClient } from "tempest-react-sdk";

const client = new WebPushClient({
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
  onSubscribe: (sub) => fetch("/webpush/subscribe", { method: "POST", body: JSON.stringify(sub) }),
});

if (WebPushClient.isSupported()) {
  await client.subscribe(); // pede permissão + cria inscrição + chama onSubscribe
}
```

## Worker-thread (`sw.ts`)

Dentro do **seu** service worker, importe os handlers do subpath `tempest-react-sdk/sw`:

```ts
/// <reference lib="webworker" />
import {
  installPushHandler,
  installNotificationClickHandler,
  installSkipWaitingListener,
} from "tempest-react-sdk/sw";

installSkipWaitingListener();

installPushHandler({
  defaultTitle: "Tempest",
  defaultIcon: "/icons/Logo.png",
  transform: (payload) => (payload.tag === "silent-ping" ? null : payload),
});

installNotificationClickHandler();
```

!!! tip "Importe de `tempest-react-sdk/sw`, não do barrel raiz"
    Os helpers de worker têm um subpath dedicado: `tempest-react-sdk/sw`. Ele é
    **puro e sem React** — importar daí mantém o bundle do seu `sw.ts` minúsculo
    (~1 KB) e impede que o grafo de componentes do SDK vaze pro escopo do worker.
    Importar do barrel raiz (`tempest-react-sdk`) também funciona graças ao
    tree-shaking, mas o subpath é a forma à prova de bala. É exatamente o que o
    [`create-tempest-app --pwa`](./scaffold.md#modo-pwa-pwa) gera.

`installPushHandler` tenta `event.data.json()` e cai pra `event.data.text()`. Use `transform` pra suprimir (`null`) ou enriquecer notificações.

`installNotificationClickHandler` foca o client existente quando a URL bate, ou abre nova janela.

!!! tip "Cache offline mora no mesmo módulo"
    `tempest-react-sdk/sw` também exporta `installPrecache` (app shell offline) e
    `installRuntimeCache` (caching por rota: cache-first / network-first /
    stale-while-revalidate). Junto com o plugin `tempestPwaManifest()` de
    `tempest-react-sdk/vite`, dão paridade com o `vite-plugin-pwa` no caso comum
    — sem dependência nova. É o que o
    [`create-tempest-app --pwa`](./scaffold.md#modo-pwa-pwa) já cabeia.

!!! tip "`urlBase64ToUint8Array` e `isPushSupported` são exportados"
    Você raramente os chama na mão — `WebPushClient` já usa os dois internamente
    (`applicationServerKey` exige `Uint8Array`, não a string base64). Eles estão
    no barrel para quem precisa de uma checagem de suporte fora do hook
    (`isPushSupported()`) ou de um fluxo de inscrição 100% customizado.

## Compatibilidade

- iOS Safari só funciona quando o app é instalado como PWA (Add to Home Screen).
- `usePushSubscription` expõe `supported` — esconda o toggle quando `false`.

## Resumo

- **VAPID**: pública no front, privada só no backend. Gere uma vez com `web-push`.
- **Você registra o SW**; o hook só assina/desassina sobre uma registration pronta.
- **`usePushSubscription`** dá todo o estado (`supported`/`permission`/`subscribed`/`loading`/`error`) + ações; **`WebPushClient`** é a versão imperativa.
- **Handlers do worker** (`installPushHandler`/`installNotificationClickHandler`/`installSkipWaitingListener`) vão dentro do _seu_ `sw.ts`.
- **iOS** só recebe push em PWA instalado — esconda o toggle quando `!supported`.

### Veja também

- [HTTP](./http.md) — transporte das inscrições para o backend
- Diagrama: [push-flow.drawio](./diagrams/push-flow.drawio)
