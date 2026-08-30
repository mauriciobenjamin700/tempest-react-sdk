# React: componente, estado, efeito

!!! tip "Pule esta página se você já sabe…"

    - que um componente é uma função que devolve JSX;
    - a diferença entre prop e estado;
    - as duas regras dos hooks, e por que elas existem;
    - o que a `key` faz numa lista, e quando ela força uma remontagem.

## O problema

Sem React, manter a tela em sincronia com o dado é trabalho manual e o bug é sempre
o mesmo — mudou o dado em um lugar, esqueceu de atualizar a tela em outro:

```js
let contador = 0;

document.querySelector("#mais").addEventListener("click", () => {
    contador++;
    document.querySelector("#valor").textContent = contador; // ← e nos outros 4 lugares?
});
```

React inverte: você descreve **como a tela deve parecer para um dado estado**, e
quando o estado muda ele recalcula a descrição e aplica só a diferença no DOM. Você
nunca escreve `textContent`.

## Um componente completo

Um app inteiro em um arquivo. É o modelo mental que o [Tutorial](../tutorial/index.md)
assume a partir da página um:

```tsx
import { useState, useEffect } from "react";

interface Tarefa {
    id: string;
    titulo: string;
    feita: boolean;
}

function ItemTarefa({ tarefa, onAlternar }: { tarefa: Tarefa; onAlternar: (id: string) => void }) {
    return (
        <li>
            <label>
                <input type="checkbox" checked={tarefa.feita} onChange={() => onAlternar(tarefa.id)} />
                {tarefa.titulo}
            </label>
        </li>
    );
}

export function ListaTarefas() {
    const [tarefas, setTarefas] = useState<Tarefa[]>([]);
    const [rascunho, setRascunho] = useState("");

    useEffect(() => {
        document.title = `${tarefas.filter((t) => !t.feita).length} pendentes`;
    }, [tarefas]);

    function adicionar() {
        if (!rascunho.trim()) return;
        setTarefas((atual) => [...atual, { id: crypto.randomUUID(), titulo: rascunho, feita: false }]);
        setRascunho("");
    }

    function alternar(id: string) {
        setTarefas((atual) => atual.map((t) => (t.id === id ? { ...t, feita: !t.feita } : t)));
    }

    return (
        <section>
            <h1>Tarefas</h1>

            <input value={rascunho} onChange={(e) => setRascunho(e.target.value)} />
            <button type="button" onClick={adicionar}>
                Adicionar
            </button>

            <ul>
                {tarefas.map((tarefa) => (
                    <ItemTarefa key={tarefa.id} tarefa={tarefa} onAlternar={alternar} />
                ))}
            </ul>
        </section>
    );
}
```

## Pedaço por pedaço

### JSX é uma expressão

`<li>...</li>` não é string nem HTML: é açúcar sintático para uma chamada de função
que devolve um objeto descrevendo o elemento. Por isso `className` no lugar de
`class` (`class` é palavra reservada em JS) e `htmlFor` no lugar de `for`, e por isso
`{expressão}` interpola JavaScript de verdade.

### Prop entra, estado mora

- **Prop** é o argumento da função-componente. Vem do pai e é **somente leitura**.
- **Estado** é o valor que o componente guarda entre renders. Muda com o `set`, e
  mudar dispara um novo render.

`ItemTarefa` não tem estado nenhum: ele recebe `tarefa` e `onAlternar` e desenha. Um
componente assim é trivial de testar e de reusar.

### Estado é imutável — sempre um valor novo

```tsx
setTarefas((atual) => [...atual, nova]); // ✅ array novo
tarefas.push(nova); // ❌ React não vê mudança nenhuma
```

React compara com `Object.is` ([valor vs. referência](js.md)). Mutar o array não
troca a referência, então o render não acontece. E use a **forma de função**
(`atual => ...`) quando o próximo valor depende do anterior: ela lê o valor no
momento da aplicação, não o do render em que a closure foi criada.

