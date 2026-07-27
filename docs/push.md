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
4. **HTTPS**, ou `localhost`. Service worker e Push API não existem em origem insegura — nem em IP de rede local (`http://192.168.0.10:5173`) enquanto você testa no celular. Pra isso, use um túnel HTTPS (`cloudflared`, `ngrok`).

!!! warning "O hook NÃO registra o service worker"
    `usePushSubscription` assume que o SW já está registrado e usa
    `navigator.serviceWorker.ready` por padrão. Registre o SW você mesmo (passo
    abaixo) — ou passe `getRegistration` para reusar uma registration própria.
    Sem SW registrado, o `subscribe()` nunca resolve.

## Adotando num app que já existe

Esta seção é pro caso mais comum: **o app já está no ar** e você vai ligar push
agora. Nada aqui exige adotar o scaffold, o `createViteConfig` ou virar PWA.

Checklist, na ordem:

1. Gerar o par VAPID e colocar a pública no front.
2. Ter um service worker servido **na raiz** (três cenários abaixo).
3. Instalar os handlers de push dentro desse SW.
4. Combinar o contrato dos dois endpoints com o backend.
5. Ligar o `usePushSubscription` num botão.
6. Amarrar `subscribe`/`unsubscribe` ao **login e logout** — o passo que quase todo mundo esquece.

### 1. Chaves VAPID

```bash
npx web-push generate-vapid-keys
```

```dotenv
# .env — só a pública vai pro front
VITE_VAPID_PUBLIC_KEY=BOxx…
```

