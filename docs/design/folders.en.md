# Folder structure

[Layers](architecture.md) are a concept. Folders are where the concept meets the
disk — and where most apps slip, because the most obvious structure
(`components/`, `hooks/`, `services/`, `types/`) is the one that ages worst.

## By file type doesn't scale

Start with the structure every tutorial shows:

```text
src/
├── components/     ← 84 files
├── hooks/          ← 31 files
├── services/       ← 22 files
└── types/          ← 19 files
```

Now answer: **which of those files make up the orders screen?**

You don't know. To touch orders you open four folders, each with dozens of
irrelevant neighbours. To delete orders you hunt file by file and leave three
orphans behind.

!!! danger "The symptom is `git status`"
    If a PR for a single feature touches files in 4 different folders and none of
    them is named after the feature, the structure is grouping by the wrong thing.

The problem is that `components/`, `hooks/` and `services/` group by **how the
file was written**. You never need "all the hooks". You need "everything that is
orders".

## Group by feature

```text
src/
├── main.tsx                      # bootstrap
├── App.tsx                       # providers + router
├── routes.tsx                    # URL map
│
├── lib/                          # INFRA — exists once in the app
│   ├── api.ts                    # createApiClient
│   ├── logger.ts                 # createLogger
│   └── storage.ts
│
├── stores/                       # global client state
│   └── auth.ts                   # createAuthStore
│
├── layouts/                      # screen shells
│   └── RootLayout.tsx
│
├── components/                   # APP UI without domain (rare — the SDK covers it)
│   └── MoneyInput/
│
├── features/                     # ⭐ the body of the app
│   ├── orders/
│   │   ├── index.ts              # the feature's public API
│   │   ├── orders.schema.ts      # zod + domain types
│   │   ├── orders.service.ts     # talks to the backend
│   │   ├── use-orders.ts         # query/mutation hooks
│   │   ├── use-orders.test.ts
│   │   ├── OrderTable.tsx
│   │   ├── OrderTable.test.tsx
│   │   ├── OrderStatusBadge.tsx
│   │   └── OrderTable.module.css
│   └── customers/
│       └── …
│
└── pages/                        # one screen per route
    ├── Orders.tsx
    └── OrderDetail.tsx
```

`create-tempest-app` already generates `lib/`, `stores/`, `layouts/`, `pages/` and
`routes.tsx` — see [Scaffold](../scaffold.md). `features/` is what **you** add when
the first feature shows up.

!!! tip "Tests live next to the file they test"
    `OrderTable.test.tsx` sits next to `OrderTable.tsx`, not in a parallel
    `__tests__/` tree. Two reasons: one `ls` tells you whether something is tested,
    and moving the feature moves its tests with it.

## `index.ts`: the feature's public API

A feature is a box. `index.ts` is what comes out of the box:

```ts
// src/features/orders/index.ts

/**
 * Public surface of the orders feature. Anything not re-exported here is an
 * internal detail — other features and pages must not import it directly.
 */
export { OrderTable } from "./OrderTable";
export { useOrders } from "./use-orders";
export { usePayOrder } from "./use-pay-order";
export type { Order, OrderStatus } from "./orders.schema";
```

And consuming it:

=== "✅ Right"

    ```tsx
    import { OrderTable, useOrders } from "@/features/orders";
    ```

=== "❌ Wrong"

    ```tsx
    import { OrderTable } from "@/features/orders/OrderTable";
    import { buildOrderQuery } from "@/features/orders/internal/query-builder";
    ```

    The second import ties another part of the app to an internal detail. Renaming
    `query-builder.ts` is now a breaking change.

!!! info "Two barrel rules, and they look contradictory"
    **Outside the feature**, always import through `index.ts` — that's the
    contract. **Inside the feature**, import the direct path
    (`./orders.service`), never your own barrel — an internal barrel creates import
    cycles and makes Vite reprocess the whole feature on every edit.

