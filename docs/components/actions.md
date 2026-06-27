# Ação

Componentes de **ação** são o ponto onde o usuário dispara algo: clicar, escolher numa lista, confirmar. Eles carregam intenção — um clique muda dados, navega, ou inicia um fluxo. Por isso a categoria reúne tanto o gatilho direto (`Button`) quanto os elementos que cercam uma ação: dica contextual (`Tooltip`), conjunto de ações secundárias (`DropdownMenu`), painel ancorado (`Popover`) e a salvaguarda antes de algo destrutivo (`ConfirmDialog`).

Use esta página quando precisar que o usuário **faça** algo. Para entrada de dados (texto, seleção, datas) veja [inputs](./inputs.md); para apresentar coleções, veja [data](./data.md).

## `Button`

> **Quando usar**: a ação primária ou secundária de qualquer tela — submeter um form, abrir um modal, navegar. É o gatilho de ação por padrão.

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

!!! warning "iconOnly precisa de rótulo acessível"
    `iconOnly` remove o texto visível, então leitores de tela não têm o que anunciar. Sempre passe `aria-label` descrevendo a ação (`aria-label="Excluir"`). Sem isso o botão é um ícone mudo para tecnologia assistiva.

!!! tip "loading bloqueia duplo clique"
    `loading` desabilita o botão e seta `aria-busy="true"` — é o padrão para submits assíncronos. Ative-o assim que disparar a request para evitar requisições duplicadas por cliques repetidos.

## `Tooltip`

> **Quando usar**: dar contexto extra a um controle cujo significado não é óbvio — tipicamente botões `iconOnly`. Nunca para informação crítica.

Hover tooltip portalado. Aparece no hover **e** no foco por teclado.

```tsx
<Tooltip content="Excluir permanentemente" placement="bottom" openDelay={300}>
  <Button variant="danger" iconOnly aria-label="Excluir">
    <Trash />
  </Button>
</Tooltip>
```

| Prop        | Tipo                                     | Default |
| ----------- | ---------------------------------------- | ------- |
| `content`   | `ReactNode`                              | —       |
| `placement` | `"top" \| "right" \| "bottom" \| "left"` | `"top"` |
| `openDelay` | `number` (ms antes de aparecer)          | `150`   |
| `disabled`  | `boolean` (desliga sem mexer no trigger) | `false` |

!!! warning "Não esconda informação essencial num tooltip"
    Usuários de touch não têm hover — eles nunca verão o conteúdo. Tooltip é reforço, não a única fonte de uma informação necessária para concluir a tarefa.

## `DropdownMenu`

> **Quando usar**: agrupar ações secundárias atrás de um único gatilho ("Mais ações", menu de perfil) quando elas não cabem na barra principal.

Menu suspenso de ações. Navegação por teclado (↑↓ Home End Esc). Cada entrada precisa de um `id` estável (usado como key do React).

```tsx
<DropdownMenu
  trigger={<Button variant="ghost">Mais ações</Button>}
  items={[
    { type: "label", id: "h", label: "Conta" },
    { type: "item", id: "edit", label: "Editar perfil", onSelect: () => navigate("/profile") },
    { type: "separator", id: "s1" },
    { type: "item", id: "logout", label: "Sair", onSelect: logout, danger: true },
  ]}
/>
```

| Entry type    | Campos                                                     |
| ------------- | ---------------------------------------------------------- |
| `"item"`      | `id`, `label`, `icon?`, `onSelect`, `disabled?`, `danger?` |
| `"label"`     | `id`, `label`                                              |
| `"separator"` | `id`                                                       |

Props do componente: `trigger` (`ReactElement`), `items` (`DropdownMenuEntry[]`), `placement` (`"bottom-start" \| "bottom-end" \| "top-start" \| "top-end"`, default `"bottom-start"`).

!!! note "Fecha após selecionar"
    Selecionar um item dispara `onSelect` e fecha o menu. Para um painel que permanece aberto com múltiplas escolhas (checkboxes, filtros), use `Popover` em vez de `DropdownMenu`.

## `Popover`

> **Quando usar**: um painel flutuante com conteúdo arbitrário (filtros, mini-form, preview) ancorado a um gatilho — quando você precisa de mais que uma lista de ações.

