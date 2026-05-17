# Forms (zod)

Três níveis de integração com zod, do mais leve ao mais opinativo. Schema é a **fonte de verdade** — o tipo é inferido.

## 1. `validateForm` — agnóstico

Não requer `react-hook-form`. Útil pra formulários controlados manuais ou validação em batch.

```ts
import { validateForm } from "tempest-react-sdk";

const result = validateForm(schema, values);
if (!result.success) {
  setErrors(result.errors); // Record<path, message>
  return;
}
await save(result.data);
```

Path: dot-notation (`"address.city"`, `"items.0.name"`). Erros de root: `_root`.

## 2. `zodResolver` — react-hook-form

Substitui `@hookform/resolvers/zod` (sem dependência extra).

```ts
import { useForm } from "react-hook-form";
import { zodResolver } from "tempest-react-sdk";

const form = useForm({ resolver: zodResolver(loginSchema) });
```

## 3. `useZodForm` — tudo-em-um

```tsx
const form = useZodForm(loginSchema, { defaultValues: { email: "", password: "" } });
<form onSubmit={form.handleSubmit(login)}>
  <input {...form.register("email")} />
</form>;
```

## Padrão de schema

Mantenha schemas em `src/schemas/<dominio>.ts`, exporte o `z.infer` em `src/types/<dominio>.ts` via `declare global` se quiser tipos globais. Convenção herdada do alofans-frontend.

## Veja também

- [HTTP](./http.md) — `parseResponse` usa o mesmo zod