## When to create a feature folder

Don't create `features/` on day one. The trigger is objective:

| Situation                                                        | Where it goes                                  |
| ---------------------------------------------------------------- | ---------------------------------------------- |
| One component, used on one page, no service                      | stays in the page itself or in `components/`     |
| Two or more files sharing the same domain type                   | **create `features/<domain>/`**                  |
| Has a service (talks to the backend) + a component               | **create `features/<domain>/`**                  |
| Component with no domain type at all, reused in 2+ features      | `components/` — or a candidate for the SDK       |

The folder name is the **domain**, not the screen: `orders`, not `orders-page`;
`billing`, not `billing-tab`.

!!! warning "A feature doesn't import another feature's internals"
    `features/billing` may import `features/orders` — **through its `index.ts`**.
    When two features start pulling at each other's details all the time, they were
    one feature, or there is a third shared concept nobody extracted yet (then yes:
    `features/shared/` or `lib/`).

## Naming convention

Predictable names save more time than any search tool.

| File type            | Pattern                     | Example                    |
| -------------------- | --------------------------- | -------------------------- |
| Component            | `PascalCase.tsx`            | `OrderTable.tsx`           |
| Test                 | `<file>.test.tsx`           | `OrderTable.test.tsx`      |
| CSS Module           | `<Component>.module.css`    | `OrderTable.module.css`    |
| Hook                 | `use-<thing>.ts`            | `use-orders.ts`            |
| Service              | `<domain>.service.ts`       | `orders.service.ts`        |
| Domain schema/types  | `<domain>.schema.ts`        | `orders.schema.ts`         |
| Zustand store        | `<domain>.ts` in `stores/`  | `stores/auth.ts`           |
| Utility              | `kebab-case.ts`             | `format-invoice.ts`        |

The **exported** identifier is always `PascalCase` for a component and
`camelCase` for a function — the `kebab-case` is only the file name, which avoids
case conflicts between a case-insensitive filesystem (macOS) and Linux in CI.

## Import with `@/`, always

The `@` → `src` alias comes configured by
[`createViteConfig`](../vite-config.md). Use it for anything that crosses folders:

=== "✅ Right"

    ```ts
    import { api } from "@/lib/api";
    import { useOrders } from "@/features/orders";

    import { OrderRow } from "./OrderRow";
    ```

=== "❌ Wrong"

    ```ts
    import { api } from "../../../lib/api";
    ```

Relative (`./`) only between siblings in the same directory. `../../../` is a sign
that you are crossing a boundary **or** that the file is in the wrong folder.

!!! tip "`tempest fix` converts this for you"
    ```bash
    npx tempest fix --dry-run   # lists what would be rewritten
    npx tempest fix             # applies: ../../../ → @/, sorts imports, drops dead ones
    ```
    Details in [tempest CLI](../cli.md).

## Import order

Three blocks separated by a blank line — this is what the scaffold template's
`simple-import-sort` already enforces:

```ts
import { useState } from "react";                    // 1. external
import { Button, DataTable } from "tempest-react-sdk";

import { api } from "@/lib/api";                     // 2. app (@/)
import { useOrders } from "@/features/orders";

import { OrderRow } from "./OrderRow";               // 3. relative
import styles from "./OrderTable.module.css";
```

Not fussiness: with a fixed order, the diff for a new import is one line, not a
reshuffle of the whole block.

## Recap

- Grouping by **file type** doesn't scale; grouping by **feature** does.
- A feature is a box: `index.ts` is the contract, the rest is internal.
- Inside the feature use direct paths; from outside use only the barrel.
- Trigger to create a feature: **2+ files with the same domain**, or service +
  component.
- `PascalCase` file names for components, `kebab-case` for everything else; `@/`
  to cross folders and `tempest fix` to keep it that way.

Next: [Data flow](data-flow.md) — who is allowed to talk to the backend.