Painel flutuante genérico (anchor + outside-click + Esc dismiss). Funciona controlado (`open` + `onOpenChange`) ou não-controlado (`defaultOpen`).

```tsx
<Popover
  open={open}
  onOpenChange={setOpen}
  placement="bottom"
  trigger={<Button>Filtros</Button>}
>
  <Stack gap={3}>
    <Checkbox label="Apenas ativos" />
    <Checkbox label="Pago" />
    <Button onClick={() => setOpen(false)}>Aplicar</Button>
  </Stack>
</Popover>
```

| Prop                  | Tipo                                     | Default        |
| --------------------- | ---------------------------------------- | -------------- |
| `trigger`             | `ReactElement` (clonado com handlers)    | —              |
| `open`                | `boolean`                                | — (controlled) |
| `onOpenChange`        | `(open: boolean) => void`                | —              |
| `defaultOpen`         | `boolean` (uso não-controlado)           | `false`        |
| `placement`           | `"top" \| "bottom" \| "left" \| "right"` | `"bottom"`     |
| `closeOnEsc`          | `boolean`                                | `true`         |
| `closeOnOutsideClick` | `boolean`                                | `true`         |

!!! note "Sem collision detection"
    O `Popover` não reposiciona automaticamente quando esbarra na borda da viewport. Se você precisa de flip/shift automático, prefira o `DropdownMenu` (lista simples) ou integre Floating UI no app.

## `ConfirmDialog`

> **Quando usar**: a última barreira antes de uma ação irreversível ou cara (excluir, sobrescrever, cancelar). Sempre com `variant="danger"` quando destrutiva.

Prompt destrutivo pré-montado em cima do [`Modal`](./overlay.md) (texto + 2 botões).

```tsx
<ConfirmDialog
  open={open}
  title="Excluir usuário"
  description={`Esta ação é permanente. Excluir ${user.name}?`}
  confirmLabel="Sim, excluir"
  cancelLabel="Cancelar"
  variant="danger"
  loading={deleting}
  onConfirm={async () => {
    await deleteUser(user.id);
    setOpen(false);
  }}
  onCancel={() => setOpen(false)}
/>
```

| Prop           | Tipo                                                    | Default       |
| -------------- | ------------------------------------------------------- | ------------- |
| `open`         | `boolean`                                               | —             |
| `title`        | `ReactNode`                                             | —             |
| `description`  | `ReactNode`                                             | —             |
| `confirmLabel` | `string`                                                | `"Confirmar"` |
| `cancelLabel`  | `string`                                                | `"Cancelar"`  |
| `variant`      | `"primary" \| "danger"`                                 | `"primary"`   |
| `loading`      | `boolean` (mostra spinner + desabilita ambos os botões) | `false`       |
| `onConfirm`    | `() => void \| Promise<void>`                           | —             |
| `onCancel`     | `() => void`                                            | —             |

!!! tip "Controle o loading durante a request"
    `onConfirm` aceita uma promise, mas o `ConfirmDialog` não gerencia o estado de loading sozinho — passe `loading={deleting}` controlado pelo seu estado para travar ambos os botões enquanto a ação assíncrona corre.

## Resumo

| Componente      | Use para                                       | Gatilho    |
| --------------- | ---------------------------------------------- | ---------- |
| `Button`        | Disparar a ação primária/secundária            | clique     |
| `Tooltip`       | Contexto não-crítico num controle              | hover/foco |
| `DropdownMenu`  | Lista de ações secundárias (fecha ao escolher) | clique     |
| `Popover`       | Painel flutuante com conteúdo arbitrário       | clique     |
| `ConfirmDialog` | Confirmar ação destrutiva antes de executar    | —          |

Pontos-chave de acessibilidade:

- Ações destrutivas devem usar `variant="danger"`.
- `Button.loading` é o padrão para submits async — bloqueia duplos cliques.
- Tooltips não devem conter informação crítica (usuários de touch não veem hover).
- `iconOnly` **exige** `aria-label`.

Relacionados: [overlay](./overlay.md) (`ConfirmDialog` é construído sobre `Modal`) · [inputs](./inputs.md) (entrada de dados) · [feedback](./feedback.md) (toasts/alerts após a ação).
