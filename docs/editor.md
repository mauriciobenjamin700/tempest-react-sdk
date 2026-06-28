# Rich Text Editor (`tempest-react-sdk/editor`)

Editor WYSIWYG controlado, construído sobre [tiptap](https://tiptap.dev). Vive
num subpath separado (`tempest-react-sdk/editor`) porque o tiptap é pesado — e
quem **não** usa o editor não paga nada por ele.

## Por que um subpath separado?

Um editor rich-text traz uma árvore de dependências grande (tiptap +
ProseMirror). Forçar isso em todo app que instala o SDK seria injusto com quem só
quer um `Button` e um `createApiClient`.

A solução é o mesmo padrão dos outros wrappers do SDK: **o caller injeta a
dependência pesada**. O `RichTextEditor` importa `@tiptap/react` e
`@tiptap/starter-kit`, mas esses pacotes são **peer deps opcionais** — declarados
no SDK como _optional_ e externalizados no bundle. Resultado:

- Quem usa o editor instala o tiptap explicitamente uma vez.
- Quem não usa nunca puxa tiptap pro bundle — o subpath fica fora do barrel raiz.

!!! tip "Importe do subpath, não do barrel raiz"
    `RichTextEditor` só existe em `tempest-react-sdk/editor`. Ele **não** é
    re-exportado de `tempest-react-sdk` — assim o tiptap nunca vaza pro bundle de
    quem só importa o barrel principal.

## Instalação

Instale o SDK normalmente e adicione os dois peers do tiptap:

```bash
npm install tempest-react-sdk
npm install @tiptap/react @tiptap/starter-kit
```

!!! info "Por que os peers são opcionais"
    `@tiptap/react` e `@tiptap/starter-kit` são declarados como
    `peerDependencies` **opcionais**. Apps que nunca importam
    `tempest-react-sdk/editor` podem ignorá-los sem warning de instalação. No
    momento em que você importar o editor sem tê-los instalado, o bundler
    acusa o módulo faltando — aí é só rodar o `npm install` acima.

## Estilos

O `RichTextEditor` usa CSS Modules com tokens `--tempest-*`, então ele já segue
o tema do app (claro/escuro) sem config extra. Basta importar o `styles.css` do
SDK uma vez no entry do app (você já faz isso pros outros componentes):

```ts
// src/main.tsx
import "tempest-react-sdk/styles.css";
```

A área editável (a `.ProseMirror`) e a toolbar herdam cor de texto, borda, anel
de foco e radius dos tokens `--tempest-*`. Para customizar, sobrescreva os
tokens no `:root` como em qualquer outro componente — veja
[Styles & tokens](./styles.md).

## API

```tsx
<RichTextEditor
  value={html} // string HTML controlada (obrigatório)
  onChange={setHtml} // (html: string) => void (obrigatório)
  placeholder="Escreva algo…" // texto quando vazio (opcional)
  editable // false = somente leitura (default true)
  toolbar // false = esconde a toolbar (default true)
  className="meu-editor" // classes extras no wrapper (opcional)
/>
```

| Prop          | Tipo                      | Default | Descrição                                          |
| ------------- | ------------------------- | ------- | -------------------------------------------------- |
| `value`       | `string`                  | —       | Conteúdo do editor como **HTML** (controlado).     |
| `onChange`    | `(html: string) => void`  | —       | Chamado com o HTML atualizado a cada mudança.      |
| `placeholder` | `string`                  | —       | Texto exibido quando o editor está vazio.          |
| `editable`    | `boolean`                 | `true`  | `false` torna o conteúdo somente leitura.          |
| `toolbar`     | `boolean`                 | `true`  | `false` esconde a toolbar de formatação.           |
| `className`   | `string`                  | —       | Classes extras aplicadas ao elemento wrapper.      |

### A toolbar embutida

Quando `toolbar` é `true` (default), o editor renderiza uma barra acima da área
editável com os comandos do `StarterKit`:

- **Negrito**, **Itálico**, **Tachado**, **Código** (inline)
- **Título 1**, **Título 2**
- **Lista com marcadores**, **Lista numerada**, **Citação** (blockquote)
- **Desfazer** / **Refazer** (desabilitados quando não há histórico)

Os botões refletem o estado do cursor (ficam ativos quando a seleção já está em
negrito, dentro de uma lista, etc.) e têm `aria-label` + `aria-pressed` para
acessibilidade.

## Exemplo completo — editor controlado

Programa copiável de ponta a ponta. O estado HTML vive no React via `useState`,
o editor o reflete e um `<details>` mostra o HTML emitido ao vivo.

```tsx
import { useState } from "react";
import { RichTextEditor } from "tempest-react-sdk/editor";
import "tempest-react-sdk/styles.css";

export function ArticleEditor() {
  const [html, setHtml] = useState<string>("<p>Comece a escrever seu artigo…</p>");

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <h1>Novo artigo</h1>

      <RichTextEditor
        value={html}
        onChange={setHtml}
        placeholder="Escreva algo incrível…"
      />

      <details style={{ marginTop: 16 }}>
        <summary>HTML emitido</summary>
        <pre>{html}</pre>
      </details>
    </div>
  );
}
```

!!! note "`value` é HTML, `onChange` recebe HTML"
    O editor é totalmente controlado por uma string HTML. Você guarda esse HTML
    onde quiser (state, formulário, API) e o passa de volta em `value`. Mudanças
    externas em `value` são sincronizadas para dentro do editor **sem**
    re-disparar `onChange`, então não há loop de atualização.

### Somente leitura

Para exibir conteúdo sem permitir edição (preview de um artigo, por exemplo),
passe `editable={false}`. Você normalmente também esconde a toolbar:

```tsx
<RichTextEditor value={savedHtml} onChange={() => {}} editable={false} toolbar={false} />
```

!!! tip "Renderize HTML salvo com o mesmo tema"
    Usar o `RichTextEditor` em modo `editable={false}` é a forma mais simples de
    renderizar HTML salvo com a **mesma** tipografia e tokens da edição — a
    `.ProseMirror` aplica o estilo do tema tanto na escrita quanto na leitura.

!!! warning "`onChange` continua obrigatório"
    `onChange` é uma prop obrigatória mesmo em modo somente leitura. Em
    `editable={false}` ela nunca é chamada, então passe um no-op
    (`() => {}`) para satisfazer o tipo.

### Sem toolbar (UI própria)

Passe `toolbar={false}` quando quiser uma barra de formatação própria ou um
editor minimalista (um campo de comentário, por exemplo):

```tsx
<RichTextEditor value={comment} onChange={setComment} toolbar={false} placeholder="Comente…" />
```

## Recap

- `RichTextEditor` é um editor WYSIWYG **controlado** sobre tiptap, exposto no
  subpath `tempest-react-sdk/editor` — fora do barrel raiz, então quem não usa
  não paga nada.
- `@tiptap/react` e `@tiptap/starter-kit` são **peer deps opcionais**: o caller
  injeta a dependência pesada com `npm i @tiptap/react @tiptap/starter-kit`.
- `value` é uma string **HTML** e `onChange(html)` devolve o HTML a cada edição;
  mudanças externas em `value` são sincronizadas sem re-disparar `onChange`.
- A toolbar embutida cobre negrito/itálico/tachado/código, H1/H2, listas,
  citação e desfazer/refazer — desligue com `toolbar={false}`.
- `editable={false}` deixa o editor somente leitura (ótimo para preview); o
  visual da `.ProseMirror` segue os tokens `--tempest-*` via `styles.css`.

## Veja também

- [Styles & tokens](./styles.md) — customizar o tema `--tempest-*` da `.ProseMirror`.
- [Forms](./forms.md) — integrar o HTML do editor num formulário controlado.
