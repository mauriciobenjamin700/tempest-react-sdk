# HTML: estrutura e semântica

!!! tip "Pule esta página se você já sabe…"

    - que a tag escolhida muda **comportamento**, não só aparência;
    - a diferença entre elemento de bloco e elemento inline;
    - por que `<div onClick>` não é um botão;
    - o que o browser monta a partir do seu markup (a árvore de acessibilidade).

## O problema

Este código funciona. Clique, e o `alert` aparece:

```html
<div class="botao" onclick="alert('salvo')">Salvar</div>
```

E mesmo assim ele está errado de quatro formas ao mesmo tempo, todas invisíveis
para quem testou só com o mouse:

- **Não recebe foco.** Você não chega nele com `Tab`.
- **Não responde a teclado.** `Enter` e `Espaço` não disparam nada.
- **Não se anuncia.** Um leitor de tela lê "Salvar", não "Salvar, botão".
- **Não sabe estar desabilitado.** Não existe `disabled` em `<div>`.

Troque uma palavra e as quatro somem:

```html
<button class="botao" onclick="alert('salvo')">Salvar</button>
```

Isso é **semântica**: a tag não é um rótulo decorativo, é um contrato de
comportamento com o browser.

## Um documento completo

Salve como `index.html` e abra no browser — é um arquivo inteiro, sem dependência
nenhuma:

```html
<!doctype html>
<html lang="pt-BR">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Lista de tarefas</title>
    </head>
    <body>
        <header>
            <h1>Minhas tarefas</h1>
        </header>

        <main>
            <section aria-labelledby="pendentes">
                <h2 id="pendentes">Pendentes</h2>
                <ul>
                    <li>Comprar café</li>
                    <li>Escrever a doc</li>
                </ul>
            </section>

            <button type="button" onclick="alert('nova tarefa')">Nova tarefa</button>
        </main>

        <footer>
            <p>Feito com HTML puro.</p>
        </footer>
    </body>
</html>
```

### Pedaço por pedaço

| Linha                     | Por que ela está aí                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| `<!doctype html>`         | Coloca o browser em **modo padrão**. Sem isso ele entra em "quirks mode" e o CSS se comporta como em 1998. |
| `lang="pt-BR"`            | Diz ao leitor de tela **em que língua ler** e ao browser como hifenizar.                                   |
| `<meta charset="utf-8">`  | Sem isso, `ç` e `ã` viram lixo. Vem antes de qualquer texto.                                                |
| `<meta name="viewport">`  | Sem isso, o celular renderiza uma página de 980px e reduz o zoom. É o que faz o responsivo existir.        |
| `<main>`                  | Marca o conteúdo principal. Leitores de tela oferecem "pular para o conteúdo" por causa dele.               |
| `<h1>`/`<h2>`             | Formam o **índice** do documento. Não escolha o nível pelo tamanho da fonte — isso é trabalho do CSS.       |
| `<ul>`/`<li>`             | O leitor de tela anuncia "lista de 2 itens". Uma pilha de `<div>` não anuncia nada.                        |
| `aria-labelledby`         | Amarra a `<section>` ao seu próprio `<h2>`, então a região tem nome.                                        |

!!! warning "Um `<h1>` por página, e sem pular níveis"

    `<h1>` → `<h3>` sem `<h2>` no meio quebra a navegação por cabeçalho, que é
    como muita gente lê uma página inteira. Se o `<h2>` está grande demais,
    conserte no CSS, não trocando a tag.

## Bloco e inline

Todo elemento tem um comportamento de fluxo padrão:

- **Bloco** (`<div>`, `<p>`, `<section>`, `<h1>`, `<ul>`) ocupa a largura toda e
  empurra o próximo para baixo.
- **Inline** (`<span>`, `<a>`, `<strong>`, `<em>`) ocupa só o que o conteúdo pede e
  fica na mesma linha.

Isso é o **default**, não uma lei: o CSS troca com `display`. Mas o default é o que
você vê antes de escrever uma linha de CSS, e entender isso é metade dos "por que
esse elemento está esticado?".

!!! info "`<div>` e `<span>` não são proibidos"

    Eles são as tags **sem** semântica, e existem exatamente para quando não há
    significado a declarar — um wrapper que só existe para o layout, por exemplo.
    O erro não é usá-los; é usá-los no lugar de uma tag que **tinha** significado.

## A árvore de acessibilidade

A partir do seu markup o browser monta duas árvores: o **DOM**, que o CSS e o JS
manipulam, e a **árvore de acessibilidade**, que é o que leitor de tela, navegação
por teclado e automação de teste enxergam.

`<button>` entra nessa segunda árvore como `role=button`, focável, com nome
acessível "Salvar". `<div onclick>` entra como um nó genérico, sem papel e sem
nome. É por isso que a troca de tag conserta quatro bugs de uma vez: você não
adicionou comportamento, você declarou o que a coisa **é**.

!!! tip "Isso é testável, e o SDK testa"

    `@testing-library/react` consulta pela árvore de acessibilidade —
    `getByRole("button", { name: "Salvar" })`. Um teste escrito assim falha no
    `<div onclick>` e passa no `<button>`. É o mesmo motivo pelo qual o SDK roda um
    sweep do `axe` em jsdom: markup sem semântica reprova antes do merge.

## Onde isso aparece no SDK

Os componentes do `tempest-react-sdk` renderizam **a tag certa**, não uma `<div>`
estilizada — e isso é o que faz o teclado e o leitor de tela funcionarem de graça
no seu app:

| Componente                   | Renderiza                        |
| ---------------------------- | -------------------------------- |
| `<Button>`                   | `<button>` de verdade            |
| `<Table>`                    | `<table>` / `<thead>` / `<tbody>` |
| `<Input>`                    | `<label htmlFor>` + `<input>`     |

`<Stack>` é a exceção que confirma a regra: ele renderiza uma `<div>` flexível,
porque o papel dele é **só** layout — não há significado a declarar. Quando você
precisa de uma lista de verdade, use `<ul>`; quando precisa de uma tabela, use
`<Table>`.

## Recap

- A tag escolhida é um **contrato de comportamento**, não um rótulo visual. ✅
- `<button>` traz foco, teclado, papel e `disabled` de graça; `<div onclick>` não
  traz nenhum dos quatro.
- `<!doctype>`, `lang`, `charset` e `viewport` são as quatro linhas que fazem a
  página se comportar — nenhuma delas é opcional.
- Cabeçalhos formam o índice do documento: um `<h1>`, sem pular níveis, tamanho
  resolvido no CSS.
- `<div>` e `<span>` são as tags **sem** semântica, e servem para quando não há
  significado a declarar.

📚 **Referência canônica:** [MDN — HTML](https://developer.mozilla.org/pt-BR/docs/Web/HTML)

➡️ **Próxima página:** [Formulário e acessibilidade](html-forms.md)
