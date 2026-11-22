# Offline-first

Os vendedores externos da Loja Aurora atendem lojistas no interior, onde o 4G some
entre uma cidade e outra. No celular, eles abrem a **central de notificações** para ver
"Pagamento aprovado — pedido #4821" e "Novo pedido de Feira de Santana". Se a tela
mostrar um spinner eterno quando o sinal cai, ninguém confia nela. 📶

Offline-first quer dizer: **a tela lê do aparelho, e a rede só atualiza o que está no
aparelho**. Com sinal, ela baixa o novo, grava no IndexedDB e mostra. Sem sinal, mostra
o que já tinha, com um aviso claro. As peças são
[`createOfflineStore`](../offline.md#setup) (IndexedDB via Dexie), o
[`useQuery`](../query.md#provider) e o
[`OfflineIndicator`](../components/feedback.md#offlineindicator).

!!! info "Antes de começar"
    Esta receita usa o cliente `api` e o store `useAuth` da receita
    [Fluxo de autenticação completo](auth-flow.md). Instalação em
    [instalação manual](../index.md#instalacao-manual). O `dexie` já vem como
    dependência do SDK.

## O que vamos construir

- 💾 Um **store local** de notificações, separado por usuário.
- 🔄 Uma **sincronização** "tenta o backend, cai para o cache".
- 📋 A **tela** com carregando, vazio, lista e o botão **Marcar todas como lidas**.
- 📡 Uma **faixa de offline** que aparece quando o sinal cai e confirma quando volta.

## O contrato com o backend

```text
GET /api/notifications
200 → [
  { "message_id": "m_4821", "owner_id": "u_7f3c", "type": "PAYMENT-SUCCESS",
    "message": "Pagamento aprovado — pedido #4821", "created_at": "2026-11-22T14:03:00Z",
    "read": false }
]

POST /api/notifications/read-all
204
```

## O código, arquivo por arquivo

### 1. O store local

```ts
// src/stores/notifications.ts
import { createOfflineStore } from "tempest-react-sdk";
import { api } from "@/lib/api";

export type Notification = {
  message_id: string;
  owner_id: string;
  type: "NOTIFY" | "PAYMENT-SUCCESS";
  message: string;
  created_at: string;
  read: boolean;
};

export const notificationsStore = createOfflineStore<Notification, string>({
  databaseName: "AuroraNotifications",
  version: 1,
  tableName: "notifications",
  indexes: "&message_id, owner_id, read, created_at",
  keyPath: "message_id",
  ownerField: "owner_id",
});

export async function syncNotifications(ownerId: string): Promise<Notification[]> {
  const fresh = await api.get<Notification[]>("/notifications").catch(() => null);
  if (fresh) await notificationsStore.bulkPut(fresh, ownerId);
  return notificationsStore.list(ownerId, {
    orderBy: "created_at",
    reverse: true,
    limit: 50,
  });
}

export async function markAllRead(ownerId: string): Promise<void> {
  await api.post<void>("/notifications/read-all");
  await notificationsStore.updateMany(ownerId, { read: true });
}
```

### 2. O hook da tela

```ts
// src/hooks/useNotifications.ts
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { markAllRead, syncNotifications, type Notification } from "@/stores/notifications";
import { useAuth } from "@/stores/auth";

interface UseNotificationsResult {
  list: UseQueryResult<Notification[]>;
  readAll: UseMutationResult<void, Error, void>;
}

export function useNotifications(): UseNotificationsResult {
  const ownerId: string = useAuth.use.user()?.id ?? "";
  const client = useQueryClient();
  const queryKey = ["notifications", ownerId];

  const list = useQuery<Notification[]>({
    queryKey,
    queryFn: () => syncNotifications(ownerId),
    enabled: ownerId !== "",
    networkMode: "always",
  });

  const readAll = useMutation<void, Error, void>({
    mutationFn: () => markAllRead(ownerId),
    onSuccess: () => client.invalidateQueries({ queryKey }),
  });

  return { list, readAll };
}
```

### 3. A tela

```tsx
// src/pages/Notifications.tsx
import {
  Badge,
  Button,
  EmptyState,
  ListTile,
  OfflineIndicator,
  Page,
  RelativeTime,
  Skeleton,
  useOnline,
  useToast,
} from "tempest-react-sdk";
import { useNotifications } from "@/hooks/useNotifications";
import type { Notification } from "@/stores/notifications";

export function Notifications() {
  const online = useOnline();
  const toast = useToast();
  const { list, readAll } = useNotifications();
  const items: Notification[] = list.data ?? [];
  const unread = items.filter((item) => !item.read).length;

  function onReadAll(): void {
    readAll.mutate(undefined, {
      onError: () => toast.error("Sem conexão. Tente marcar como lidas quando o sinal voltar."),
    });
  }

  return (
    <Page
      title="Notificações"
      description={unread > 0 ? `${unread} não lidas` : "Tudo em dia"}
      actions={
        <Button
          size="sm"
          variant="soft"
          disabled={!online || unread === 0}
          loading={readAll.isPending}
          onClick={onReadAll}
        >
          Marcar todas como lidas
        </Button>
      }
    >
      <OfflineIndicator
        position="top"
        offlineLabel="Você está offline. Mostrando as notificações salvas no aparelho."
        onlineLabel="Conexão de volta. Atualizando…"
      />
      {list.isLoading ? (
        <div style={{ display: "grid", gap: 8 }}>
          <Skeleton height={56} />
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhuma notificação"
          description="Pagamentos aprovados e pedidos novos aparecem aqui."
        />
      ) : (
        items.map((item) => (
          <ListTile
            key={item.message_id}
            title={item.message}
            subtitle={<RelativeTime date={item.created_at} />}
            trailing={item.read ? null : <Badge variant="primary">Nova</Badge>}
          />
        ))
      )}
    </Page>
  );
}
```

## Pedaço por pedaço

### O store é separado por dono

`createOfflineStore<Notification, string>` empacota o Dexie. `indexes` usa a sintaxe do
Dexie: `&message_id` é a chave primária única, e o resto vira índice. Com
`ownerField: "owner_id"`, toda operação recebe o id do usuário e **só enxerga os
registros dele**. Se outra pessoa entrar no mesmo celular, ela não vê as notificações
da anterior. Veja [Owner-scoping](../offline.md#owner-scoping).

### A sincronização sempre lê do aparelho

`syncNotifications` faz três coisas, nesta ordem:

1. Tenta o backend. Se a rede falhar, o `.catch(() => null)` engole o erro.
2. Se veio resposta, grava tudo com `bulkPut`, numa transação só.
3. **Sempre** devolve o que está no IndexedDB, das mais novas para as mais antigas.

O resultado é o mesmo código para online e offline. A tela não precisa saber de onde
os dados vieram.

### `networkMode: "always"` é o detalhe que faz funcionar

Por padrão, o TanStack Query **pausa** uma query quando o navegador está offline: a
`queryFn` nem roda. Num app comum, isso é bom. Aqui, seria um spinner eterno, porque é
justamente a `queryFn` que lê o IndexedDB. `networkMode: "always"` manda a query rodar
de qualquer jeito, e o fallback para o cache acontece.

!!! tip "A volta do sinal atualiza sozinha"
    `refetchOnReconnect` vem ligado no TanStack Query. Quando o sinal volta, a query
    roda de novo, baixa o que chegou e a lista se atualiza sem ninguém puxar a tela.

### A tela cobre os estados

- ⏳ **Primeira carga**: três `Skeleton` na altura de uma linha.
- 🫙 **Vazio**: `EmptyState` explicando o que vai aparecer ali.
- 📋 **Lista**: `ListTile` com a mensagem, o tempo relativo ("há 5 minutos") e um
  `Badge` nas não lidas.
- 📡 **Offline**: o `OfflineIndicator` aparece no topo e confirma quando a conexão
  volta. Ele usa `useOnline` por dentro e não renderiza nada online.
- ❌ **Falha ao marcar como lidas**: `toast.error`, e o botão fica desabilitado
  enquanto `useOnline()` diz que não há rede.

### E no celular? 📱

É onde esta tela vive. `ListTile` ocupa a largura toda e tem área de toque generosa,
e o botão de ação fica no cabeçalho do `Page`, ao alcance do polegar. O
`OfflineIndicator` com `position="top"` não briga com a barra de navegação de baixo.

!!! warning "Escrita offline precisa de fila"
    `markAllRead` chama o backend **antes** de mudar o IndexedDB. Se ela mudasse só o
    local, a próxima sincronização traria `read: false` de volta do servidor. Por isso
    o botão fica desabilitado offline. Para gravar offline de verdade e reenviar
    quando o sinal voltar, use a fila de saída do
    [`createOfflineSync`](../offline-sync.md#o-jeito-rapido-createofflinesync), mostrada
    na receita [App de campo offline](field-app-offline.md).

!!! note "IndexedDB não é para estado de tela"
    Guarde no IndexedDB o que precisa **sobreviver ao F5**: histórico, rascunho,
    cache. Aba ativa, modal aberto e spinner ficam no Zustand ou no `useState`. Veja
    [State](../state.md).

## Recap

- ✅ `createOfflineStore` com `ownerField` guarda os dados no aparelho, separados por
  usuário.
- ✅ A sincronização tenta o backend, grava com `bulkPut` e **sempre** lê do store
  local.
- ✅ `networkMode: "always"` deixa a query rodar offline e cair no cache.
- ✅ `OfflineIndicator`, `Skeleton`, `EmptyState` e `ListTile` cobrem os estados da
  tela.
- ✅ Escrita que precisa funcionar offline vai para a fila do `createOfflineSync`.
