# Assíncrono: promise, await, fetch

!!! tip "Pule esta página se você já sabe…"

    - o que uma Promise representa e quais são os três estados dela;
    - por que `console.log` mostra o dado e a tela mostra vazio;
    - que `fetch` **não** rejeita em 404 ou 500;
    - a diferença entre `await` em série e `Promise.all`.

## O problema

Este código imprime `undefined`, e é o erro assíncrono mais comum que existe:

```js
function buscarUsuario() {
    let usuario;
    fetch("/api/user")
        .then((r) => r.json())
        .then((dados) => {
            usuario = dados;
        });
    return usuario; // ← executa AGORA; o fetch termina depois
}

console.log(buscarUsuario()); // undefined
```

O `return` não espera. A função inteira roda até o fim, devolve `undefined`, e só
**depois** — milissegundos ou segundos — a resposta chega e escreve numa variável
que ninguém mais lê.

O conserto não é esperar melhor. É **devolver a promessa**:

```js
async function buscarUsuario() {
    const resposta = await fetch("/api/user");
    return resposta.json();
}

console.log(await buscarUsuario()); // o objeto
```

## O que é uma Promise

Um objeto que representa **um valor que ainda não existe**. Três estados, e a
transição é definitiva:

- `pending` — em andamento
- `fulfilled` — terminou com um valor
- `rejected` — terminou com um erro

`await` pausa a função até a promise sair de `pending`, e entrega o valor (ou lança
o erro). `async` marca a função como "devolve uma promise" — é o que permite usar
`await` dentro dela.

## Um exemplo completo

Arquivo único, com um endpoint público de verdade. Abra no browser:

```html
<!doctype html>
<html lang="pt-BR">
    <head>
        <meta charset="utf-8" />
        <title>Assíncrono</title>
    </head>
    <body>
        <button type="button" id="carregar">Carregar</button>
        <pre id="saida">clique para carregar</pre>

        <script type="module">
            const saida = document.querySelector("#saida");

            async function carregarPost(id) {
                const resposta = await fetch(`https://jsonplaceholder.typicode.com/posts/${id}`);

                if (!resposta.ok) {
                    throw new Error(`HTTP ${resposta.status}`);
                }

                return resposta.json();
            }

            document.querySelector("#carregar").addEventListener("click", async () => {
                saida.textContent = "carregando…";
                try {
                    const post = await carregarPost(1);
                    saida.textContent = post.title;
                } catch (erro) {
                    saida.textContent = `falhou: ${erro.message}`;
                } finally {
                    console.log("terminou, com sucesso ou não");
                }
            });
        </script>
    </body>
</html>
```

### O `if (!resposta.ok)` não é opcional

Esta é a armadilha número um do `fetch`:

!!! danger "`fetch` só rejeita se a rede falhar"

    404, 401, 500 — todos chegam como promise **resolvida**. Sem o
    `if (!resposta.ok)`, você chama `.json()` numa página de erro, e o sintoma
    aparece como um `SyntaxError` de parse, longe da causa. `resposta.ok` é `true`
    só para status 200–299.

## Série e paralelo

Dois `await` seguidos rodam **em série** — o segundo só começa quando o primeiro
termina:

```js
const usuario = await buscarUsuario(); // 300ms
const pedidos = await buscarPedidos(); // 300ms
// total: 600ms
```

Se não há dependência entre eles, dispare os dois e espere junto:

```js
const [usuario, pedidos] = await Promise.all([buscarUsuario(), buscarPedidos()]);
// total: 300ms
```

| Combinador             | Quando usar                                                         |
| ---------------------- | ------------------------------------------------------------------- |
| `Promise.all`          | Precisa de todos. Rejeita no primeiro erro.                          |
| `Promise.allSettled`   | Quer o resultado de todos, sucesso ou falha.                         |
| `Promise.race`         | O primeiro que terminar. É como se implementa timeout na mão.        |
| `Promise.any`          | O primeiro que **der certo**.                                        |

## Cancelamento: `AbortController`

Uma requisição que ninguém mais quer continua consumindo rede e, pior, ainda
escreve no estado quando volta:

```js
const controlador = new AbortController();
fetch("/api/lento", { signal: controlador.signal });
controlador.abort(); // a promise rejeita com um erro de nome "AbortError"
```

Em React esse é o conteúdo da função de limpeza de um efeito que busca dados: sem
cancelar, o componente desmontado ainda recebe a resposta.

## Onde isso aparece no SDK

Você raramente escreve `fetch` num app com o SDK. O `createApiClient` já faz o
`resposta.ok`, o parse, o token, o timeout e o erro tipado:

```ts
import { createApiClient, isApiError } from "tempest-react-sdk";

export const api = createApiClient({
    baseURL: import.meta.env.VITE_API_URL,
    getToken: () => useAuthStore.getState().token,
});

try {
    const usuarios = await api.get<Usuario[]>("/users", { params: { ativo: true } });
} catch (erro) {
    if (isApiError(erro) && erro.status === 403) {
        // erro.detail, erro.code, erro.requestId — tipados
    }
}
```

Qualquer resposta fora de 2xx vira um `TempestApiError` com `status`, `detail`,
`code` e `requestId` — o oposto do `fetch` cru, onde o 500 passa direto.

Para um caso pontual em componente, o `useAsync` dá os três estados prontos:

```tsx
import { useAsync } from "tempest-react-sdk";

function PerfilUsuario({ id }: { id: string }) {
    const { data, status, error, run } = useAsync(() => api.get<Usuario>(`/users/${id}`), [id], {
        immediate: true,
    });

    if (status === "pending") return <p>carregando…</p>;
    if (status === "error") return <p>falhou: {String(error)}</p>;
    return <p>{data?.nome}</p>;
}
```

!!! info "Lista vazia é sucesso, não erro"

    `GET /users?ativo=true` sem nenhum resultado responde **200 com `[]`**, não 404.
    404 é para "esse recurso único não existe", e é o que distingue "a rota não
    existe" de "a busca não achou nada". No cliente isso significa que estado vazio
    é um `if (lista.length === 0)`, não um `catch` — a convenção está em
    [HTTP](../http.md).

## Recap

- Promise é um valor futuro em três estados; `await` espera e `async` marca a
  função que devolve uma. ✅
- Retornar de dentro de um `.then` para fora da função **não funciona** — devolva a
  promise.
- `fetch` **não** rejeita em 404/500: sem `if (!resposta.ok)` você faz parse de uma
  página de erro.
- `await` em sequência é série; use `Promise.all` quando não há dependência.
- `AbortController` cancela — é o corpo da limpeza de um efeito que busca dados.
- No SDK, `createApiClient` cobre ok/parse/token/timeout e lança `TempestApiError`
  tipado; `useAsync` entrega os três estados prontos.

📚 **Referência canônica:** [MDN — Assincronia](https://developer.mozilla.org/pt-BR/docs/Learn/JavaScript/Asynchronous)

➡️ **Próxima página:** [Módulos, npm e o bundler](js-modules.md)
