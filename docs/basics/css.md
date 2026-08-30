# CSS: seletor, cascata, especificidade

!!! tip "Pule esta página se você já sabe…"

    - ler uma especificidade como `(0, 1, 0)` e dizer quem ganha;
    - que a ordem no arquivo desempata regras de mesma especificidade;
    - por que `!important` resolve hoje e cobra amanhã;
    - o que herda e o que não herda.

## O problema

Você quer o botão vermelho. Escreve isto e nada muda:

```css
.botao {
    background: red;
}
```

Então escreve isto, e funciona:

```css
.botao {
    background: red !important;
}
```

O bug não foi resolvido — foi adiado. Em algum lugar existe uma regra que ganhou da
sua, e agora existem duas regras brigando, uma delas com uma arma que só pode ser
respondida com outra `!important`. Três meses depois o app tem quarenta delas e
trocar de tema é impossível.

Vale a pena saber **quem** ganhou.

## Um exemplo completo

Arquivo único, abra no browser:

```html
<!doctype html>
<html lang="pt-BR">
    <head>
        <meta charset="utf-8" />
        <title>Cascata</title>
        <style>
            button {
                background: gray;
            }
            .botao {
                background: blue;
            }
            #salvar {
                background: green;
            }
            .barra .botao {
                background: orange;
            }
        </style>
    </head>
    <body>
        <div class="barra">
            <button id="salvar" class="botao">Salvar</button>
        </div>
    </body>
</html>
```

O botão fica **verde**. Quatro regras casam com ele, e a que vence é a do `#id`.

### A conta

Toda regra tem uma especificidade de três números — `(id, classe, tipo)`:

| Seletor         | id  | classe | tipo | Vetor       |
| --------------- | --- | ------ | ---- | ----------- |
| `button`        | 0   | 0      | 1    | `(0, 0, 1)` |
| `.botao`        | 0   | 1      | 0    | `(0, 1, 0)` |
| `.barra .botao` | 0   | 2      | 0    | `(0, 2, 0)` |
| `#salvar`       | 1   | 0      | 0    | `(1, 0, 0)` |

Compara-se **da esquerda para a direita**, e é comparação lexicográfica, não soma:
`(1, 0, 0)` ganha de `(0, 99, 0)`. Nenhuma quantidade de classes alcança um `id`.

Contam como **classe**: `.classe`, `[atributo]`, `:hover`, `:focus`, `:not(...)`
(o `:not` em si vale zero, mas o que está dentro conta). Contam como **tipo**:
`div`, `button`, `::before`. `*` vale zero.

!!! info "A ordem desempata — e só desempata"

    Duas regras com a **mesma** especificidade: ganha a que vem **depois**. Isso é
    o que faz o CSS do seu app sobrescrever o CSS de uma biblioteca — desde que
    você importe o seu depois, e use a mesma especificidade.

## O que ganha de tudo

A ordem completa que o browser aplica, do mais forte para o mais fraco:

1. `!important` do usuário (folha de estilo do próprio usuário — raro)
2. `!important` do autor (o seu, e o da biblioteca)
3. `style="..."` inline
4. Autor normal, resolvido por camada → especificidade → ordem

`!important` não é "mais especificidade": ele **pula a fila inteira**. É por isso
que só se responde a ele com outro `!important`, e é por isso que ele é dívida.

!!! warning "O sintoma de que a especificidade está fora de controle"

    Você escreve um seletor mais longo do que precisa (`.pagina .cartao .titulo h2`)
    só para ganhar de outro. Cada vez que isso acontece, a próxima pessoa precisa
    de um ainda mais longo. A saída não é escalar — é baixar a especificidade dos
    dois lados.

## O que herda

Algumas propriedades passam de pai para filho sem você pedir: `color`,
`font-family`, `font-size`, `line-height`, `text-align`, `visibility` — e
**custom properties** (`--minha-cor`), que é o que faz o tema funcionar.

Não herdam: `background`, `border`, `padding`, `margin`, `display`, `width`. Elas
valem só no elemento em que você as escreveu.

```css
body {
    color: #333; /* herda: todo texto abaixo fica #333 */
    border: 1px solid red; /* não herda: só o body ganha borda */
}
```

## Onde isso aparece no SDK

O `tempest-react-sdk` estiliza **só** por CSS Modules, e cada classe sai do build
com o nome transformado:

```
.button { }        →        .tempest_button_a3f9k { }
```

Isso é uma escolha de especificidade, não de estética. Toda regra do SDK é **uma
classe só** — `(0, 1, 0)` — porque:

- **Não colide.** O hash garante que `.button` do SDK e `.button` do seu app são
  seletores diferentes. Nenhum dos dois precisa de seletor longo para se defender.
- **É fácil de sobrescrever.** Sua classe própria, com a mesma `(0, 1, 0)`,
  importada **depois** de `tempest-react-sdk/styles.css`, ganha por ordem. Você
  nunca precisa de `!important` para ajustar um componente.

```tsx
import "tempest-react-sdk/styles.css";
import "./app.css"; // depois: seus overrides ganham no desempate
```

!!! tip "Sobrescrever token é melhor que sobrescrever regra"

    Na maior parte dos casos você nem precisa de uma classe: mudar
    `--tempest-primary` no `:root` repinta o componente inteiro sem tocar em
    seletor nenhum. É o assunto de [Custom properties e tema](css-variables.md).

!!! note "Por que não existe modo *headless*"

    Uma pergunta recorrente é se o SDK poderia emitir `data-*` em vez de classes,
    para o app estilizar com Tailwind ou Stitches. A resposta é não, e o motivo
    está em [Estilos & Design Tokens](../styles.md): manter um segundo caminho de estilo
    dobraria a superfície de cada componente e diluiria os tokens. Um app com
    Tailwind **convive** com o SDK — o prefixo `tempest_` garante que nada colide.

## Recap

- Especificidade é o vetor `(id, classe, tipo)`, comparado da esquerda para a
  direita. `(1,0,0)` ganha de `(0,99,0)`. ✅
- Ordem no arquivo **desempata** regras de mesma especificidade — é como o CSS do
  app sobrescreve o de uma biblioteca.
- `!important` não é especificidade alta, é pular a fila. Ele só é respondido com
  outro, e é assim que um app perde a capacidade de trocar de tema.
- `color` e as custom properties **herdam**; `background`, `border` e `padding`
  não.
- No SDK toda regra é uma classe só, com hash `tempest_*`: não colide e é barata de
  sobrescrever — importe o seu CSS depois do `styles.css`.

📚 **Referência canônica:** [MDN — Cascata e herança](https://developer.mozilla.org/pt-BR/docs/Learn/CSS/Building_blocks/Cascade_and_inheritance)

➡️ **Próxima página:** [Caixa, fluxo, flex e grid](css-layout.md)
