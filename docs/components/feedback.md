# Status & feedback

Sinalizar estado, sucesso, erro, atividade. Spinners, skeletons, alertas, KPIs.

## `Alert`

Banner inline. Diferente de `Banner` (top-of-page) e `Toast` (transient).

```tsx
<Alert variant="success" appearance="soft" title="Salvo">
  Suas alterações foram aplicadas com sucesso.
</Alert>;

<Alert
  variant="danger"
  appearance="outline"
  icon={<AlertCircle />}
  dismissible
  onDismiss={() => setOpen(false)}
>
  Falha ao processar pagamento.
</Alert>;
```

| Prop          | Tipo                                                        | Default  |
| ------------- | ----------------------------------------------------------- | -------- |
| `variant`     | `"neutral" \| "info" \| "success" \| "warning" \| "danger"` | `"info"` |
| `appearance`  | `"soft" \| "solid" \| "outline"`                            | `"soft"` |
| `title`       | `ReactNode`                                                 | —        |
| `icon`        | `ReactNode`                                                 | —        |
| `action`      | `ReactNode`                                                 | —        |
| `dismissible` | `boolean`                                                   | `false`  |
| `onDismiss`   | `() => void`                                                | —        |

**A11y**: `role="status"` para info/success, `role="alert"` para warning/danger.

## `Banner`

Persistente, top-of-page. Use para environment indicators, manutenção, expiração.

```tsx
<Banner
  variant="warning"
  dismissible
  onDismiss={() => setOpen(false)}
  action={<Button size="sm">Renovar</Button>}
>
  Sua assinatura expira em 3 dias.
</Banner>
```

Mesmas variants do Alert.

## `Badge`

Status pill — não removível.

```tsx
<Badge>Default</Badge>
<Badge variant="success">Pago</Badge>
<Badge variant="danger" appearance="solid">Atrasado</Badge>
<Badge variant="warning" appearance="outline" shape="square">Pendente</Badge>
<Badge variant="info" dot>3</Badge>
```

| Prop         | Tipo                                                                     | Default     |
| ------------ | ------------------------------------------------------------------------ | ----------- |
| `variant`    | `"neutral" \| "primary" \| "success" \| "warning" \| "danger" \| "info"` | `"neutral"` |
| `appearance` | `"soft" \| "solid" \| "outline"`                                         | `"soft"`    |
| `shape`      | `"pill" \| "square"`                                                     | `"pill"`    |
| `size`       | `"sm" \| "md" \| "lg"`                                                   | `"md"`      |
| `dot`        | `boolean` (indicador de status + número)                                 | `false`     |

## `Tag`

Chip removível. Use para filter tokens, applied filters, selected entities.

```tsx
<Tag onRemove={() => removeFilter("sp")} variant="primary">São Paulo</Tag>
<Tag size="sm">Em estoque</Tag>
```

| Prop          | Tipo                                                                     | Default     |
| ------------- | ------------------------------------------------------------------------ | ----------- |
| `variant`     | `"neutral" \| "primary" \| "success" \| "warning" \| "danger" \| "info"` | `"neutral"` |
| `size`        | `"sm" \| "md" \| "lg"`                                                   | `"md"`      |
| `onRemove`    | `() => void`                                                             | —           |
| `removeLabel` | `string` (a11y)                                                          | `"Remover"` |

## `Stat`

KPI card para dashboards.

```tsx
<Stat
  label="Receita"
  value="R$ 12.345"
  delta="+12,4%"
  hint="vs. mês anterior"
  icon={<TrendingUp />}
/>;

<Stat label="Sessões" value="1.2k" delta="-3%" hint="últimos 7 dias" />;
<Stat label="NPS" value="78" delta="0" trend="flat" />;
```

