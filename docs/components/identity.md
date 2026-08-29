# Identidade & micro

Componentes de **identidade** representam _quem_ ou _o quê_ na interface: a pessoa por trás de uma conta (`Avatar`), um bloco de conteúdo agrupado e reconhecível (`Card`) e a tipografia semântica de uma tecla de atalho (`Kbd`). São peças pequenas e de alta frequência — aparecem em listas, headers, feeds — então a consistência delas define a "cara" do app.

Use esta página quando precisar **mostrar** uma entidade ou agrupar conteúdo, não quando precisar de uma ação ([actions](./actions.md)) ou de layout puro ([layout](./layout.md)).

## `Avatar`

<!-- gallery:display-media -->
[![Avatar · Image · Carousel na gallery](../assets/gallery/display-media.webp)](../gallery.md)

*Seção `display-media` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

> **Quando usar**: representar visualmente um usuário/entidade em listas, comentários, headers — com foto quando disponível e iniciais coloridas como fallback.

Foto de usuário com fallback automático para iniciais coloridas quando não há `src` ou a imagem falha ao carregar. As iniciais são derivadas de `name` (não de `alt`).

```tsx
<Avatar src={user.photo} name={user.name} alt={user.name} />;
<Avatar size="lg" status="online" name="Ana" />;
<Avatar name="João da Silva" />; // fallback gera iniciais "JS"
<Avatar name="João" status="busy" size="sm" />;
```

| Prop      | Tipo                                        | Default |
| --------- | ------------------------------------------- | ------- |
| `src`     | `string`                                    | —       |
| `alt`     | `string` (texto alternativo da imagem)      | —       |
| `name`    | `string` (gera as iniciais do fallback)     | `""`    |
| `size`    | `"xs" \| "sm" \| "md" \| "lg" \| "xl"`      | `"md"`  |
| `status`  | `"online" \| "offline" \| "busy"`           | —       |
| `onClick` | `() => void`                                | —       |

!!! warning "Iniciais vêm de `name`, não de `alt`"
    O fallback de iniciais é calculado a partir de `name`. Se você passar só `alt`, o avatar mostra `?` quando a imagem falha. Para um nome composto, ele usa a primeira letra do primeiro e do último termo (`"João da Silva"` → `"JS"`).

!!! tip "Sempre forneça `alt` quando houver `src`"
    Quando `src` está setado, `alt` é o texto que leitores de tela anunciam. Descreva a pessoa (o nome), não a mídia — evite `"foto de…"`.

## `Card`

<!-- gallery:feedback -->
[![Badges · Cards · Skeleton na gallery](../assets/gallery/feedback.webp)](../gallery.md)

*Seção `feedback` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

> **Quando usar**: agrupar conteúdo relacionado num bloco com elevação visual — um item de lista, um painel de dashboard, um container para tabela.

Container com slots de header (`title` + `actions`) e `footer`.

```tsx
<Card title="Pedido #12345" actions={<Button variant="ghost">Editar</Button>}>
    Conteúdo do card.
</Card>;

<Card elevation="raised" interactive onClick={() => navigate("/x")}>
    Card clicável com hover effect.
</Card>;

<Card flush footer={<Pagination ... />}>
    <Table ... />
</Card>;
```

| Prop          | Tipo                                                  | Default     |
| ------------- | ----------------------------------------------------- | ----------- |
| `title`       | `ReactNode`                                           | —           |
| `actions`     | `ReactNode` (slot direito do header)                  | —           |
| `footer`      | `ReactNode`                                           | —           |
| `elevation`   | `"flat" \| "default" \| "raised" \| "elevated"`       | `"default"` |
| `interactive` | `boolean` (cursor pointer + hover ring)               | `false`     |
| `flush`       | `boolean` (zero padding interno — pra hospedar Table) | `false`     |

!!! tip "Use `flush` para hospedar tabelas e listas"
    Cards têm padding interno por padrão. Ao colocar uma `Table` ou lista que já tem suas próprias margens, ative `flush` para o conteúdo encostar nas bordas do card sem padding duplo.

