# Estrutura de pastas

As [camadas](architecture.md) são um conceito. Pasta é onde o conceito encosta no
disco — e é onde a maioria dos apps escorrega, porque a estrutura mais óbvia
(`components/`, `hooks/`, `services/`, `types/`) é a que envelhece pior.

## Por tipo de arquivo não escala

Comece com a estrutura que todo tutorial mostra:

```text
src/
├── components/     ← 84 arquivos
├── hooks/          ← 31 arquivos
├── services/       ← 22 arquivos
└── types/          ← 19 arquivos
```

Agora responda: **quais desses arquivos formam a tela de pedidos?**

Você não sabe. Pra mexer em pedidos você abre quatro pastas, cada uma com dezenas
de vizinhos irrelevantes. Pra apagar pedidos você caça arquivo por arquivo e
deixa três órfãos.

!!! danger "O sintoma é o `git status`"
    Se um PR de uma única feature toca arquivos em 4 pastas diferentes e nenhuma
    delas se chama como a feature, a estrutura está agrupando pela coisa errada.

O problema é que `components/`, `hooks/` e `services/` agrupam por **como o
arquivo foi escrito**. Você nunca precisa "de todos os hooks". Você precisa
"de tudo que é pedido".

## Agrupe por feature

```text
src/
├── main.tsx                      # bootstrap
├── App.tsx                       # providers + router
├── routes.tsx                    # mapa de URLs
│
├── lib/                          # INFRA — existe uma vez no app
│   ├── api.ts                    # createApiClient
│   ├── logger.ts                 # createLogger
│   └── storage.ts
│
├── stores/                       # estado global de cliente
│   └── auth.ts                   # createAuthStore
│
├── layouts/                      # cascas de tela
│   └── RootLayout.tsx
│
├── components/                   # UI DO APP sem domínio (raro — o SDK cobre)
│   └── MoneyInput/
│
├── features/                     # ⭐ o corpo do app
│   ├── orders/
│   │   ├── index.ts              # API pública da feature
│   │   ├── orders.schema.ts      # zod + tipos do domínio
│   │   ├── orders.service.ts     # fala com o backend
│   │   ├── use-orders.ts         # hooks de query/mutation
│   │   ├── use-orders.test.ts
│   │   ├── OrderTable.tsx
│   │   ├── OrderTable.test.tsx
│   │   ├── OrderStatusBadge.tsx
│   │   └── OrderTable.module.css
│   └── customers/
│       └── …
│
└── pages/                        # uma tela por rota
    ├── Orders.tsx
    └── OrderDetail.tsx
```

O `create-tempest-app` já gera `lib/`, `stores/`, `layouts/`, `pages/` e
`routes.tsx` — veja [Scaffold](../scaffold.md). `features/` é o que **você**
adiciona quando a primeira feature aparece.

!!! tip "Teste mora ao lado do arquivo testado"
    `OrderTable.test.tsx` fica junto de `OrderTable.tsx`, não numa árvore
    `__tests__/` paralela. Duas razões: você vê num `ls` se algo tem teste, e
    mover a feature move os testes com ela.

## `index.ts`: a API pública da feature

Uma feature é uma caixa. O `index.ts` é o que sai da caixa:

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

E o consumo:

=== "✅ Certo"

    ```tsx
    import { OrderTable, useOrders } from "@/features/orders";
    ```

=== "❌ Errado"

    ```tsx
    import { OrderTable } from "@/features/orders/OrderTable";
    import { buildOrderQuery } from "@/features/orders/internal/query-builder";
    ```

    O segundo import amarra outra parte do app a um detalhe interno. Renomear
    `query-builder.ts` agora é breaking change.

!!! info "Duas regras de barrel, e elas parecem contraditórias"
    **Fora da feature**, importe sempre pelo `index.ts` — é o contrato.
    **Dentro da feature**, importe o caminho direto (`./orders.service`), nunca
    o próprio barrel — barrel interno cria ciclo de import e faz o Vite
    reprocessar a feature inteira a cada edição.

## Quando criar uma pasta de feature

Não crie `features/` no primeiro dia. O gatilho é objetivo:

| Situação                                                           | Onde vai                                        |
| ------------------------------------------------------------------ | ----------------------------------------------- |
| Um componente, usado numa página só, sem serviço                   | fica na própria página ou em `components/`       |
| Dois ou mais arquivos que compartilham o mesmo tipo de domínio     | **cria `features/<domínio>/`**                   |
| Tem serviço (fala com backend) + componente                        | **cria `features/<domínio>/`**                   |
| Componente sem nenhum tipo de domínio, reusado em 2+ features      | `components/` — ou candidato a subir pro SDK     |

O nome da pasta é o **domínio**, não a tela: `orders`, não `orders-page`;
`billing`, não `billing-tab`.

!!! warning "Feature não importa o miolo de outra feature"
    `features/billing` pode importar `features/orders` — **pelo `index.ts`**.
    Quando duas features começam a puxar detalhe uma da outra toda hora, elas
    eram uma feature só, ou existe um terceiro conceito compartilhado que
    ninguém extraiu ainda (aí sim: `features/shared/` ou `lib/`).

## Convenção de nomes

Nome previsível economiza mais tempo que qualquer ferramenta de busca.

| Tipo de arquivo         | Padrão                | Exemplo                    |
| ----------------------- | --------------------- | -------------------------- |
| Componente              | `PascalCase.tsx`      | `OrderTable.tsx`           |
| Teste                   | `<arquivo>.test.tsx`  | `OrderTable.test.tsx`      |
| CSS Module              | `<Componente>.module.css` | `OrderTable.module.css` |
| Hook                    | `use-<coisa>.ts`      | `use-orders.ts`            |
| Serviço                 | `<domínio>.service.ts` | `orders.service.ts`       |
| Schema/tipos do domínio | `<domínio>.schema.ts` | `orders.schema.ts`         |
| Store Zustand           | `<domínio>.ts` em `stores/` | `stores/auth.ts`     |
| Utilitário              | `kebab-case.ts`       | `format-invoice.ts`        |

O identificador **exportado** é sempre `PascalCase` pra componente e
`camelCase` pra função — o `kebab-case` é só do nome de arquivo, o que evita
conflito de case em filesystem case-insensitive (macOS) contra Linux no CI.

## Import com `@/`, sempre

O alias `@` → `src` vem configurado pelo
[`createViteConfig`](../vite-config.md). Use ele pra tudo que cruza pasta:

=== "✅ Certo"

    ```ts
    import { api } from "@/lib/api";
    import { useOrders } from "@/features/orders";

    import { OrderRow } from "./OrderRow";
    ```

=== "❌ Errado"

    ```ts
    import { api } from "../../../lib/api";
    ```

Relativo (`./`) só entre irmãos do mesmo diretório. `../../../` é sinal de que
você está furando uma fronteira **ou** de que o arquivo está na pasta errada.

!!! tip "`tempest fix` converte isso pra você"
    ```bash
    npx tempest fix --dry-run   # lista o que seria reescrito
    npx tempest fix             # aplica: ../../../ → @/, ordena imports, remove import morto
    ```
    Detalhes em [CLI tempest](../cli.md).

## Ordem dos imports

Três blocos, separados por linha em branco — é o que o
`simple-import-sort` do template já impõe:

```ts
import { useState } from "react";                    // 1. externos
import { Button, DataTable } from "tempest-react-sdk";

import { api } from "@/lib/api";                     // 2. do app (@/)
import { useOrders } from "@/features/orders";

import { OrderRow } from "./OrderRow";               // 3. relativos
import styles from "./OrderTable.module.css";
```

Não é frescura: com ordem fixa, o diff de um import novo é uma linha, não uma
reorganização do bloco inteiro.

## Recap

- Agrupar por **tipo de arquivo** não escala; agrupar por **feature** escala.
- Feature é caixa: `index.ts` é o contrato, o resto é interno.
- Dentro da feature use caminho direto; de fora use só o barrel.
- Gatilho pra criar feature: **2+ arquivos com o mesmo domínio**, ou serviço +
  componente.
- Nome de arquivo `PascalCase` pra componente, `kebab-case` pro resto; `@/` pra
  cruzar pasta e `tempest fix` pra manter isso.

Próxima: [Fluxo de dados](data-flow.md) — quem tem permissão de falar com o
backend.