### Efeito é para sair do React

`useEffect` roda **depois** da renderização, e serve para sincronizar com algo de
fora: título do documento, listener, timer, requisição. O array de dependência diz
quando repetir.

```tsx
useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id); // limpeza: roda antes de repetir e no desmonte
}, [tick]);
```

!!! warning "Efeito não é para derivar dado"

    Se um valor pode ser **calculado** do estado que você já tem, calcule na hora do
    render — não guarde num segundo estado sincronizado por efeito. Um estado
    derivado é uma cópia que pode ficar velha, e o efeito que a mantém é um render a
    mais.

    ```tsx
    const pendentes = tarefas.filter((t) => !t.feita).length; // ✅ derivado no render
    ```

### As duas regras dos hooks

1. **Só no topo.** Nunca dentro de `if`, laço ou função aninhada.
2. **Só de dentro de React.** De um componente (`PascalCase`) ou de outro hook
   (nome começando com `use`).

O motivo da primeira é que o React identifica cada hook pela **ordem de chamada**,
não por nome. Um `useState` atrás de um `if` muda a ordem entre renders, e o estado
do hook 2 chega no hook 3.

A segunda é o que o ESLint consegue verificar: a regra `react-hooks/rules-of-hooks`
só aceita hook dentro de função `PascalCase` ou com nome `use*`. Uma função auxiliar
chamada `verificarPermissao` que chame um hook **reprova no lint do seu app**,
mesmo funcionando.

### `key`: identidade, não índice

Numa lista, a `key` diz ao React **qual item é qual** entre um render e o próximo.
Com `key={tarefa.id}`, remover o primeiro item remove o primeiro nó. Com
`key={indice}`, o React acha que todos os itens mudaram de conteúdo — e o estado
interno de cada linha (o foco, o texto digitado) escorrega para a linha vizinha.

!!! info "Key diferente força remontagem — e isso é uma ferramenta"

    Quando a `key` de um elemento muda, o React **desmonta** o antigo e monta um
    novo, com estado zerado. É a forma idiomática de dizer "isto agora é outra
    coisa": `<Perfil key={usuarioId} />` garante que trocar de usuário não deixa o
    estado do anterior na tela.

## Onde isso aparece no SDK

O `tempest-react-sdk` é feito das duas metades desta página: **componentes**, que
você compõe, e **hooks**, que trazem comportamento.

```tsx
import { AppProviders, Button, Input, useDebounce } from "tempest-react-sdk";
import { useState } from "react";

export function Busca() {
    const [texto, setTexto] = useState("");
    const textoDebounced = useDebounce(texto, 300);

    return (
        <AppProviders>
            <Input label="Buscar" value={texto} onChange={(e) => setTexto(e.target.value)} />
            <Button onClick={() => console.log(textoDebounced)}>Buscar</Button>
        </AppProviders>
    );
}
```

São 128 componentes e 116 hooks, mas o contrato é sempre este: componente recebe
prop e desenha; hook recebe entrada e devolve estado + funções.

## Recap

- Componente é função que devolve JSX; você descreve a tela **para um estado**, e o
  React aplica a diferença. ✅
- Prop entra de fora e é somente leitura; estado mora no componente e mudá-lo
  dispara render.
- Estado é imutável: crie valor novo, e use a forma de função quando depender do
  anterior.
- Efeito é para sincronizar com fora do React, com limpeza; dado derivável se
  calcula no render.
- Hooks: só no topo, só dentro de componente ou de outro hook `use*`.
- `key` é identidade — `id`, nunca índice; e trocar a `key` de propósito remonta com
  estado limpo.

📚 **Referência canônica:** [React — Aprenda React](https://react.dev/learn)

🎉 **Fim da trilha.** Você tem tudo o que o tutorial assume.
➡️ **Continue em:** [Tutorial — Comece aqui](../tutorial/index.md)