A privada fica no backend. Trocar esse par depois **invalida todas as inscrições
existentes** — veja [rotação de chave](#rotacao-da-chave-vapid).

### 2. O service worker: três cenários

!!! danger "O arquivo do SW tem que ser servido na raiz do escopo"
    Um service worker só controla páginas **dentro do próprio caminho**: um
    `/assets/sw-abc123.js` controla `/assets/…` e mais nada — então
    `navigator.serviceWorker.ready` nunca resolve na sua home e o `subscribe()`
    fica pendurado pra sempre, sem erro no console.

    É o modo de falhar mais comum ao ligar push num app com bundler: o SW não
    pode passar pelo pipeline de assets com hash. Ele precisa sair em `/sw.js`
    (ou receber `Service-Worker-Allowed: /` no header). Confira em
    **DevTools → Application → Service workers**: o campo `Scope` tem que ser `/`.

=== "a. Não tenho service worker nenhum"

    Crie `src/sw.ts` e bunde ele **separado** do app, porque o entry do app
    passa pelo pipeline de assets e o SW não pode:

    ```ts
    /// <reference lib="webworker" />
    import {
      installNotificationClickHandler,
      installPushHandler,
      installSkipWaitingListener,
    } from "tempest-react-sdk/sw";

    declare const self: ServiceWorkerGlobalScope;

    installSkipWaitingListener();
    installPushHandler({ defaultTitle: "Minha App", defaultIcon: "/icons/logo.png" });
    installNotificationClickHandler();
    ```

    ```ts
    // vite.sw.config.ts — build só do worker, em dist/sw.js
    import { resolve } from "node:path";
    import { defineConfig } from "vite";

    export default defineConfig({
      build: {
        emptyOutDir: false, // não apaga o dist/ do app
        lib: {
          entry: resolve(__dirname, "src/sw.ts"),
          formats: ["iife"], // worker clássico, sem import/export
          name: "sw",
          fileName: () => "sw.js",
        },
        rollupOptions: { output: { entryFileNames: "sw.js", inlineDynamicImports: true } },
      },
    });
    ```

    ```json
    {
      "scripts": {
        "build": "vite build && npm run build:sw",
        "build:sw": "vite build --config vite.sw.config.ts"
      }
    }
    ```

    Registre no entry do app:

    ```ts
    // src/main.tsx
    import { registerServiceWorker } from "tempest-react-sdk";

    registerServiceWorker({ url: "/sw.js" });
    ```

    !!! tip "Sem passo de build, se você preferir"
        Um `public/sw.js` escrito na mão também funciona — arquivos de `public/`
        são copiados crus pra raiz do `dist/`. O custo é não poder `import` os
        helpers do SDK ali dentro: você escreve os listeners de `push` e
        `notificationclick` à mão. Vale pro caso simples; passando disso, bunde.

=== "b. Já uso `vite-plugin-pwa`"

    Só o modo **`injectManifest`** deixa você escrever o SW. Se o seu está em
    `generateSW` (o default), troque:

    ```ts
    // vite.config.ts
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: "auto",
    });
    ```

    E no `src/sw.ts`, junte os handlers do SDK aos seus do Workbox — eles não
    competem, são eventos diferentes (`push`/`notificationclick` de um lado,
    `fetch` do outro):

    ```ts
    /// <reference lib="webworker" />
    import { precacheAndRoute } from "workbox-precaching";
    import { installNotificationClickHandler, installPushHandler } from "tempest-react-sdk/sw";

    declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: unknown[] };

    precacheAndRoute(self.__WB_MANIFEST); // o que o plugin já fazia
    installPushHandler({ defaultTitle: "Minha App" });
    installNotificationClickHandler();
    ```

    Mantenha o registro do plugin (`virtual:pwa-register`) — **não** chame
    `registerServiceWorker` também: dois registros do mesmo arquivo brigam pelo
    ciclo de update.

=== "c. Já tenho um SW próprio"

    Duas linhas dentro do que já existe, e nada do seu código muda:

    ```ts
    import { installNotificationClickHandler, installPushHandler } from "tempest-react-sdk/sw";

    installPushHandler({ defaultTitle: "Minha App" });
    installNotificationClickHandler();
    ```

    Já tem um `addEventListener("push", …)` seu? Escolha um dos dois: os dois
    handlers rodando mostram **duas** notificações para o mesmo push, porque cada
    listener chama `showNotification`.

    Se você registra o SW por conta própria e quer reusar aquela registration em
    vez do `navigator.serviceWorker.ready`, passe `getRegistration`:

    ```ts
    const registration = await navigator.serviceWorker.register("/sw.js");

    usePushSubscription({
      vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
      getRegistration: async () => registration,
      onSubscribe: (sub) => api.post("/webpush/subscribe", { body: sub }),
    });
    ```

### 3. O contrato com o backend

O SDK não escolhe rota, verbo nem formato — ele te entrega o
`PushSubscriptionJSON` e você decide. É exatamente isto que chega no
`onSubscribe`:

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/dQw4w9Wg...",
  "expirationTime": null,
  "keys": {
    "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM=",
    "auth": "tBHItJI5svbpez7KI4CCXg=="
  }
}
```

Duas rotas resolvem o ciclo — e a **chave natural é o `endpoint`**, não o usuário:

| Rota | Quando | Corpo |
| -- | -- | -- |
| `POST /webpush/subscribe` | inscreveu (ou re-sincronizou) | o JSON acima + o usuário logado, vindo do token |
| `DELETE /webpush/subscribe` | desinscreveu | `{ "endpoint": "…" }` |

!!! warning "Um usuário tem N inscrições, uma por navegador"
    Celular, notebook do trabalho, Chrome e Firefox na mesma máquina: cada um é
    uma inscrição com endpoint próprio. Se o backend guarda **uma** inscrição por
    usuário (`UPDATE … WHERE user_id = ?`), cada novo dispositivo desliga o
    anterior em silêncio — o usuário instala no celular e para de receber no
    desktop, sem nada explicando por quê.

    Guarde uma linha por endpoint, com `UNIQUE(endpoint)` e `user_id` indexado.
    O `POST` é **upsert por endpoint**: o mesmo navegador reenviando a mesma
    inscrição (o que acontece a cada `subscribe()` — veja
    [re-sincronização](#o-que-acontece-quando-ja-existe-inscricao)) não pode
    criar linha duplicada.

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

!!! tip "Atualização automática (sem `vite-plugin-pwa`)"
    Se você prefere que cada deploy chegue sozinho ao usuário — sem prompt de "recarregar?" — ligue `autoUpdate`. O helper passa a chamar `registration.update()` num intervalo (`updateIntervalMs`, padrão 1h) e recarrega a página assim que um novo worker assume o controle (`controllerchange`), com guarda contra loop de reload. É o comportamento auto-update do `vite-plugin-pwa`, mas implementado direto sobre `navigator.serviceWorker`, sem depender dele:

    ```ts
    import { registerServiceWorker } from "tempest-react-sdk";

    registerServiceWorker({
      url: "/sw.js",
      autoUpdate: true, // poll + reload no controllerchange
      updateIntervalMs: 60 * 60 * 1000, // 1h (padrão)
      reloadOnActivate: true, // padrão; use `false` para só fazer o poll
    });
    ```

    Deixe `reloadOnActivate: false` quando quiser continuar o poll mas controlar o reload você mesmo (ex.: exibir um toast antes).

### Inscrever o usuário (com o hook)

```tsx
import { usePushSubscription, Button } from "tempest-react-sdk";

