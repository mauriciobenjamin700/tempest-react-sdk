# JavaScript: valor, referência, escopo

!!! tip "Pule esta página se você já sabe…"

    - que `{} === {}` é `false`, e por quê;
    - que `const` congela a ligação, não o conteúdo;
    - o que uma closure captura;
    - por que um objeto inline numa prop faz o `useEffect` rodar de novo.

## O problema

Este `useEffect` roda em **loop infinito**, e o código parece impecável:

```jsx
function Lista({ status }) {
    const filtro = { status, ordem: "desc" };

    useEffect(() => {
        buscar(filtro);
    }, [filtro]); // ← roda a cada render, sempre

    return null;
}
```

O array de dependência compara com `Object.is`, que para objetos é comparação de
**referência**. `filtro` é um objeto novo a cada render, então nunca é "o mesmo", e
o efeito dispara — que causa um render — que cria outro objeto — que dispara o
efeito.

Sem entender valor vs. referência, `useMemo`, `useCallback` e `React.memo` viram
superstição: você copia o padrão sem saber o que ele evita. Essa página é sobre
isso.

## Valor e referência

JavaScript tem dois grupos de tipos:

- **Primitivos** — `number`, `string`, `boolean`, `null`, `undefined`, `symbol`,
  `bigint`. Copiados **por valor**.
- **Objetos** — `{}`, `[]`, `function`, `Date`, `Map`. Copiados **por referência**
  (a variável guarda um endereço, não o conteúdo).

Rode isto no console do browser:

```js
const a = 1;
const b = a;
console.log(a === b); // true — mesmo valor

const x = { n: 1 };
const y = { n: 1 };
console.log(x === y); // false — conteúdo igual, endereços diferentes

const z = x;
console.log(x === z); // true — mesmo endereço
z.n = 2;
console.log(x.n); // 2 — z e x são o MESMO objeto
```

A terceira linha é a que quebra o `useEffect`: dois objetos com o mesmo conteúdo
**não** são iguais para o `===`.

!!! warning "`const` não é imutabilidade"

    ```js
    const config = { debug: false };
    config.debug = true; // ✅ permitido — o conteúdo mudou
    config = {}; // ❌ TypeError — a ligação não pode ser reatribuída
    ```

    `const` proíbe apontar para outro objeto. Ele não diz nada sobre o objeto.
    Para congelar o conteúdo existe `Object.freeze`, e ele é raso.

## Cópia rasa e cópia profunda

O spread copia **um nível**:

```js
const original = { nome: "Ana", endereco: { cidade: "Recife" } };
const copia = { ...original };

copia.nome = "Bia";
console.log(original.nome); // "Ana" — nível de cima copiado ✅

copia.endereco.cidade = "Olinda";
console.log(original.endereco.cidade); // "Olinda" — o objeto aninhado é o MESMO ⚠️
```

Para cópia profunda de dado serializável, o browser moderno tem
`structuredClone(original)`.

## Escopo e closure

Uma função "lembra" as variáveis do lugar onde foi **escrita**, não de onde foi
chamada. Isso é uma closure:

```js
function criarContador() {
    let n = 0;
    return {
        incrementar: () => ++n,
        ler: () => n,
    };
}

const c = criarContador();
c.incrementar();
c.incrementar();
console.log(c.ler()); // 2 — `n` sobreviveu ao fim de criarContador()
```

Em React isso vira a **closure obsoleta** (*stale closure*): um `setTimeout` ou um
listener criado num render captura os valores **daquele** render, e se você não o
recriar, ele continua enxergando o passado.

```js
useEffect(() => {
    const id = setInterval(() => {
        console.log(contador); // sempre o valor do render em que o efeito rodou
    }, 1000);
    return () => clearInterval(id);
}, []); // array vazio: o efeito nunca é recriado
```

!!! info "Toda função de limpeza existe por causa disto"

    O `return () => clearInterval(id)` não é boa educação: sem ele, cada render que
    recrie o efeito deixa um intervalo vivo capturando um passado diferente. Isso é
    um vazamento **e** um bug de lógica ao mesmo tempo.

## Igualdade: `===`, `Object.is` e igualdade profunda

| Comparação           | O que faz                                                                     |
| -------------------- | ----------------------------------------------------------------------------- |
| `==`                 | Converte tipos antes de comparar. Não use.                                     |
| `===`                | Compara valor (primitivos) ou referência (objetos).                            |
| `Object.is`          | Como `===`, mas `NaN` é igual a `NaN` e `+0` difere de `-0`. É o que o React usa. |
| Igualdade profunda   | Percorre a estrutura comparando folha a folha. Não existe nativa — é código.   |

## Onde isso aparece no SDK

O conserto do exemplo de abertura é fixar a referência:

```tsx
import { useMemo, useEffect } from "react";

function Lista({ status }: { status: string }) {
    const filtro = useMemo(() => ({ status, ordem: "desc" }), [status]);

    useEffect(() => {
        buscar(filtro);
    }, [filtro]); // ✅ só quando `status` muda de verdade
}
```

Mas nem sempre a referência é sua para memoizar — quando o objeto **vem de fora**,
por prop ou de uma resposta HTTP, você não tem onde pôr o `useMemo`. Para esse caso
o SDK exporta o `useDeepMemo`:

```tsx
import { useEffect } from "react";
import { useDeepMemo } from "tempest-react-sdk";

function Relatorio({ filtros }: { filtros: { status: string; tags: string[] } }) {
    const estaveis = useDeepMemo(filtros);

    useEffect(() => {
        buscar(estaveis);
    }, [estaveis]); // só dispara quando o CONTEÚDO muda
}
```

Ele guarda o último valor e só troca a referência quando a comparação profunda
acusa diferença. O pai pode recriar o objeto a cada render à vontade — o filho só
reage quando o dado mudou.

!!! tip "Escolha por origem do objeto"

    Objeto que **você** cria no componente → `useMemo`, mais barato. Objeto que
    **chega** pronto e você não controla → `useDeepMemo`. A comparação profunda não
    é grátis: use quando a alternativa é refazer trabalho maior.

Lista completa dos hooks utilitários em [Hooks](../hooks.md).

## Recap

- Primitivo copia valor; objeto, array e função copiam **referência**. `{} === {}`
  é `false`. ✅
- `const` congela a ligação, não o conteúdo.
- Spread copia um nível só; para o resto existe `structuredClone`.
- Closure captura o **lugar onde a função foi escrita** — daí a stale closure e a
  necessidade da função de limpeza.
- O array de dependência do React compara com `Object.is`: objeto inline dispara
  sempre.
- `useMemo` para o objeto que você cria; `useDeepMemo` do SDK para o que chega de
  fora.

📚 **Referência canônica:** [MDN — JavaScript](https://developer.mozilla.org/pt-BR/docs/Web/JavaScript)

➡️ **Próxima página:** [Assíncrono: promise, await, fetch](js-async.md)
