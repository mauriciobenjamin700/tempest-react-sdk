# Web Push + Service Worker

End-to-end de notificações push. O SDK lida com a parte browser (permissão, `pushManager.subscribe`, `notificationclick`); o app fornece os endpoints via callbacks.

> Diagrama editável: [push-flow.drawio](./diagrams/push-flow.drawio) (abra no [draw.io](https://app.diagrams.net)).

## Pré-requisitos

1. Backend que armazena `PushSubscriptionJSON` e envia notificações via web-push (VAPID).
2. Service worker registrado (`vite-plugin-pwa`, `registerServiceWorker`, ou `navigator.serviceWorker.register`).
3. Variável `VITE_VAPID_PUBLIC_KEY` no front (chave pública VAPID URL-safe base64).

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

### Inscrever o usuário

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

Versão imperativa: `WebPushClient`. Erros tipados: `WebPushUnsupportedError`, `WebPushPermissionDeniedError`.

## Worker-thread (`sw.ts`)

Dentro do **seu** service worker, importe os handlers:

```ts
/// <reference lib="webworker" />
import {
  installPushHandler,
  installNotificationClickHandler,
  installSkipWaitingListener,
} from "tempest-react-sdk";

installSkipWaitingListener();

installPushHandler({
  defaultTitle: "Tempest",
  defaultIcon: "/icons/Logo.png",
  transform: (payload) => (payload.tag === "silent-ping" ? null : payload),
});

installNotificationClickHandler();
```

`installPushHandler` tenta `event.data.json()` e cai pra `event.data.text()`. Use `transform` pra suprimir ou enriquecer notificações.

`installNotificationClickHandler` foca o client existente quando a URL bate, ou abre nova janela.

## Compatibilidade

- iOS Safari só funciona quando o app é instalado como PWA (Add to Home Screen).
- `usePushSubscription` expõe `supported` — esconda o toggle quando `false`.

## Veja também

- [HTTP](./http.md) — transporte das inscrições
- Diagrama: [push-flow.drawio](./diagrams/push-flow.drawio)