!!! note "`interactive` torna o card inteiro um botão"
    Com `interactive`, o card recebe `role="button"`, `tabIndex={0}` e handler de teclado (Enter/Space). Evite colocar outros elementos clicáveis dentro de um card interativo — clicks aninhados disputam o mesmo gesto e confundem a navegação por teclado.

## `Kbd`

<!-- gallery:inputs-extra -->
[![Inputs avançados (Date · Pin · Slider) na gallery](../assets/gallery/inputs-extra.webp)](../gallery.md)

*Seção `inputs-extra` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

> **Quando usar**: exibir uma tecla ou combinação (atalhos, dicas de command palette) com a aparência de tecla física.

`<kbd>` estilizado para atalhos de teclado.

```tsx
<p>Aperte <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd> para abrir o command palette.</p>
<Kbd size="lg">⌘</Kbd>
```

| Prop   | Tipo                   | Default |
| ------ | ---------------------- | ------- |
| `size` | `"sm" \| "md" \| "lg"` | `"md"`  |

!!! tip "Um `<Kbd>` por tecla"
    Para combinações, repita o componente em vez de juntar tudo em texto plano: `<Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>`. Cada `<Kbd>` renderiza um elemento `<kbd>` semântico que leitores de tela anunciam individualmente.

## `AvatarGroup`

<!-- gallery:capture-media -->
[![SignaturePad · Lightbox · AvatarGroup na gallery](../assets/gallery/capture-media.webp)](../gallery.md)

*Seção `capture-media` da [gallery](../gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

> **Quando usar**: mostrar várias pessoas num espaço pequeno — participantes de uma reunião, responsáveis por uma tarefa, membros de um time.

Fileira de avatares sobrepostos com chip `+N` no fim.

```tsx
<AvatarGroup
  label="Participantes"
  max={3}
  items={[
    { name: "Ada Lovelace", src: ada },
    { name: "Grace Hopper" },
    { name: "Alan Turing" },
    { name: "Edsger Dijkstra" },
  ]}
  onOverflowClick={() => setDrawerAberto(true)}
/>
```

| Prop              | Tipo                | Default | O que faz                                                    |
| ----------------- | ------------------- | ------- | ------------------------------------------------------------ |
| `items`           | `AvatarGroupItem[]` | —       | Pessoas do grupo (`{ name, src? }`).                          |
| `max`             | `number`            | `4`     | Quantos avatares antes de colapsar em `+N`.                   |
| `size`            | `AvatarSize`        | `"md"`  | Tamanho aplicado aos avatares **e** ao chip.                  |
| `label`           | `string`            | —       | Nome acessível do grupo.                                      |
| `onOverflowClick` | `() => void`        | —       | Torna o chip `+N` um botão focável (ex.: abrir "ver todos").   |

!!! info "Um grupo, um nome acessível"
    A fileira é um `role="group"` com um nome só, e cada avatar expõe o nome da pessoa. Anunciar sete imagens soltas sem relação entre elas é ruído; o chip `+N` carrega o restante da contagem, então o total nunca fica escondido do leitor de tela.

!!! tip "A sobreposição é ajustável"
    `--tempest-avatar-overlap` controla o quanto cada avatar cobre o anterior — os defaults são proporcionais ao `size`.

## Resumo

| Componente | Use para                                       |
| ---------- | ---------------------------------------------- |
| `Avatar`   | Representar um usuário (foto ou iniciais)      |
| `Card`     | Agrupar conteúdo relacionado num bloco elevado |
| `Kbd`      | Exibir teclas/atalhos de teclado               |

Pontos-chave de acessibilidade:

- `Avatar.alt` descreve o usuário (nome), não a mídia; as iniciais vêm de `name`.
- `Card` com `interactive` aplica `role="button"` + teclado (Enter/Space) — não aninhe outros clicáveis.
- `Kbd`: repita um por tecla em combinações.

Relacionados: [actions](./actions.md) (`Button` dentro de `Card.actions`) · [data](./data.md) (`Card flush` hospedando `Table`) · [layout](./layout.md) (organizar cards em grid/stack).
