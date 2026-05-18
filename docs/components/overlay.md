# Overlay

Modais, drawers, bottom sheets. Todos portalados pra `document.body`.

## `Modal`

Portal + backdrop + Esc + focus trap + scroll lock.

```tsx
const [open, setOpen] = useState(false);

<Modal
  open={open}
  onClose={() => setOpen(false)}
  title="Editar perfil"
  size="md"
  footer={
    <FormActions>
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
      <Button onClick={save}>Salvar</Button>
    </FormActions>
  }
>
  <ProfileForm />
</Modal>;
```

| Prop                 | Tipo                                             | Default |
| -------------------- | ------------------------------------------------ | ------- |
| `open`               | `boolean`                                        | —       |
| `onClose`            | `() => void`                                     | —       |
| `title`              | `ReactNode`                                      | —       |
| `size`               | `"sm" \| "md" \| "lg" \| "xl" \| "2xl" \| "3xl"` | `"md"`  |
| `footer`             | `ReactNode`                                      | —       |
| `fullscreen`         | `boolean` (ocupa 100dvh independente do size)    | `false` |
| `fullscreenOnMobile` | `boolean` (vira fullscreen abaixo de 640px)      | `false` |
| `dismissOnBackdrop`  | `boolean`                                        | `true`  |
| `dismissOnEsc`       | `boolean`                                        | `true`  |

**Safe-area**: em `fullscreen` aplica `env(safe-area-inset-*)` em todos os edges.

**A11y**: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` quando `title` é string.

## `Drawer`

Side drawer. `placement: left/right/top/bottom`. Auto-switch pra bottom-sheet em mobile via `mobilePlacement`.

```tsx
<Drawer
  open={open}
  onClose={() => setOpen(false)}
  placement="right"
  mobilePlacement="bottom" // vira bottom sheet em mobile
  size="md"
  title="Filtros"
  showHandle // drag indicator visual quando placement="bottom"
>
  <FilterForm />
</Drawer>
```

| Prop              | Tipo                                                          | Default   |
| ----------------- | ------------------------------------------------------------- | --------- |
| `open`            | `boolean`                                                     | —         |
| `onClose`         | `() => void`                                                  | —         |
| `placement`       | `"left" \| "right" \| "top" \| "bottom"`                      | `"right"` |
| `mobilePlacement` | `"left" \| "right" \| "top" \| "bottom"` (override em mobile) | —         |
| `size`            | `"sm" \| "md" \| "lg" \| "xl"`                                | `"md"`    |
| `title`           | `ReactNode`                                                   | —         |
| `showHandle`      | `boolean` (drag indicator no edge oposto)                     | `false`   |

## `BottomSheet`

Modal anchored no edge inferior — slide-up via animation. Otimizado pra mobile.

```tsx
<BottomSheet open={open} onClose={() => setOpen(false)} title="Compartilhar">
  <Stack gap={3}>
    <Button leftIcon={<MessageCircle />}>WhatsApp</Button>
    <Button leftIcon={<Mail />}>Email</Button>
    <Button leftIcon={<Link />}>Copiar link</Button>
  </Stack>
</BottomSheet>
```

| Prop                | Tipo         | Default |
| ------------------- | ------------ | ------- |
| `open`              | `boolean`    | —       |
| `onClose`           | `() => void` | —       |
| `title`             | `ReactNode`  | —       |
| `showHandle`        | `boolean`    | `true`  |
| `dismissOnBackdrop` | `boolean`    | `true`  |
| `dismissOnEsc`      | `boolean`    | `true`  |

**Safe-area**: padding-bottom automático.

**Diferença vs `Drawer`**: BottomSheet sempre slide-up + max-height 90dvh + drag handle. Use Drawer quando precisa de placement variável.

## A11y geral

- **Focus trap**: Tab cycla apenas dentro do dialog. Restaura foco no trigger ao fechar.
- **Scroll lock**: `body.overflow = "hidden"` enquanto aberto.
- **Esc** fecha (override via `dismissOnEsc={false}`).
- **`aria-modal="true"`** indica para screen readers que o resto da página está bloqueado.
- **Inert behavior**: clicks no backdrop fecham (override via `dismissOnBackdrop={false}` pra forms críticos).

## Padrões de uso

- **Modal** — fluxos centrais que pausam contexto (criar/editar registros).
- **Drawer** — painéis laterais persistentes (filtros, detalhes).
- **BottomSheet** — actions/escolhas mobile-first (compartilhar, opções).
- **ConfirmDialog** ([./actions.md](./actions.md)) — confirmação destrutiva específica.
