# Caixa, fluxo, flex e grid

!!! tip "Pule esta página se você já sabe…"

    - o que `box-sizing: border-box` muda na conta da largura;
    - a diferença entre eixo principal e eixo cruzado no flexbox;
    - quando grid é a resposta e quando flex é;
    - por que uma *container query* responde melhor que uma *media query*.

## O problema

Você quer duas colunas de 50% lado a lado, com um respiro entre elas:

```css
.coluna {
    width: 50%;
    padding: 16px;
    float: left;
}
```

E elas quebram para baixo. O motivo é a **conta da caixa**: por padrão, `width:
50%` é a largura do **conteúdo**, e o `padding` é somado por fora. Cada coluna
ocupa `50% + 32px`, e duas não cabem em 100%.

Uma linha resolve, e é a primeira linha de qualquer CSS moderno:

```css
*,
*::before,
*::after {
    box-sizing: border-box;
}
```

Com `border-box`, `width: 50%` passa a incluir `padding` e `border`. A conta fecha.

## O modelo de caixa

Todo elemento é quatro retângulos concêntricos:

```
┌──────────── margin ────────────┐
│ ┌────────── border ──────────┐ │
│ │ ┌──────── padding ───────┐ │ │
│ │ │       content          │ │ │
│ │ └────────────────────────┘ │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

- **content** — o texto ou a imagem.
- **padding** — respiro **dentro**, pintado com o fundo do elemento.
- **border** — a linha.
- **margin** — respiro **fora**, transparente. Margens verticais adjacentes
  **colapsam** entre si (duas de 16px viram uma de 16px, não 32px) — motivo pelo
  qual `gap` costuma ser mais previsível.

## Flexbox: uma dimensão

Flex distribui filhos ao longo de **um** eixo. É a ferramenta para barra, toolbar,
linha de botões, lista vertical.

```html
<!doctype html>
<html lang="pt-BR">
    <head>
        <meta charset="utf-8" />
        <title>Flex</title>
        <style>
            *,
            *::before,
            *::after {
                box-sizing: border-box;
            }
            .barra {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 12px;
                border: 1px solid #ddd;
            }
            .titulo {
                flex: 1;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
        </style>
    </head>
    <body>
        <div class="barra">
            <strong class="titulo">Um título muito comprido que não cabe na barra inteira</strong>
            <button type="button">Editar</button>
            <button type="button">Excluir</button>
        </div>
    </body>
</html>
```

| Propriedade                     | O que faz                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `display: flex`                 | Liga o eixo principal (horizontal por padrão).                                |
| `justify-content`               | Distribui no eixo **principal**.                                              |
| `align-items`                   | Alinha no eixo **cruzado** (vertical, aqui).                                  |
| `gap`                           | Espaço entre filhos, sem margens colapsando.                                  |
| `flex: 1`                       | "Cresça para ocupar a sobra."                                                  |
| `min-width: 0`                  | O destravamento do truncamento — veja abaixo.                                  |

!!! warning "`min-width: 0` é a linha que falta em 90% dos truncamentos quebrados"

    O tamanho mínimo padrão de um item flex é `auto`, que é **o tamanho do
    conteúdo**. Um texto longo simplesmente se recusa a encolher, e empurra os
    botões para fora da barra. `min-width: 0` diz "pode encolher abaixo do
    conteúdo", e só aí `text-overflow: ellipsis` tem efeito.

## Grid: duas dimensões

Grid define linhas **e** colunas de uma vez. É a ferramenta para layout de página,
formulário de duas colunas, galeria de cartões.

```css
.galeria {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
}
```

Essa linha sozinha é um layout responsivo inteiro, **sem media query**: "quantas
colunas couberem, cada uma com no mínimo 240px, dividindo a sobra igualmente".

!!! info "Regra prática de escolha"

    Uma direção e o conteúdo manda no tamanho → **flex**. Duas direções e o
    contêiner manda no tamanho → **grid**. Barra de botões é flex; a página inteira
    é grid.

## Container query: o breakpoint certo

Uma media query pergunta o tamanho da **janela**. Quase sempre a pergunta errada:
um componente dentro de uma sidebar de 320px, numa janela de 1600px, recebe o
layout de desktop e fica espremido.

Container query pergunta o tamanho do **contêiner**:

```css
.painel {
    container-type: inline-size;
    container-name: painel;
}

@container painel (min-width: 40rem) {
    .cartao {
        grid-column: span 6;
    }
}
```

O mesmo componente funciona full-bleed, dentro de uma sidebar ou dentro de uma
gaveta — porque a pergunta passou a ser sobre o espaço que ele **de fato** tem.

## Onde isso aparece no SDK

O SDK publica uma folha **opt-in** de layout, `utilities.css`, que não vem no
bundle padrão. Importe quando quiser:

```ts
import "tempest-react-sdk/styles.css";
import "tempest-react-sdk/utilities.css"; // opcional
```

Ela traz as receitas acima já nomeadas — `.tempest-stack`, `.tempest-cluster`,
`.tempest-row`, `.tempest-grid-auto`, `.tempest-sidebar-layout`,
`.tempest-form-grid` — e a receita de página inteira, o dashboard:

```html
<div class="tempest-dashboard">
    <section class="tempest-widget tempest-widget-half">Vendas</section>
    <section class="tempest-widget tempest-widget-half">Visitas</section>
    <section class="tempest-widget tempest-widget-tall">Série temporal</section>
</div>
```

`.tempest-dashboard` é um grid de 12 colunas com `container-type: inline-size`, e os
spans dos widgets abrem em duas etapas — 40rem e 64rem — **do contêiner**, não da
janela. Um widget nasce ocupando a largura toda, porque dashboard lido no celular é
uma coluna só, e essa é a maior parte da vida dele.

Detalhes e a lista completa em [Estilos & Design Tokens](../styles.md).

## Recap

- `box-sizing: border-box` faz `width` incluir `padding` e `border` — é a primeira
  linha do seu CSS. ✅
- Margens verticais adjacentes colapsam; `gap` não colapsa, por isso é mais
  previsível.
- Flex é **uma** dimensão (barra, toolbar); grid é **duas** (página, galeria,
  formulário).
- `min-width: 0` é o que deixa um item flex encolher abaixo do conteúdo — sem ele
  `ellipsis` não funciona.
- Container query pergunta o tamanho do contêiner, que é a pergunta certa para um
  componente reusável.
- No SDK, `utilities.css` é **opt-in** e traz essas receitas nomeadas, incluindo o
  `.tempest-dashboard` com spans por container query.

📚 **Referência canônica:** [MDN — Flexbox](https://developer.mozilla.org/pt-BR/docs/Web/CSS/CSS_Flexible_Box_Layout) · [MDN — Grid](https://developer.mozilla.org/pt-BR/docs/Web/CSS/CSS_Grid_Layout)

➡️ **Próxima página:** [Custom properties e tema](css-variables.md)