const push = usePushSubscription({
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
  onSubscribe: (sub) => api.post("/webpush/subscribe", { body: sub }),
  onUnsubscribe: (sub) => api.delete("/webpush/subscribe", { body: { endpoint: sub.endpoint } }),
});

<Button loading={push.loading} onClick={() => push.subscribe()}>
  {push.subscribed ? "Desinscrever" : "Receber notificações"}
</Button>;
```

O hook expõe `supported`, `permission`, `subscribed`, `loading`, `error`, `subscribe()`, `unsubscribe()` e `refresh()`. Versão imperativa: `WebPushClient`. Erros tipados: `WebPushUnsupportedError`, `WebPushPermissionDeniedError`.

#### O que `subscribe()` faz, passo a passo

1. `Notification.requestPermission()` — o prompt do navegador. Recusa lança `WebPushPermissionDeniedError`.
2. Pega a registration (`navigator.serviceWorker.ready`, ou o seu `getRegistration`).
3. **Se já existe inscrição neste navegador, reusa ela** e chama `onSubscribe` de novo.
4. Se não existe, cria com `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` e chama `onSubscribe`.

#### O que acontece quando já existe inscrição

O passo 3 é de propósito, e é o que faz o botão servir de **re-sincronização**:
chamar `subscribe()` num navegador que já está inscrito não cria inscrição nova —
reenvia a mesma pro seu backend. Serve pra recuperar o caso em que o banco perdeu
a linha (restore de backup, migration, troca de ambiente) e o navegador continua
inscrito: sem o reenvio, esse dispositivo ficaria inscrito no navegador e
desconhecido no servidor, ou seja, mudo pra sempre.

O preço é do lado do backend: o `POST` **precisa** ser upsert por `endpoint`. Se
for insert cego, o mesmo dispositivo vira duas linhas e o usuário recebe a mesma
notificação duas vezes.

!!! warning "`subscribed` começa `false`, sempre"
    Saber se existe inscrição exige `await pushManager.getSubscription()`, então o
    primeiro render **não pode** saber a resposta: o hook devolve `false` e corrige
    logo depois. Um botão que lê só `subscribed` pisca "Receber notificações" antes
    de virar "Desinscrever".

    Espere o estado assentar antes de decidir o rótulo — `loading` é `false` nesse
    intervalo, então use uma flag própria de "já checou":

    ```tsx
    const push = usePushSubscription({ /* … */ });
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        void push.refresh().finally(() => setChecked(true));
    }, [push.refresh]);

    if (!checked) return <Skeleton height={40} />;
    ```

!!! tip "`refresh()` é pra quando o estado muda fora do seu app"
    O usuário libera ou bloqueia notificação nas **configurações do navegador**, ou
    remove a inscrição em `chrome://settings/content/notifications`, e o seu React
    não fica sabendo — não existe evento pra isso. Chame `refresh()` quando a aba
    volta a ficar visível:

    ```tsx
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === "visible") void push.refresh();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [push.refresh]);
    ```

### Fluxo de permissão e inscrição (exemplo completo)

Este componente mostra o estado completo do ciclo de vida — não suportado, permissão negada, inscrito, alternar — e trata o erro de permissão negada:

```tsx
import { usePushSubscription, WebPushPermissionDeniedError, Button } from "tempest-react-sdk";
import { api } from "./api";

export function PushToggle() {
  const push = usePushSubscription({
    vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
    onSubscribe: (sub) => api.post("/webpush/subscribe", { body: sub }),
    onUnsubscribe: (sub) =>
      api.delete("/webpush/subscribe", { body: { endpoint: sub.endpoint } }),
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

### Desinscrever — o que quase todo mundo erra

`unsubscribe()` faz duas coisas, **nessa ordem**:

1. chama `onUnsubscribe(subscription)` — a sua rota de exclusão;
2. só então chama `subscription.unsubscribe()` no navegador.

A ordem é escolhida: se o backend falhar, a inscrição **continua** no navegador e
o `unsubscribe()` lança. É o lado seguro do erro — o oposto (apagar no navegador
primeiro) perderia o `endpoint`, e sem ele o backend nunca saberia qual linha
apagar. Ficaria mandando push pra um endpoint morto até o push service devolver
`410`.

#### Apague pelo `endpoint`, não pela sessão

```tsx
const push = usePushSubscription({
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
  onSubscribe: (sub) => api.post("/webpush/subscribe", { body: sub }),
  // ✅ o argumento é a inscrição que está saindo — use o endpoint dela
  onUnsubscribe: (sub) => api.delete("/webpush/subscribe", { body: { endpoint: sub.endpoint } }),
});
```

```tsx
// ❌ ignora o argumento: o backend só sabe "algum dispositivo deste usuário saiu"
onUnsubscribe: () => api.delete("/webpush/my"),
```

O segundo padrão só funciona se o usuário tiver **um** dispositivo. Com dois, ou
o backend apaga todos (o celular para de receber porque você desligou no desktop)
ou apaga um qualquer (e o desktop volta a receber sozinho depois). O `endpoint`
é o que identifica o dispositivo — ele está no argumento justamente pra isso.

#### Desinscrever **não** revoga a permissão

`Notification.permission` continua `"granted"` depois do `unsubscribe()`, e não
existe API pra revogar — só o usuário, nas configurações do navegador.

Consequência prática: `permission === "granted"` **não** quer dizer inscrito. Quem
decide o rótulo do botão é `subscribed`; a `permission` só serve pra saber se
ainda dá pra pedir (`"default"`) ou se está bloqueado de fora (`"denied"`). Um
segundo `subscribe()` depois de desinscrever não mostra prompt nenhum — a
permissão já está lá — e volta na hora.

#### Logout e troca de usuário

Este é o furo que aparece em produção, não em teste. A inscrição pertence ao
**navegador**, não ao usuário: se a Ana faz logout e o Bruno entra no mesmo
Chrome, o endpoint continua o mesmo — e continua amarrado à Ana no seu banco. O
Bruno passa a receber as notificações da Ana, no aparelho dele, com o app
mostrando a conta dele.

Desinscreva no logout, **antes** de jogar o token fora:

```ts
// src/stores/auth.ts — ou onde seu logout mora
import { WebPushClient } from "tempest-react-sdk";

async function logout() {
    const push = new WebPushClient({
        vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
        onSubscribe: () => {},
        onUnsubscribe: (sub) =>
            api.delete("/webpush/subscribe", { body: { endpoint: sub.endpoint } }),
    });

    // Sem token, o DELETE volta 401 e a inscrição fica órfã no banco.
    await push.unsubscribe().catch(() => {
        // Rede caiu: o backend limpa quando o push service devolver 404/410.
    });

    auth.clear();
}
```

!!! tip "Se você não quer perder a permissão conquistada"
    `unsubscribe()` no logout mantém a permissão (veja acima), então o próximo
    login só precisa de um `subscribe()` — sem prompt, instantâneo. Chame no
    sucesso do login, não numa tela de onboarding:

    ```ts
    async function onLoginSuccess() {
        if (Notification.permission === "granted") await push.subscribe();
    }
    ```

    Isso também cobre o dispositivo que ficou meses fora: um `subscribe()` por
    login re-sincroniza o endpoint com o backend sem incomodar ninguém.

!!! warning "Nunca chame `unsubscribe()` em `beforeunload`"
    Fechar a aba não é sair do app — a inscrição existe pra receber push com o
    app **fechado**. Desinscrever ali desliga o push de todo mundo que fecha a
    aba, e o `beforeunload` não espera promise: o `DELETE` provavelmente nem sai.

### Manter a inscrição viva

Uma inscrição não é eterna, e as três formas de ela morrer são silenciosas.

#### `pushsubscriptionchange`: o navegador troca por conta própria

O navegador pode invalidar e recriar a inscrição sozinho — troca de chave interna
do push service, reinstalação do app no Android, tempo. O endpoint muda, o seu
banco continua com o antigo, e o push simplesmente **para de chegar** semanas
depois de tudo funcionar.

O SDK não tem helper pra isso (o evento existe só dentro do worker e ainda tem
suporte irregular). São 15 linhas no seu `sw.ts`:

```ts
/// <reference lib="webworker" />
import { urlBase64ToUint8Array } from "tempest-react-sdk";

