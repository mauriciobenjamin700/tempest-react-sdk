# Fundamentos da Web — Comece por aqui

Esta trilha é **opcional**. Ela existe para quem já programa — em Python, Java, C#,
Go, o que for — mas nunca precisou aprender **a plataforma web**: HTML, CSS, o
JavaScript que roda no browser, e o mínimo de TypeScript e React que o
`tempest-react-sdk` assume em toda página.

O [Tutorial](../tutorial/index.md) começa em `create-tempest-app` e já supõe que
você sabe o que é um componente, um hook, um módulo ES e um tipo. Se isso soa como
uma lista de palavras, **comece aqui**. Se soa óbvio, pule direto para o tutorial —
nada nesta trilha é pré-requisito dele. 🚀

## O caminho expresso

Você não precisa ler as onze páginas. Cada uma abre com um bloco
**"Pule esta página se você já sabe…"**, e a tabela abaixo é o atalho: ache o
sintoma, vá na página.

| Se você já viu isso acontecer…                                              | Leia                                       |
| --------------------------------------------------------------------------- | ------------------------------------------ |
| "Coloquei `!important` até parar de piscar"                                 | [Cascata e especificidade](css.md)         |
| "Mudei a cor no `:root` e não pegou em tudo"                                | [Custom properties e tema](css-variables.md) |
| "O layout quebra quando o texto é grande"                                   | [Caixa, fluxo, flex e grid](css-layout.md) |
| "Meu `useEffect` roda em loop infinito"                                     | [Valor, referência, escopo](js.md)         |
| "O `console.log` mostra o dado, mas a tela mostra vazio"                    | [Promise, await, fetch](js-async.md)       |
| "Importei uma coisa só e o bundle cresceu 8 KB"                             | [Módulos, npm e o bundler](js-modules.md)  |
| "O TypeScript reclama de um tipo que eu não escrevi"                        | [O mínimo que o SDK usa](typescript.md)    |
| "O leitor de tela não anuncia o campo"                                      | [Formulário e acessibilidade](html-forms.md) |

## Como cada página é feita

Todas seguem a mesma forma, a mesma do resto deste site:

1. **Pule se você já sabe** — a lista exata do que a página cobre.
2. **O problema** — o bug real que aparece quando o conceito falta.
3. **Um exemplo completo** — arquivo inteiro, copiável, que roda. Nunca um
   fragmento com `...`.
4. **Pedaço por pedaço** — o *porquê*, não só o *como*.
5. **Onde isso aparece no SDK** — o ponto que amarra o conceito ao código que você
   já tem na frente.
6. **Recap** — os pontos da página em cinco linhas.

!!! info "Esta trilha não substitui a MDN"

    A [MDN Web Docs](https://developer.mozilla.org/pt-BR/) é o dicionário da
    plataforma web, e cada página aqui linka a referência canônica. O que esta
    trilha oferece é a **ordem**: o que aprender primeiro, e por que aquilo importa
    para o app que você tem na sua frente.

!!! note "O que fica de fora"

    Lógica de programação, algoritmo e estrutura de dados. O alvo é quem **já
    programa** e não conhece a plataforma web — não quem está aprendendo a
    programar.

## As onze páginas

### Como a página existe

| Página                                              | Você sai sabendo                                              |
| --------------------------------------------------- | ------------------------------------------------------------- |
| [HTML: estrutura e semântica](html.md)              | Por que a tag escolhida muda comportamento, não só aparência  |
| [Formulário e acessibilidade](html-forms.md)        | `<label>`, `for`/`id`, e por que o `aria-label` é o último recurso |

### Como a página parece

| Página                                                  | Você sai sabendo                                          |
| ------------------------------------------------------- | --------------------------------------------------------- |
| [CSS: seletor, cascata, especificidade](css.md)         | Quem ganha de quem, e por que `!important` é uma dívida   |
| [Caixa, fluxo, flex e grid](css-layout.md)              | Por que o elemento tem aquele tamanho, e como o layout responde |
| [Custom properties e tema](css-variables.md)            | Como `--tempest-*` herda — a estratégia de tema inteira   |

### Como a página reage

| Página                                            | Você sai sabendo                                              |
| ------------------------------------------------- | ------------------------------------------------------------- |
| [JavaScript: valor, referência, escopo](js.md)    | Por que um objeto inline quebra memoização                    |
| [Assíncrono: promise, await, fetch](js-async.md)  | Por que o dado "some", e o que é uma resposta vazia de sucesso |
| [Módulos, npm e o bundler](js-modules.md)         | O que o `import` custa, e o que tree-shaking cobra            |

### Antes do tutorial

| Página                                                    | Você sai sabendo                                    |
| --------------------------------------------------------- | --------------------------------------------------- |
| [TypeScript: o mínimo que o SDK usa](typescript.md)       | Ler uma assinatura de export público sem travar     |
| [React: componente, estado, efeito](react.md)             | O modelo mental que o Tutorial assume da página um   |

## Recap

- A trilha é **opcional** e nenhuma página dela é pré-requisito do
  [Tutorial](../tutorial/index.md). ✅
- Use a **tabela de sintomas** acima se você só quer fechar uma lacuna
  específica.
- Cada página ensina **o conceito** e termina mostrando **onde ele já está
  funcionando** no SDK.
- Nada aqui é sobre lógica de programação — é sobre a plataforma web.

➡️ **Próxima página:** [HTML: estrutura e semântica](html.md)
