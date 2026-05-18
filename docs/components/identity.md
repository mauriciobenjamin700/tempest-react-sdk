# Identidade & micro

Avatares, cards, kbd shortcuts.

## `Avatar`

Foto/iniciais de usuário.

```tsx
<Avatar src={user.photo} alt={user.name} />;
<Avatar size="lg" status="online" />;
<Avatar alt="João da Silva" />; // fallback gera iniciais "JS"
<Avatar alt="João" status="busy" size="sm" />;
```

| Prop     | Tipo                                                   | Default    |
| -------- | ------------------------------------------------------ | ---------- |
| `src`    | `string`                                               | —          |
| `alt`    | `string` (usado pra gerar iniciais quando `src` falha) | —          |
| `size`   | `"sm" \| "md" \| "lg"` (ou `number` em px)             | `"md"`     |
| `status` | `"online" \| "offline" \| "busy" \| "away"`            | —          |
| `shape`  | `"circle" \| "square"`                                 | `"circle"` |

**A11y**: `alt` obrigatório quando `src` é setado.

## `Card`

Container com slots.

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

## `Kbd`

`<kbd>` styled para atalhos de teclado.

```tsx
<p>Aperte <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd> para abrir o command palette.</p>
<Kbd size="lg">⌘</Kbd>
```

| Prop   | Tipo                   | Default |
| ------ | ---------------------- | ------- |
| `size` | `"sm" \| "md" \| "lg"` | `"md"`  |

**A11y**: renderiza `<kbd>` semântico — screen readers anunciam corretamente.

## A11y geral

- Avatar: o `alt` deve descrever o usuário (nome), não a foto ("foto de…").
- Card.interactive: aplica `role="button"` + `tabIndex={0}` + handle de keyboard (Enter/Space).
- Kbd: para combos, repita o `<Kbd>` em vez de texto plano (`<Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>`).
