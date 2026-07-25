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
    `react-router`, `zustand`, `@tanstack/react-query`, `zod`,
    `react-hook-form`, `dexie`, `lucide-react`. São **dependências diretas** do
    SDK. As únicas dependências que **você** precisa garantir são `react` e
    `react-dom` — porque o React exige uma única instância no app inteiro.

## Passo 1 — Crie o app com `create-tempest-app`

A CLI oficial de scaffolding **vem dentro do próprio SDK** (é o `bin` do pacote —
não existe um pacote separado). O caminho recomendado é **criar a pasta você
mesmo e scaffoldar dentro dela** com `.`:

```bash
mkdir my-app
cd my-app
npx -p tempest-react-sdk create-tempest-app .
npm install
cp .env.example .env
npm run dev
```

Abra **<http://127.0.0.1:5173>** — o app já está no ar com providers, rotas e
store de autenticação funcionando.

### Anatomia do comando

Esse comando parece longo, mas cada pedaço tem um papel:

| Pedaço                  | O que faz                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `npx`                   | Baixa e executa um binário **sem instalar nada global**. Ele descarta o download depois.                                      |
| `-p tempest-react-sdk`  | Diz **de qual pacote** vem o binário. Necessário porque a CLI mora dentro do SDK, e o nome dela é diferente do nome do pacote. |
| `create-tempest-app`    | O nome do `bin` dentro daquele pacote — é o que de fato roda.                                                                 |
| `.`                     | O **destino**: o diretório atual. É o modo recomendado.                                                                       |

!!! tip "Por que `.` e não `create-tempest-app my-app`?"

    Passar um nome também funciona (`create-tempest-app my-app` cria a pasta
    `my-app` e escreve dentro dela), mas o fluxo com `.` é melhor no dia a dia:

    - **Você controla a pasta e o nome.** O `name` do `package.json` sai do nome
      do diretório em que você está — nada de descobrir depois que ficou
      `my-app/my-app` porque você já estava dentro da pasta.
    - **Convive com o que já existe.** Se você já rodou `git init`, ou já tem um
      `README.md`/`LICENSE`/`.git` na pasta, o modo `.` **preserva** cada arquivo
      que já existe e lista o que pulou. O modo com nome **aborta** se a pasta
      não estiver vazia.
    - **É o mesmo comando pra pasta nova e pra projeto existente** — um fluxo só
      pra decorar.

!!! info "Rodar sem argumento = `.`"

    `npx -p tempest-react-sdk create-tempest-app` (sem nada depois) faz
    exatamente o mesmo que passar `.`: scaffold no diretório atual. A CLI **não**
    pergunta um nome de projeto.

!!! warning "`npm create tempest-app` **não** funciona"

    Não existe um pacote `create-tempest-app` publicado no npm — a CLI é o `bin`
    do `tempest-react-sdk`. Então `npm create tempest-app` falha com 404. Use
    sempre a forma com `-p`:

    ```bash
    npx -p tempest-react-sdk create-tempest-app .
    ```

    Já num projeto que **tem o SDK instalado**, o `-p` é dispensável — o `npx`
    acha o `bin` no `node_modules` local:

    ```bash
    npm install tempest-react-sdk
    npx create-tempest-app .
    ```

### Os dois modos, lado a lado

| Você digita              | Destino            | Se a pasta tem arquivos                        | Nome do projeto        |
| ------------------------ | ------------------ | ---------------------------------------------- | ---------------------- |
| `create-tempest-app .`   | diretório atual    | **preserva** os seus e reporta o que foi pulado | nome da pasta atual    |
| `create-tempest-app` (só) | diretório atual    | idem                                            | nome da pasta atual    |
| `create-tempest-app my-app` | `./my-app`      | **aborta** se existir e não estiver vazia       | `my-app`               |

!!! tip "Quer um PWA?"

    Some `--pwa` em qualquer um dos modos
    (`npx -p tempest-react-sdk create-tempest-app . --pwa`) e o scaffold sai com
    service worker, manifest e wiring de web push. Detalhes em
    [Scaffold](../scaffold.md) e [PWA](../pwa.md).

### Fixando a versão do SDK

O app gerado nasce com a dependência `tempest-react-sdk` **carimbada na mesma
versão da CLI que rodou o scaffold**. Pra escolher essa versão, ponha o `@` no
`-p`:

```bash
npx -p tempest-react-sdk@0.23.0 create-tempest-app .
```

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

## Se algo deu errado

| Sintoma                                                            | Causa                                                                | O que fazer                                                                                    |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `404 Not Found - create-tempest-app`                               | Você usou `npm create tempest-app` — esse pacote não existe no npm.  | Use `npx -p tempest-react-sdk create-tempest-app .`                                             |
| `✗ Directory "my-app" exists and is not empty.`                    | Modo pasta-nova com pasta já populada.                               | `cd my-app && npx -p tempest-react-sdk create-tempest-app .` — o modo `.` preserva seus arquivos. |
| `Skipped N existing file(s)`                                       | Não é erro: a CLI **não sobrescreveu** arquivos seus.                | Confira a lista; se quiser a versão do template, remova o arquivo e rode de novo.               |
| Componentes aparecem sem estilo                                    | Falta o import do CSS.                                               | `import "tempest-react-sdk/styles.css"` em `src/main.tsx` (**sem** `/dist/`).                    |
| Erro de sintaxe/engine ao rodar o `npx`                            | Node antigo.                                                         | O SDK exige **Node >= 20.19**. Confira com `node -v`.                                           |
| `VITE_API_URL` undefined em runtime                                | Faltou o `.env`.                                                     | `cp .env.example .env` e ajuste a URL do backend.                                               |

## Recap

- O `tempest-react-sdk` reúne roteamento, estado, dados, formulários e auth atrás
  de **uma só superfície de import** (`"tempest-react-sdk"`). ✅
- **Só `react` e `react-dom` são peer deps**; todo o resto (`react-router`,
  `zustand`, `@tanstack/react-query`, `zod`, `react-hook-form`, ...) é dependência
  **direta** instalada junto.
- Crie o app com `mkdir my-app && cd my-app`, depois
  `npx -p tempest-react-sdk create-tempest-app .` — o `.` scaffolda no diretório
  atual, preserva o que já existe e tira o nome do projeto da pasta. Em seguida
  `npm install`, `cp .env.example .env` e `npm run dev`.
- `npm create tempest-app` **não** existe; a CLI é o `bin` do SDK, então a forma
  correta tem `-p tempest-react-sdk` (ou nenhum `-p`, se o SDK já está instalado
  no projeto).
- A linha de CSS é `import "tempest-react-sdk/styles.css"` (**sem** `/dist/`) — sem
  ela os componentes ficam sem estilo.
- Cada arquivo gerado é a porta de entrada pra um conceito do tutorial.

➡️ **Próxima página:** [Roteamento — adicionando páginas e rotas](routing.md)
