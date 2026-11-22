# Offline-first

Loja Aurora's field sellers visit shopkeepers in the countryside, where 4G vanishes
between one town and the next. On their phones, they open the **notification centre**
to see "Pagamento aprovado — pedido #4821" (payment approved) and "Novo pedido de Feira
de Santana" (new order). If the screen shows an endless spinner when the signal drops,
nobody trusts it. 📶

Offline-first means: **the screen reads from the device, and the network only updates
what is on the device**. With signal, it downloads what is new, writes it to IndexedDB
and shows it. Without signal, it shows what it already had, with a clear notice. The
pieces are [`createOfflineStore`](../offline.md#setup) (IndexedDB via Dexie),
[`useQuery`](../query.md#provider) and
[`OfflineIndicator`](../components/feedback.md#offlineindicator).

!!! info "Before you start"
    This recipe uses the `api` client and the `useAuth` store from the
    [Full authentication flow](auth-flow.md) recipe. Install in
    [manual install](../index.md#manual-install). `dexie` already ships as an SDK
    dependency.

## What we are building

- 💾 A **local store** of notifications, kept apart per user.
- 🔄 A **sync** that "tries the backend, falls back to the cache".
- 📋 The **screen** with loading, empty, the list and the **Marcar todas como lidas**
  (mark all as read) button.
- 📡 An **offline banner** that shows when the signal drops and confirms when it comes
  back.

## The backend contract

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

## The code, file by file

### 1. The local store

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

### 2. The screen's hook

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

### 3. The screen

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

## Piece by piece

### The store is kept apart per owner

`createOfflineStore<Notification, string>` wraps Dexie. `indexes` uses Dexie's syntax:
`&message_id` is the unique primary key, and the rest become indexes. With
`ownerField: "owner_id"`, every operation takes the user id and **only sees that
user's records**. If someone else signs in on the same phone, they do not see the
previous person's notifications. See [Owner-scoping](../offline.md#owner-scoping).

### The sync always reads from the device

`syncNotifications` does three things, in this order:

1. Tries the backend. If the network fails, `.catch(() => null)` swallows the error.
2. If an answer came, writes everything with `bulkPut`, in a single transaction.
3. **Always** returns what is in IndexedDB, newest first.

The result is the same code online and offline. The screen does not need to know where
the data came from.

### `networkMode: "always"` is the detail that makes it work

By default, TanStack Query **pauses** a query while the browser is offline: the
`queryFn` does not even run. In a regular app, that is good. Here it would be an
endless spinner, because the `queryFn` is exactly what reads IndexedDB.
`networkMode: "always"` makes the query run anyway, and the fallback to the cache
happens.

!!! tip "The signal coming back refreshes on its own"
    `refetchOnReconnect` is on in TanStack Query. When the signal comes back, the query
    runs again, downloads what arrived and the list updates without anyone pulling the
    screen.

### The screen covers the states

- ⏳ **First load**: three `Skeleton`s at the height of a row.
- 🫙 **Empty**: `EmptyState` explaining what will show up there.
- 📋 **List**: `ListTile` with the message, the relative time ("há 5 minutos") and a
  `Badge` on unread ones.
- 📡 **Offline**: `OfflineIndicator` shows at the top and confirms when the connection
  comes back. It uses `useOnline` inside and renders nothing while online.
- ❌ **Failure to mark as read**: `toast.error`, and the button stays disabled while
  `useOnline()` says there is no network.

### And on a phone? 📱

That is where this screen lives. `ListTile` takes the full width and has a generous
tap area, and the action button sits in the `Page` header, within thumb reach.
`OfflineIndicator` with `position="top"` does not fight the bottom navigation bar.

!!! warning "Offline writes need a queue"
    `markAllRead` calls the backend **before** changing IndexedDB. If it changed only
    the local copy, the next sync would bring `read: false` back from the server. That
    is why the button is disabled offline. To really write offline and resend when the
    signal comes back, use the outbox of
    [`createOfflineSync`](../offline-sync.md#the-fast-path-createofflinesync), shown in
    the [Offline field app](field-app-offline.md) recipe.

!!! note "IndexedDB is not for screen state"
    Keep in IndexedDB what must **survive F5**: history, drafts, cache. Active tab,
    open modal and spinner live in Zustand or `useState`. See [State](../state.md).

## Recap

- ✅ `createOfflineStore` with `ownerField` keeps the data on the device, apart per
  user.
- ✅ The sync tries the backend, writes with `bulkPut` and **always** reads from the
  local store.
- ✅ `networkMode: "always"` lets the query run offline and fall back to the cache.
- ✅ `OfflineIndicator`, `Skeleton`, `EmptyState` and `ListTile` cover the screen's
  states.
- ✅ Writes that must work offline go to the `createOfflineSync` queue.