declare const self: ServiceWorkerGlobalScope;

const VAPID_PUBLIC_KEY = "BOxx…"; // a mesma do front

self.addEventListener("pushsubscriptionchange", (event: Event) => {
    const change = event as Event & { oldSubscription?: PushSubscription };
    event.waitUntil(
        (async () => {
            const fresh = await self.registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
            await fetch("/webpush/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    subscription: fresh.toJSON(),
                    replaces: change.oldSubscription?.endpoint ?? null,
                }),
            });
        })(),
    );
});
```

!!! note "Sem cookie de sessão, o worker precisa de outra forma de autenticar"
    O `fetch` do worker não tem o seu token em memória. Se a sua autenticação é
    por cookie `HttpOnly`, ele vai junto e resolve. Se é `Authorization: Bearer`,
    aceite essa rota pelo `replaces` (o endpoint antigo já identifica o dono) ou
    guarde o token em IndexedDB pra ler aqui.

#### `404`/`410` do push service: apague no backend

Quando o usuário revoga a permissão, limpa os dados do site ou desinstala o PWA,
você não é avisado — o próximo envio devolve `404 Not Found` ou `410 Gone`. Trate
os dois como "apague esta linha", ou a sua tabela cresce de endpoint morto e cada
envio fica mais lento:

```python
# backend (exemplo com pywebpush)
from pywebpush import WebPushException, webpush

try:
    webpush(subscription_info=sub, data=payload, vapid_private_key=KEY, vapid_claims=CLAIMS)
except WebPushException as exc:
    if exc.response is not None and exc.response.status_code in (404, 410):
        subscriptions.delete(endpoint=sub["endpoint"])
    else:
        raise
```

#### Rotação da chave VAPID

Uma inscrição é **assinada** com a chave pública que a criou. Trocar o par VAPID
invalida todas: os envios passam a falhar com `403`.

E tem uma armadilha aqui: como `subscribe()` reusa a inscrição existente, chamar
ele depois de trocar a chave **não** conserta nada — ele reenvia a inscrição
antiga, assinada com a chave velha. O caminho é desinscrever e inscrever de novo:

```ts
await push.unsubscribe(); // limpa navegador + backend
await push.subscribe(); // cria com a chave nova (sem prompt: permissão já é granted)
```

Se você precisa disso pra base inteira, versione a chave no cliente e compare com
a que criou a inscrição:

```ts
const sub = await client.getSubscription();
const current = sub?.options.applicationServerKey; // ArrayBuffer | null
const stale =
    !!current &&
    new Uint8Array(current).toString() !==
        new Uint8Array(urlBase64ToUint8Array(VAPID_PUBLIC_KEY)).toString();

if (stale) {
    await client.unsubscribe();
    await client.subscribe();
}
```

Melhor ainda: **não rotacione**. Guarde o par VAPID como segredo de longo prazo —
ele não identifica usuário nenhum, só o seu servidor.

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
    (`isPushSupported()`) ou de um fluxo de inscrição 100% customizado — inclusive
    **dentro do worker**, que é o caso do handler de
    [`pushsubscriptionchange`](#pushsubscriptionchange-o-navegador-troca-por-conta-propria).
    A conversão funciona nos dois escopos a partir da **0.28.1**; antes disso ela
    chamava `window.atob` e estourava `ReferenceError` no worker.

    `isPushSupported()` continua sendo main-thread por definição: ele checa
    `window`, então dentro do worker o resultado é sempre `false` — lá o suporte
    já está provado pelo simples fato de o worker estar rodando.

## Inbox na aplicação (`NotificationCenter`)

Um push mostra uma notificação do sistema e depois **desaparece** — no que
depende da sua UI, ele nunca existiu. O usuário que fechou o toast não tem onde
reencontrar aquilo. É a metade que falta do web push: um inbox dentro do app.

O service worker roda **fora** da página e não pode tocar em estado React. A ponte
é uma mensagem:

```ts
// src/sw.ts — dentro do seu handler de push
self.addEventListener("push", (event) => {
    const payload = event.data?.json() ?? {};
    event.waitUntil(
        (async () => {
            await self.registration.showNotification(payload.title, payload);
            const clients = await self.clients.matchAll({ includeUncontrolled: true });
            for (const client of clients) {
                client.postMessage({ type: "tempest:notification", notification: payload });
            }
        })(),
    );
});
```

E, no app, `useNotificationInbox` escuta essa mensagem por default:

```tsx
import { NotificationCenter, useNotificationInbox, Popover, Button } from "tempest-react-sdk";

