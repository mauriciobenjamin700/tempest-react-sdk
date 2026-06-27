# Overlay

Componentes de **overlay** interrompem o fluxo principal para focar a atenção numa tarefa isolada — eles aparecem _por cima_ da página, com backdrop, e capturam o foco até serem fechados. Use-os quando o usuário precisa lidar com algo (editar um registro, confirmar, escolher uma opção) sem perder o contexto da tela de fundo, mas sem poder ignorá-lo.

Os três compartilham o mesmo motor (portal para `document.body` + backdrop + Esc + focus trap + scroll lock) e diferem só na ancoragem e na vocação:

- `Modal` — centralizado, propósito geral.
- `Drawer` — ancorado a uma borda, painel lateral.
- `BottomSheet` — ancorado embaixo, mobile-first.

!!! info "Tudo é portalado"
    Os três renderizam em `document.body`, fora da árvore do componente que os invoca. Isso evita problemas de `overflow: hidden` / `z-index` de ancestrais, mas significa que estilos com escopo no pai não vazam para dentro do overlay.

## `Modal`

> **Quando usar**: um fluxo central que pausa o contexto — criar/editar um registro, um wizard curto, um form que exige atenção total.

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

!!! tip "Safe-area em fullscreen"
    Em `fullscreen` o Modal aplica `env(safe-area-inset-*)` em todos os edges, respeitando notch e barra de gestos. Use `fullscreenOnMobile` para um modal denso virar tela cheia abaixo de 640px em vez de espremer num cartão minúsculo.

**A11y**: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` quando `title` é string. O foco fica preso dentro do dialog e volta ao trigger ao fechar.

## `Drawer`

> **Quando usar**: um painel lateral persistente que complementa a tela de fundo — filtros, detalhes de um item, navegação secundária. Encosta numa borda em vez de centralizar.

Side drawer. `placement: left/right/top/bottom`. Auto-switch pra bottom-sheet em mobile via `mobilePlacement`.

```tsx
<Drawer
  open={open}
  onClose={() => setOpen(false)}
  placement="right"
  mobilePlacement="bottom" // vira bottom sheet em mobile
  title="Filtros"
  showHandle // drag indicator visual quando vira bottom-sheet
  footer={<Button onClick={apply}>Aplicar</Button>}
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
| `title`           | `ReactNode`                                                   | —         |
| `footer`          | `ReactNode`                                                   | —         |
| `showHandle`      | `boolean` (drag indicator estilo bottom-sheet)                | `false`   |
| `hideCloseButton` | `boolean`                                                     | `false`   |
| `closeOnBackdrop` | `boolean`                                                     | `true`    |
| `closeOnEsc`      | `boolean`                                                     | `true`    |

!!! note "Drawer dimensiona pelo conteúdo, não por `size`"
    Diferente do `Modal`, o `Drawer` não tem prop `size` — a largura/altura segue o conteúdo (e o CSS do placement). Para um painel mobile-first com largura total e altura limitada, prefira `BottomSheet` ou `mobilePlacement="bottom"`.

## `BottomSheet`

> **Quando usar**: ações ou escolhas mobile-first que sobem do rodapé — menu de compartilhar, opções de um item, seletor curto. É o padrão nativo de iOS/Android.

Modal ancorado na borda inferior — slide-up via animation. Otimizado pra mobile.

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

!!! tip "Safe-area automática"
    O `BottomSheet` adiciona `padding-bottom` respeitando `env(safe-area-inset-bottom)`, então os controles não ficam escondidos atrás da barra de gestos em iPhones/Androids modernos.

**Diferença vs `Drawer`**: BottomSheet é sempre slide-up + max-height 90dvh + drag handle. Use `Drawer` quando precisa de placement variável (lateral/topo) ou de comportamento diferente entre desktop e mobile.

!!! warning "Cuidado ao desligar `closeOnBackdrop`/`dismissOnBackdrop`"
    Desabilitar o dismiss por backdrop ou Esc prende o usuário no overlay até concluir a tarefa. Faça isso só em forms verdadeiramente críticos (perda de dados) — caso contrário sempre ofereça uma saída clara, ou a navegação por teclado vira uma armadilha.

## A11y geral

- **Focus trap**: Tab circula apenas dentro do dialog. Restaura o foco no trigger ao fechar.
- **Scroll lock**: `body.overflow = "hidden"` enquanto aberto.
- **Esc** fecha (`Modal`/`BottomSheet`: `dismissOnEsc={false}`; `Drawer`: `closeOnEsc={false}`).
- **`aria-modal="true"`** indica para leitores de tela que o resto da página está bloqueado.
- **Backdrop**: clicks fecham (`Modal`/`BottomSheet`: `dismissOnBackdrop={false}`; `Drawer`: `closeOnBackdrop={false}`).

## Resumo

| Componente    | Ancoragem        | Vocação                           | Prop de dismiss                    |
| ------------- | ---------------- | --------------------------------- | ---------------------------------- |
| `Modal`       | centralizado     | fluxos centrais (criar/editar)    | `dismissOnBackdrop`/`dismissOnEsc` |
| `Drawer`      | borda (variável) | painéis laterais persistentes     | `closeOnBackdrop`/`closeOnEsc`     |
| `BottomSheet` | borda inferior   | ações mobile-first (compartilhar) | `dismissOnBackdrop`/`dismissOnEsc` |

Para confirmação destrutiva pré-montada, use o `ConfirmDialog` ([actions](./actions.md)), construído sobre o `Modal`.

Relacionados: [actions](./actions.md) (`ConfirmDialog`, botões no `footer`) · [inputs](./inputs.md) (forms dentro do overlay) · [navigation](./navigation.md) (`Drawer` como nav secundária).