| Prop    | Tipo                       | Default                              |
| ------- | -------------------------- | ------------------------------------ |
| `label` | `ReactNode`                | —                                    |
| `value` | `ReactNode`                | —                                    |
| `delta` | `ReactNode`                | —                                    |
| `trend` | `"up" \| "down" \| "flat"` | inferido por `+`/`-` em delta string |
| `hint`  | `ReactNode`                | —                                    |
| `icon`  | `ReactNode`                | —                                    |

## `Progress`

Barra de progresso.

```tsx
<Progress value={uploadProgress} max={100} variant="primary" />;
<Progress value={100} variant="success" />;
<Progress indeterminate variant="primary" />;
```

| Prop            | Tipo                                 | Default     |
| --------------- | ------------------------------------ | ----------- |
| `value`         | `number`                             | —           |
| `max`           | `number`                             | `100`       |
| `variant`       | `"primary" \| "success" \| "danger"` | `"primary"` |
| `indeterminate` | `boolean`                            | `false`     |

## `Spinner`

Loader genérico.

```tsx
<Spinner />;
<Spinner size="lg" />;
<Center minHeight="50vh">
  <Spinner size="xl" />
</Center>;
```

| Prop   | Tipo                                   | Default |
| ------ | -------------------------------------- | ------- |
| `size` | `"xs" \| "sm" \| "md" \| "lg" \| "xl"` | `"md"`  |

## `Skeleton`

Placeholder com shimmer enquanto data carrega.

```tsx
{
  loading ? (
    <Stack gap={2}>
      <Skeleton variant="text" width="60%" />
      <Skeleton variant="text" width="40%" />
      <Skeleton variant="rect" height={120} />
    </Stack>
  ) : (
    <ActualContent />
  );
}
<Skeleton variant="circle" width={40} height={40} />;
```

| Prop      | Tipo                           | Default  |
| --------- | ------------------------------ | -------- |
| `variant` | `"rect" \| "text" \| "circle"` | `"rect"` |
| `width`   | `number \| string`             | `"100%"` |
| `height`  | `number \| string`             | —        |

## `Toast`

Notificações transientes. Setup via `ToastProvider` + uso via `useToast()`.

```tsx
// app root
<ToastProvider position="top-right" defaultDuration={4000}>
  <App />
</ToastProvider>;

// componentes
const toast = useToast();
toast.success("Salvo");
toast.error("Falha ao processar pagamento", { duration: 8000 });
toast.show({ title: "Sincronização", description: "Em andamento…", variant: "info" });
```

| `ToastApi` | Assinatura                                       |
| ---------- | ------------------------------------------------ |
| `show`     | `(options: ToastOptions) => string` (returns id) |
| `success`  | `(description, options?) => string`              |
| `error`    | `(description, options?) => string`              |
| `warning`  | `(description, options?) => string`              |
| `info`     | `(description, options?) => string`              |
| `dismiss`  | `(id: string) => void`                           |

`ToastProvider.position`: `"top-right"` (default), `"top-left"`, `"top-center"`, `"bottom-right"`, `"bottom-left"`, `"bottom-center"`.

**Safe-area aware**.

## `EmptyState`

"Nada por aqui" centralizado.

```tsx
<EmptyState
  icon={<InboxIcon />}
  title="Nenhum pedido"
  description="Quando seus clientes fizerem pedidos, eles aparecem aqui."
  action={<Button leftIcon={<Plus />}>Novo pedido</Button>}
/>
```

## `ErrorState`

Falha com botão de retry.

```tsx
<ErrorState title="Não foi possível carregar" description={String(error)} onRetry={refetch} />
```

## A11y geral

- `Alert`/`Banner` com variant `warning`/`danger` usam `role="alert"` (anunciado imediatamente).
- `Toast` container é `aria-live="polite"` + `aria-atomic="true"`.
- `Spinner`/`Progress.indeterminate` adicionam `aria-busy="true"`.
- `Skeleton` é decorativo — não anuncia (`aria-hidden`).
- `Stat.value` com tabular-nums alinha valores numéricos em colunas.