export function NotificationsButton() {
    const inbox = useNotificationInbox();

    return (
        <Popover
            trigger={
                <Button variant="ghost" aria-label={`Notificações (${inbox.unreadCount} não lidas)`}>
                    🔔 {inbox.unreadCount > 0 && inbox.unreadCount}
                </Button>
            }
        >
            <NotificationCenter
                items={inbox.items}
                onMarkRead={inbox.markRead}
                onMarkAllRead={inbox.markAllRead}
                onDismiss={inbox.remove}
                onSelect={(item) => item.url && navigate(item.url)}
            />
        </Popover>
    );
}
```

### `useNotificationInbox`

| Opção                   | Tipo                                          | Default                   |
| ----------------------- | --------------------------------------------- | ------------------------- |
| `initialItems`          | `NotificationItem[]`                          | `[]`                      |
| `listenToServiceWorker` | `boolean`                                     | `true`                    |
| `messageType`           | `string`                                      | `"tempest:notification"`  |
| `limit`                 | `number`                                      | `100`                     |
| `onChange`              | `(items: NotificationItem[]) => void`         | —                         |

Retorna `{ items, unreadCount, add, markRead, markUnread, markAllRead, remove, clear }`.
Entrada: `{ id, title, body?, receivedAt, read?, url?, data? }`.

!!! info "Filtra por `type`, e isso não é detalhe"
    O canal de mensagens do service worker é **compartilhado** — um ping de
    progresso de sync ou um aviso de cache atualizado passam pelo mesmo lugar.
    Sem filtrar por `type`, tudo isso apareceria no inbox do usuário.

!!! warning "Persistência é decisão sua"
    O hook guarda a lista em memória e nada mais: onde um inbox mora (servidor,
    Dexie, `localStorage`) muda por app, e um default errado seria pior que
    nenhum. Use `onChange` pra escrever e `initialItems` pra ler de volta.

    ```tsx
    const inbox = useNotificationInbox({
        initialItems: restored,
        onChange: (items) => storage.set("inbox", items),
    });
    ```

!!! tip "`limit` existe porque um inbox alimentado por push cresce sem fim"
    Default de 100, os mais antigos caem fora. Aumente se você persiste e pagina.

### `NotificationCenter`

| Prop            | Tipo                                    | Default            |
| --------------- | --------------------------------------- | ------------------ |
| `items`         | `NotificationItem[]`                    | —                  |
| `title`         | `ReactNode` (`null` remove o cabeçalho) | `"Notificações"`   |
| `onSelect`      | `(item: NotificationItem) => void`      | —                  |
| `onMarkRead`    | `(id: string) => void`                  | —                  |
| `onMarkAllRead` | `() => void`                            | —                  |
| `onDismiss`     | `(id: string) => void`                  | —                  |
| `renderIcon`    | `(item: NotificationItem) => ReactNode` | —                  |
| `locale`        | `"pt-BR" \| "en"`                       | `"pt-BR"`          |
| `emptyState`    | `ReactNode`                             | `<EmptyState …/>`  |
| `now`           | `number` (referência dos timestamps)    | agora, no render   |

!!! note "É só o painel, não um popover"
    Monte dentro do seu `Popover`, `Drawer` ou de uma rota própria. Um componente
    que fosse dono do inbox **e** de uma estratégia de posicionamento serviria pra
    menos casos, não mais.

!!! check "Abrir é ler"
    Ativar uma notificação chama `onMarkRead` junto com `onSelect` — senão todo app
    teria que lembrar de chamar os dois, e o contador de não lidas continuaria
    contando algo que o usuário já viu.

!!! tip "Não lida não é só cor"
    A linha ganha barra à esquerda **e** fundo tingido, mais `aria-current="true"`.
    Cor sozinha não sobrevive a monocromia nem a daltonismo.

`renderIcon` casa direto com o subpath de ícones:

```tsx
import { Icon } from "tempest-react-sdk/icons";

<NotificationCenter
    items={inbox.items}
    renderIcon={(item) => <Icon name={(item.data?.icon as string) ?? "bell"} size={16} />}
