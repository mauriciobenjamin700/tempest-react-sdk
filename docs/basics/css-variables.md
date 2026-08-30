# Custom properties e tema

!!! tip "Pule esta página se você já sabe…"

    - que `--minha-cor` é uma propriedade CSS de verdade, e que ela **herda**;
    - a diferença entre `var(--x)` e `var(--x, fallback)`;
    - por que sobrescrever numa subárvore muda só aquele pedaço da tela;
    - por que uma custom property vence a variável de pré-processador.

## O problema

Um app com a cor da marca escrita em quarenta arquivos:

```css
.botao {
    background: #3b82f6;
}
.link {
    color: #3b82f6;
}
.badge {
    border-color: #3b82f6;
}
```

Trocar a marca é quarenta edições. Suportar tema escuro é quarenta **pares** de
edições. E um cliente que quer a própria cor é impossível sem rebuild.

## A solução tem uma linha

Custom property é uma propriedade CSS como qualquer outra — só que o nome começa com
`--` e o valor é seu:

```css
:root {
    --cor-marca: #3b82f6;
}

.botao {
    background: var(--cor-marca);
}
```

Agora a marca mora num lugar só. Mas o que faz isso ser a estratégia inteira de
tema não é a centralização — é a **herança**.

## Um exemplo completo

Arquivo único. Abra no browser: os dois cartões são o **mesmo** CSS, e um deles é
escuro.

```html
<!doctype html>
<html lang="pt-BR">
    <head>
        <meta charset="utf-8" />
        <title>Custom properties</title>
        <style>
            :root {
                --fundo: #ffffff;
                --texto: #101828;
                --marca: #3b82f6;
                --raio: 8px;
            }

            [data-tema="dark"] {
                --fundo: #0b0d12;
                --texto: #f1f3f8;
                --marca: #7aa2ff;
            }

            .cartao {
                background: var(--fundo);
                color: var(--texto);
                border: 1px solid var(--marca);
                border-radius: var(--raio);
                padding: 16px;
                margin-bottom: 12px;
                font-family: system-ui, sans-serif;
            }

            .cartao button {
                background: var(--marca);
                color: var(--fundo);
                border: 0;
                border-radius: var(--raio);
                padding: 8px 16px;
            }
        </style>
    </head>
    <body>
        <div class="cartao">
            <p>Claro — usa os valores do <code>:root</code>.</p>
            <button type="button">Ação</button>
        </div>

        <div class="cartao" data-tema="dark">
            <p>Escuro — mesmas regras, valores sobrescritos aqui.</p>
            <button type="button">Ação</button>
        </div>
    </body>
</html>
```

Nenhuma regra de `.cartao` foi duplicada. O segundo cartão redefine três valores no
próprio elemento, e **tudo abaixo dele** — inclusive o `<button>`, que a regra
`.cartao button` estiliza — passa a resolver `var(--marca)` para o valor novo.

### Por que isso funciona

Custom properties herdam. `var(--marca)` não é "leia a variável global": é "leia o
valor de `--marca` **neste elemento**", e se ele não a definiu, o valor vem do pai,
e do pai do pai, até o `:root`.

É essa cadeia que torna o tema por subárvore possível. E é por isso que uma
variável de Sass **não** faz o mesmo: `$marca` é resolvida na hora do build e
desaparece do CSS. Custom property existe em tempo de execução — o JS lê e escreve.

```js
// leitura
getComputedStyle(document.documentElement).getPropertyValue("--marca");

// escrita
document.documentElement.style.setProperty("--marca", "#e11d48");
```

## `var()` com fallback

O segundo argumento é o valor usado quando a propriedade **não está definida**:

```css
.cartao {
    padding: var(--cartao-padding, 16px);
}
```

Isso cria um **knob**: quem consome pode definir `--cartao-padding` e mudar o
espaçamento, e quem não define ganha o `16px`. Diferente de um token — que é uma
decisão de design nomeada, sempre definida — o knob existe justamente para ser
opcional.

!!! tip "O linter de CSS do SDK trata os dois de forma diferente"

    `tempest doctor` acusa `var(--nao-existe)` sem fallback como token inexistente,
    e **nunca** reporta `var(--x, fallback)`. Essa regra saiu do dogfood: a primeira
    versão da análise acusou 47 problemas no CSS do próprio SDK, e 43 eram o idioma
    de knob. Taxa de falso positivo decide se a ferramenta é lida ou ignorada.

## Onde isso aparece no SDK

Esta é a **estratégia inteira** de tema do `tempest-react-sdk`. Não há prop de cor,
não há objeto de tema em JS, não há provider obrigatório para estilo: existem
tokens `--tempest-*` definidos no `:root` e redefinidos sob
`[data-tempest-theme="dark"]`.

```css
:root {
    --tempest-bg: #ffffff;
    --tempest-surface: var(--tempest-gray-50);
    --tempest-text: var(--tempest-gray-900);
    --tempest-primary: var(--tempest-primary-500);
}

[data-tempest-theme="dark"] {
    --tempest-bg: #0b0d12;
    --tempest-text: #f1f3f8;
}
```

Customizar o app inteiro é sobrescrever no seu próprio CSS, importado depois:

```css
:root {
    --tempest-primary: #e11d48;
    --tempest-radius-md: 4px;
}
```

Pronto — todo `<Button>`, `<Badge>`, `<Input>` e o resto repintam. Você não tocou em
seletor nenhum, então não há briga de especificidade ([CSS: cascata](css.md)).

!!! info "Escuro por atributo, não por classe"

    O SDK usa `data-tempest-theme="dark"`, não `class="dark"`. O motivo é o
    exemplo desta página: como o atributo pode ficar em **qualquer** elemento, você
    escurece uma subárvore — um preview, uma gaveta, um painel — sem escurecer a
    página. Uma classe global não daria isso de graça.

    O `<ThemeProvider>` gerencia o atributo, e `themeInitScript` o aplica **antes**
    da primeira pintura, para a página não piscar branco. Detalhes em
    [Tema](../theme.md).

!!! warning "Token de texto validado contra um fundo não vale sobre outro"

    `--tempest-text-subtle` é resolvido contra `--tempest-bg` e `--tempest-surface`,
    e **reprova** 4,5:1 sobre `--tempest-primary-soft`. Sobre superfície tingida,
    use o foreground daquela superfície (`--tempest-primary-on-soft`) e
    de-enfatize por **tamanho**, não por cor. Isso aconteceu duas vezes no SDK e as
    duas só apareceu em browser real — o `axe` em jsdom desliga a checagem de
    contraste porque não há pintura.

## Recap

- Custom property é propriedade CSS de verdade: `--x` **herda** do pai até o
  `:root`. ✅
- Sobrescrever numa subárvore muda só aquele pedaço da tela — é o que torna o tema
  por região possível.
- Ela existe em runtime; o JS lê com `getPropertyValue` e escreve com
  `setProperty`. Variável de Sass some no build.
- `var(--x, fallback)` é um **knob** opcional; `var(--x)` é um token que deve
  existir.
- No SDK: tokens `--tempest-*` no `:root`, tema escuro em
  `[data-tempest-theme="dark"]`, e customizar é sobrescrever token — nunca brigar
  com seletor.

📚 **Referência canônica:** [MDN — Custom properties](https://developer.mozilla.org/pt-BR/docs/Web/CSS/Using_CSS_custom_properties)

➡️ **Próxima página:** [JavaScript: valor, referência, escopo](js.md)
