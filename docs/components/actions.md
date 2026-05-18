# Ação

Botões, tooltips, menus, overlays de confirmação.

## `Button`

Botão primário com variants, sizes, estado de loading.

```tsx
import { Button } from "tempest-react-sdk";
import { Plus, Trash } from "lucide-react";

<Button>Salvar</Button>;
<Button variant="danger" leftIcon={<Trash size={16} />}>
  Excluir
</Button>;
<Button variant="outline" loading>
  Carregando…
</Button>;
<Button variant="link" rightIcon={<ArrowRight size={14} />}>
  Ver mais
</Button>;
<Button iconOnly aria-label="Adicionar">
  <Plus size={16} />
</Button>;
<Button fullWidth pill>
  CTA
</Button>;
```

| Prop        | Tipo                                                                                            | Default     |
| ----------- | ----------------------------------------------------------------------------------------------- | ----------- |
| `variant`   | `"primary" \| "secondary" \| "success" \| "danger" \| "soft" \| "outline" \| "ghost" \| "link"` | `"primary"` |
| `size`      | `"xs" \| "sm" \| "md" \| "lg" \| "xl"`                                                          | `"md"`      |
| `loading`   | `boolean`                                                                                       | `false`     |
| `fullWidth` | `boolean`                                                                                       | `false`     |
| `iconOnly`  | `boolean` (square, requer `aria-label`)                                                         | `false`     |
| `pill`      | `boolean` (border-radius pílula)                                                                | `false`     |
| `leftIcon`  | `ReactNode`                                                                                     | —           |
| `rightIcon` | `ReactNode`                                                                                     | —           |

**A11y**: `loading` desabilita o botão + `aria-busy="true"`. `iconOnly` exige `aria-label`.

## `Tooltip`

Hover tooltip portalado.

```tsx
<Tooltip content="Excluir permanentemente" placement="bottom" delay={300}>
  <Button variant="danger" iconOnly aria-label="Excluir">
    <Trash />
  </Button>
</Tooltip>
```

| Prop        | Tipo                                     | Default |
| ----------- | ---------------------------------------- | ------- |
| `content`   | `ReactNode`                              | —       |
| `placement` | `"top" \| "right" \| "bottom" \| "left"` | `"top"` |
| `delay`     | `number` (ms)                            | `200`   |

**A11y**: usa `role="tooltip"` + `aria-describedby` no trigger.

## `DropdownMenu`

Menu suspenso de ações. Keyboard nav (↑↓ Home End Esc).

```tsx
<DropdownMenu
  trigger={<Button variant="ghost">Mais ações</Button>}
  entries={[
    { type: "label", label: "Conta" },
    { type: "item", label: "Editar perfil", onSelect: () => navigate("/profile") },
    { type: "separator" },
    { type: "item", label: "Sair", onSelect: logout, danger: true },
  ]}
/>
```

| Entry type    | Campos                                                            |
| ------------- | ----------------------------------------------------------------- |
| `"item"`      | `label`, `icon?`, `onSelect`, `disabled?`, `danger?`, `keepOpen?` |
| `"label"`     | `label`                                                           |
| `"separator"` | (nenhum)                                                          |

**A11y**: `role="menu"` + `role="menuitem"`, focus trapping enquanto aberto.

## `Popover`

Painel flutuante genérico (anchor + outside-click + Esc dismiss).

```tsx
<Popover
  open={open}
  onOpenChange={setOpen}
  placement="bottom-start"
  trigger={<Button>Filtros</Button>}
>
  <Stack gap={3}>
    <Checkbox label="Apenas ativos" />
    <Checkbox label="Pago" />
    <Button onClick={() => setOpen(false)}>Aplicar</Button>
  </Stack>
</Popover>
```

| Prop           | Tipo                                                                                                   | Default        |
| -------------- | ------------------------------------------------------------------------------------------------------ | -------------- |
| `open`         | `boolean`                                                                                              | — (controlled) |
| `onOpenChange` | `(open: boolean) => void`                                                                              | —              |
| `placement`    | `"top" \| "top-start" \| "top-end" \| "bottom" \| "bottom-start" \| "bottom-end" \| "left" \| "right"` | `"bottom"`     |
| `trigger`      | `ReactElement` (clonado com handlers)                                                                  | —              |

**A11y**: outside-click dismissal, `Escape` fecha, focus trap opcional.

## `ConfirmDialog`

Prompt destrutivo pré-montado (Modal + 2 botões).

```tsx
<ConfirmDialog
  open={open}
  title="Excluir usuário"
  description={`Esta ação é permanente. Excluir ${user.name}?`}
  confirmLabel="Sim, excluir"
  cancelLabel="Cancelar"
  tone="danger"
  onConfirm={async () => {
    await deleteUser(user.id);
    setOpen(false);
  }}
  onCancel={() => setOpen(false)}
/>
```

| Prop           | Tipo                                                       | Default       |
| -------------- | ---------------------------------------------------------- | ------------- |
| `open`         | `boolean`                                                  | —             |
| `title`        | `ReactNode`                                                | —             |
| `description`  | `ReactNode`                                                | —             |
| `confirmLabel` | `string`                                                   | `"Confirmar"` |
| `cancelLabel`  | `string`                                                   | `"Cancelar"`  |
| `tone`         | `"default" \| "danger"`                                    | `"default"`   |
| `onConfirm`    | `() => void \| Promise<void>` (botão pode mostrar loading) | —             |
| `onCancel`     | `() => void`                                               | —             |

## A11y geral

- Ações destrutivas devem ter `variant="danger"` ou `tone="danger"`.
- `Button.loading` é o padrão para submits async — bloqueia duplos cliques.
- Tooltips não devem conter informação crítica (touch users não veem hover).
- DropdownMenu items com `keepOpen: true` não fecham após click — útil pra checkboxes/filtros.