/>
```

## Compatibilidade

- iOS Safari só funciona quando o app é instalado como PWA (Add to Home Screen) — e o app precisa de `manifest.json` com `display: "standalone"` pra ser instalável. Fora disso, `isPushSupported()` dá `false` no iOS **mesmo no Safari atual**: não é bug seu.
- `usePushSubscription` expõe `supported` — esconda o toggle quando `false`.
- Origem insegura (`http://` que não seja `localhost`) não tem service worker nem Push API.

## Quando não chega notificação: por onde olhar

| Sintoma | Causa provável | Onde confirmar |
| -- | -- | -- |
| `subscribe()` nunca resolve | SW não controla a página (escopo errado, ou nunca registrado) | DevTools → Application → Service workers: `Scope` tem que ser `/` e o status `activated` |
| `supported === false` no iOS | app não está instalado como PWA | Add to Home Screen e abrir pelo ícone |
| Inscreveu, backend não recebeu | `onSubscribe` falhou em silêncio | o `error` do hook; o `subscribe()` re-lança, então trate o `catch` |
| Push some semanas depois | inscrição rotacionada pelo navegador | [`pushsubscriptionchange`](#pushsubscriptionchange-o-navegador-troca-por-conta-propria) |
| Envio devolve `403` | par VAPID trocado, ou a pública do front não é o par da privada do backend | [rotação de chave](#rotacao-da-chave-vapid) |
| Envio devolve `404`/`410` | usuário revogou/limpou dados; endpoint morto | apague a linha ([acima](#404410-do-push-service-apague-no-backend)) |
| Notificação duplicada | dois handlers de `push` no SW, ou `POST` não é upsert por endpoint | o seu `sw.ts`; a tabela de inscrições |
| Usuário recebe notificação de outra conta | não desinscreveu no logout | [logout e troca de usuário](#logout-e-troca-de-usuario) |
| `ReferenceError: window is not defined` no SW | SDK anterior a 0.28.1 usando `urlBase64ToUint8Array` no worker | atualize o SDK |

## Resumo

- **VAPID**: pública no front, privada só no backend. Gere uma vez com `web-push` e **não rotacione** — trocar invalida toda inscrição existente.
- **Você registra o SW**; o hook só assina/desassina sobre uma registration pronta. O arquivo tem que ser servido em `/sw.js` — SW com hash dentro de `/assets/` não controla a sua home, e aí o `subscribe()` fica pendurado sem erro.
- **Num app que já existe**: [três cenários de SW](#2-o-service-worker-tres-cenarios) (nenhum, `vite-plugin-pwa` em `injectManifest`, SW próprio) — em nenhum deles você precisa adotar o resto do SDK.
- **A inscrição é do navegador, não do usuário**: guarde uma linha por `endpoint` (`UNIQUE`), faça upsert no `POST` e **apague pelo `endpoint`** no `DELETE`. Um usuário tem quantos dispositivos quiser.
- **Desinscreva no logout, antes de descartar o token** — senão o próximo usuário do mesmo navegador recebe as notificações do anterior. A permissão sobrevive, então o próximo login re-inscreve sem prompt.
- **`unsubscribe()` não revoga permissão**: `permission === "granted"` não significa inscrito. Quem manda no rótulo do botão é `subscribed`.
- **`subscribed` começa `false`** (a checagem é assíncrona) e `refresh()` existe pro estado que muda fora do app (configurações do navegador).
- **Inscrição morre em silêncio**: trate `pushsubscriptionchange` no worker e apague no backend em `404`/`410`.
- **`usePushSubscription`** dá todo o estado (`supported`/`permission`/`subscribed`/`loading`/`error`) + ações; **`WebPushClient`** é a versão imperativa.
- **Handlers do worker** (`installPushHandler`/`installNotificationClickHandler`/`installSkipWaitingListener`) vão dentro do _seu_ `sw.ts`.
- **iOS** só recebe push em PWA instalado — esconda o toggle quando `!supported`.
- **`useNotificationInbox` + `NotificationCenter`** fecham o ciclo: o worker faz `postMessage`, o hook guarda a lista (filtrando por `type`, com `limit`) e o painel mostra lida/não lida com ação por item. Persistência fica com o app, via `onChange`/`initialItems`.

### Veja também

- [HTTP](./http.md) — transporte das inscrições para o backend
- Diagrama: [push-flow.drawio](./diagrams/push-flow.drawio)
