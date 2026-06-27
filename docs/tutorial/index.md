# Tutorial — Comece aqui

Bem-vindo! 🚀 Este é o **Tutorial — Guia do Usuário** do `tempest-react-sdk`. Ele é
linear: cada página ensina **um conceito**, em cima do anterior, com exemplos
completos que você pode copiar e colar. Comece nesta página e siga os links de
"próxima página" — você nunca vai ficar travado.

Ao longo do tutorial vamos construir **o mesmo app pequeno**, página a página: uma
lista de tarefas com login. Nada de teoria solta — cada conceito entra porque o
app precisa dele.

## O que é o `tempest-react-sdk`?

É o SDK de frontend da Tempest: um único pacote npm que reúne tudo que um app
React precisa repetir — roteamento, estado, cache de dados, formulários,
autenticação, tema — atrás de **uma só superfície de import**. Você importa tudo
de `"tempest-react-sdk"` e nunca precisa colar a integração na mão.

!!! info "Só `react` e `react-dom` são peer deps"

    Quando você instala o SDK, **todo o resto vem junto** automaticamente:
    `react-router-dom`, `zustand`, `@tanstack/react-query`, `zod`,
    `react-hook-form`, `dexie`, `lucide-react`. São **dependências diretas** do
    SDK. As únicas dependências que **você** precisa garantir são `react` e
    `react-dom` — porque o React exige uma única instância no app inteiro.

## Passo 1 — Crie o app com `create-tempest-app`

A CLT oficial de scaffolding **vem dentro do próprio SDK** (é o `bin` do pacote).
Num diretório vazio, rode:

```bash
npx -p tempest-react-sdk create-tempest-app my-app
cd my-app
npm install
cp .env.example .env
npm run dev
```

O `-p tempest-react-sdk` diz ao `npx` qual pacote baixar; `create-tempest-app my-app`
é o `bin` que ele executa. Abra **<http://127.0.0.1:5173>** — o app já está no ar
com providers, rotas e store de autenticação funcionando.

!!! tip "A pasta de destino precisa estar vazia"

    No modo projeto novo (`create-tempest-app my-app`), o diretório alvo **não
    pode existir** ou precisa estar **vazio**, pra não sobrescrever nada seu. Se
    você já tem um projeto, instale `tempest-react-sdk` e rode
    `npx create-tempest-app .` pra mesclar no diretório atual.

## Passo 2 — A linha mais importante: o CSS

O SDK envia seu próprio CSS (tokens de cor, tipografia, reset). O app gerado já
importa pra você em `src/main.tsx`:

```tsx
// src/main.tsx
import { createRoot } from "react-dom/client";
import "tempest-react-sdk/styles.css";
import { App } from "@/App";

createRoot(document.getElementById("root")!).render(<App />);
```

!!! warning "É `tempest-react-sdk/styles.css`, sem `/dist/`"

    O import correto é `import "tempest-react-sdk/styles.css"`. Não use
    `tempest-react-sdk/dist/styles.css` — esse caminho não é exposto pelo pacote.
    Sem essa linha, os componentes renderizam **sem estilo**.

## Passo 3 — Conheça os arquivos gerados

O projeto é enxuto de propósito: cada arquivo demonstra **um recurso** que você
vai reaproveitar no tutorial. Esta é a estrutura:

```text
my-app/
├── vite.config.ts        # createViteConfig() — config Vite pronta pro SDK
├── .env.example          # VITE_API_URL — base do cliente HTTP
└── src/
    ├── main.tsx          # createRoot + "tempest-react-sdk/styles.css" + <App/>
    ├── App.tsx           # <AppProviders> envolvendo <AppRouter/>
    ├── routes.tsx        # defineRoutes([...]) — index, login e dashboard lazy + protegido
    ├── layouts/RootLayout.tsx   # nav com <Link> + <Outlet/>
    ├── pages/Home.tsx
    ├── pages/Login.tsx
    ├── pages/Dashboard.tsx       # export default (lazy), rota protegida
    ├── stores/auth.ts            # createSelectors(createAuthStore<User>(...))
    └── lib/api.ts               # createApiClient(...) + createQueryKeys
```

Cada arquivo é uma porta de entrada pra um conceito deste tutorial:

| Arquivo              | Conceito                | Página do tutorial                 |
| -------------------- | ----------------------- | ---------------------------------- |
| `src/App.tsx`        | Providers + roteamento  | [Roteamento](routing.md)           |
| `src/routes.tsx`     | Árvore de rotas + guard | [Roteamento](routing.md)           |
| `src/stores/auth.ts` | Estado (Zustand + auth) | [Estado](state.md)                 |
| `src/lib/api.ts`     | Cliente HTTP + cache    | [Buscando dados](data-fetching.md) |

## Passo 4 — Confirme que está rodando

Com `npm run dev` ativo, abra <http://127.0.0.1:5173>. Você deve ver a página
inicial com uma `<nav>` no topo (links **Home** e **Dashboard**) e o conteúdo da
rota `/` abaixo. Clicar em **Dashboard** sem estar logado te leva pro login —
esse é o guard de rota em ação, que você vai entender em [Roteamento](routing.md).

!!! check "Pronto pra começar"

    Se o app abriu no navegador e os links de navegação trocam o conteúdo sem
    recarregar a página, sua base está perfeita. Vamos construir em cima dela. ✅

## Recap

- O `tempest-react-sdk` reúne roteamento, estado, dados, formulários e auth atrás
  de **uma só superfície de import** (`"tempest-react-sdk"`). ✅
- **Só `react` e `react-dom` são peer deps**; todo o resto (`react-router-dom`,
  `zustand`, `@tanstack/react-query`, `zod`, `react-hook-form`, ...) é dependência
  **direta** instalada junto.
- Crie o app com `npx -p tempest-react-sdk create-tempest-app my-app`, depois
  `npm install`, `cp .env.example .env` e `npm run dev`.
- A linha de CSS é `import "tempest-react-sdk/styles.css"` (**sem** `/dist/`) — sem
  ela os componentes ficam sem estilo.
- Cada arquivo gerado é a porta de entrada pra um conceito do tutorial.

➡️ **Próxima página:** [Roteamento — adicionando páginas e rotas](routing.md)
