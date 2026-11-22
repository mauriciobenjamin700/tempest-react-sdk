# App de campo offline

O técnico da cooperativa sai às 6h da cidade, roda 80 km de estrada de chão e passa o dia
de fazenda em fazenda. Em cada porteira ele faz a mesma vistoria: quantas cabeças tem o
rebanho, se os bebedouros estão limpos, se a cerca aguenta, se a vacinação está em dia.
Tira fotos. Anota o que o produtor falou.

No pasto não tem sinal. Às vezes pega um 2G fraco perto da sede, que cai no meio do envio.
O sinal de verdade só volta à noite, no hotel da cidade.

Esta receita monta o app que esse técnico usa: um PWA que **funciona inteiro sem rede**,
guarda tudo no aparelho e envia sozinho quando o sinal aparece — inclusive as fotos, que
retomam de onde pararam quando a conexão cai no meio. 🚜

!!! info "Esta receita é sobre o campo"
    O motor de sincronização em si (outbox, watermark, pull paginado) está explicado peça
    por peça em [Offline Sync (FastAPI)](../offline-sync.md). Aqui você vê esse motor
    trabalhando num app real, junto de câmera, GPS, upload resumível e exportação.

## O que vamos construir

- **Lista de visitas** — lê do aparelho, nunca da rede. Mostra o que já foi enviado, o que
  está esperando sinal e o que deu conflito.
- **Formulário de vistoria** — fazenda, produtor (com CPF validado), rebanho, checklist,
  observações e a localização GPS, que funciona sem internet.
- **Fotos da câmera** — reduzidas e comprimidas no próprio aparelho antes de ocupar
  espaço, e enviadas por **upload resumível** quando houver sinal.
- **Status de sincronização** — o badge no topo, o painel "envio pendente" e a barra de
  offline.
- **Conflito** — o supervisor aprovou a visita no escritório enquanto o técnico ainda
  editava no pasto. O app mostra isso e deixa ele escolher.
- **Exportar a visita** — planilha `.xlsx` + fotos num `.zip`, gerados sem rede, para o
  técnico mandar ao produtor pelo WhatsApp.
- **PWA** — abre sem rede, pede armazenamento persistente e não troca de versão no meio
  de uma vistoria.

E os estados que toda tela real tem: carregando, vazio, erro, sucesso — e a tela de
celular, que aqui é a única que importa.

## O contrato com o backend

O backend é um FastAPI em cima do `tempest-fastapi-sdk`, seguindo a receita de
[offline-sync dele](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/recipes/offline-sync/).
O app conversa com quatro rotas, todas sob o `root_path="/api"`:

| Rota | O que faz |
| --- | --- |
| `PUT /api/visits/{id}` | Upsert idempotente da visita. O `id` é gerado no aparelho. |
| `GET /api/visits/changes?since&cursor&limit` | Delta paginado desde o último `server_time`. |
| `GET /api/visits/{id}` | A versão do servidor, usada para resolver conflito. |
| `POST /api/uploads` (tus) | Upload resumível das fotos. |

Uma visita no fio:

```json
{
  "id": "0c5f6a52-6a3e-4f43-9a8e-2b1d7c9e4f10",
  "technician_id": "tec-0193",
  "farm_name": "Fazenda Boa Esperança",
  "producer_name": "José Aparecido da Silva",
  "producer_cpf": "529.982.247-25",
  "herd_size": 214,
  "checklist": { "water": true, "fences": false, "vaccination": true, "pasture": true },
  "notes": "Cerca do piquete 3 caída. Produtor vai trocar os mourões até sexta.",
  "status": "done",
  "latitude": -15.60142,
  "longitude": -56.09781,
  "visited_at": "2026-11-18T09:42:10.000Z",
  "updated_at": "2026-11-18T09:58:33.000Z",
  "photos": [
    {
      "id": "8d1e0a7b-3c55-4a0e-b7a1-61f0e2d4c9aa",
      "url": "https://api.cooperativa.com.br/api/uploads/5b2c9f",
      "taken_at": "2026-11-18T09:47:02.000Z"
    }
  ],
  "is_deleted": false
}
```

E a página do delta, no formato `SyncPaginationSchema` do backend:

```json
{
  "items": ["…visitas como acima…"],
  "next_cursor": "eyJpZCI6IjBjNWY2YTUyIn0",
  "has_more": true,
  "limit": 100,
  "server_time": "2026-11-18T22:10:05.118Z"
}
```

Um erro segue o envelope do [contrato compartilhado](../integration-fastapi.md#o-contrato-que-os-dois-lados-compartilham).
O que importa aqui é um só: quando o supervisor já aprovou a visita, o `PUT` responde
`409` com `{"detail": "Visita já aprovada pelo supervisor.", "code": "VISIT_LOCKED"}`.

!!! warning "O `tempest-fastapi-sdk` não tem servidor tus"
    A rota `/api/uploads` precisa de um servidor tus de verdade — `tusd` atrás do mesmo
    proxy é o caminho comum. A tabela do que ele precisa responder está em
    [Upload resumível](../resumable-upload.md#o-que-o-backend-precisa-implementar).

## O código, arquivo por arquivo

### 1. O modelo

```ts
// src/visits/types.ts
export type VisitStatus = "draft" | "done" | "approved";

export type VisitSyncState = "pending" | "synced" | "conflict";

export interface VisitChecklist {
  water: boolean;
  fences: boolean;
  vaccination: boolean;
  pasture: boolean;
}

export interface Visit {
  id: string;
  technician_id: string;
  farm_name: string;
  producer_name: string;
  producer_cpf: string;
  herd_size: number;
  checklist: VisitChecklist;
  notes: string;
  status: VisitStatus;
  latitude: number | null;
  longitude: number | null;
  visited_at: string;
  updated_at: string;
  sync_state: VisitSyncState;
  conflict_detail: string | null;
}

export interface VisitPhoto {
  id: string;
  visit_id: string;
  technician_id: string;
  blob: Blob;
  bytes: number;
  taken_at: string;
  upload_url: string | null;
}

export interface PhotoRef {
  id: string;
  url: string;
  taken_at: string;
}

export interface VisitDto extends Omit<Visit, "sync_state" | "conflict_detail"> {
  photos: PhotoRef[];
  is_deleted: boolean;
}

export type VisitPayload = Omit<VisitDto, "is_deleted">;

export interface VisitChangesPage {
  items: VisitDto[];
  next_cursor: string | null;
  has_more: boolean;
  limit: number;
  server_time: string;
}

export function fromDto(dto: VisitDto): Visit {
  return {
    id: dto.id,
    technician_id: dto.technician_id,
    farm_name: dto.farm_name,
    producer_name: dto.producer_name,
    producer_cpf: dto.producer_cpf,
    herd_size: dto.herd_size,
    checklist: dto.checklist,
    notes: dto.notes,
    status: dto.status,
    latitude: dto.latitude,
    longitude: dto.longitude,
    visited_at: dto.visited_at,
    updated_at: dto.updated_at,
    sync_state: "synced",
    conflict_detail: null,
  };
}

export function toPayload(visit: Visit, photos: PhotoRef[]): VisitPayload {
  return {
    id: visit.id,
    technician_id: visit.technician_id,
    farm_name: visit.farm_name,
    producer_name: visit.producer_name,
    producer_cpf: visit.producer_cpf,
    herd_size: visit.herd_size,
    checklist: visit.checklist,
    notes: visit.notes,
    status: visit.status,
    latitude: visit.latitude,
    longitude: visit.longitude,
    visited_at: visit.visited_at,
    updated_at: visit.updated_at,
    photos,
  };
}
```

Três coisas para notar:

- O `id` nasce **no aparelho** (`crypto.randomUUID()`). É ele que torna o `PUT` um upsert
  seguro: mandar a mesma visita duas vezes não cria duas.
- `sync_state` e `conflict_detail` são **só locais** — o servidor nunca os vê. Eles dizem
  à tela se a visita está esperando sinal, já foi, ou bateu num conflito.
- A foto guarda o `Blob` em si, não uma URL. No pasto não tem servidor para apontar.

### 2. A sessão

```ts
// src/lib/auth.ts
import { createTempestAuth } from "tempest-react-sdk";

export interface Technician {
  id: string;
  name: string;
  email: string;
}

export const auth = createTempestAuth<Technician>({
  baseURL: import.meta.env.VITE_API_URL,
  prefix: "/api",
  mePath: "/auth/me",
});

export function currentTechnicianId(): string | null {
  return auth.useAuthStore.getState().user?.id ?? null;
}
```

O [`createTempestAuth`](../integration-fastapi.md#5-autenticacao-turn-key-createtempestauth)
monta login, refresh e o `auth.api` já autenticado. O `currentTechnicianId` é lido fora do
React — pelo motor de sync e pelo banco — por isso é uma função, não um hook.

### 3. O banco no aparelho

```ts
// src/visits/db.ts
import { createOfflineDatabase } from "tempest-react-sdk";
import type { Visit, VisitPhoto } from "@/visits/types";

const database = createOfflineDatabase<{ visits: Visit; photos: VisitPhoto }>({
  databaseName: "CampoVisitas",
  version: 1,
  tables: {
    visits: {
      indexes: "&id, technician_id, visited_at, sync_state",
      ownerField: "technician_id",
    },
    photos: {
      indexes: "&id, visit_id, technician_id",
      ownerField: "technician_id",
    },
  },
});

export const visits = database.store<Visit>("visits");
export const photos = database.store<VisitPhoto>("photos");
```

Visitas e fotos moram **na mesma base**, com o
[`createOfflineDatabase`](../offline.md#createofflinedatabase-varias-tabelas-numa-base).
Elas pertencem uma à outra: você lê, apaga e migra as duas juntas.

O `ownerField: "technician_id"` faz cada `put`/`list` respeitar o dono. Quando dois técnicos
dividem o mesmo tablet da cooperativa, um não vê as visitas do outro.

!!! tip "Subiu um índice? Suba a `version`"
    Mudar `indexes` sem subir `version` quebra a abertura do banco. Detalhes em
    [Offline › Migrations](../offline.md#migrations).

### 4. O motor de sync — com as fotos dentro

Este é o coração do app.

```ts
// src/visits/sync.ts
import {
  createOfflineSync,
  createResumableUpload,
  encodeIdSegment,
  isApiError,
  lastWriteWins,
} from "tempest-react-sdk";
import { auth, currentTechnicianId } from "@/lib/auth";
import { photos, visits } from "@/visits/db";
import {
  fromDto,
  toPayload,
  type PhotoRef,
  type Visit,
  type VisitChangesPage,
  type VisitDto,
  type VisitPhoto,
} from "@/visits/types";

const PHOTO_CHUNK_SIZE = 256 * 1024;

async function uploadPendingPhotos(visitId: string): Promise<PhotoRef[]> {
  const list: VisitPhoto[] = await photos.raw
    .where("visit_id")
    .equals(visitId)
    .sortBy("taken_at");
  const refs: PhotoRef[] = [];

  for (const photo of list) {
    let url = photo.upload_url;
    if (url === null) {
      const done = await createResumableUpload({
        endpoint: auth.api.url("/uploads"),
        file: photo.blob,
        key: `visit-photo:${photo.id}`,
        chunkSize: PHOTO_CHUNK_SIZE,
        metadata: { visit_id: visitId, photo_id: photo.id, filetype: photo.blob.type },
        getToken: auth.getToken,
      }).start();
      if (done === null) throw new Error("Envio da foto interrompido.");
      url = done.url;
      await photos.update(photo.id, { upload_url: url });
    }
    refs.push({ id: photo.id, url, taken_at: photo.taken_at });
  }
  return refs;
}

export const visitSync = createOfflineSync<Visit, VisitDto>({
  databaseName: "CampoVisitasOutbox",
  watermark: { storageKey: "campo.visits.watermark" },
  getPrincipal: currentTechnicianId,

  deliver: async (entry) => {
    const visit = entry.payload;
    if (visit === undefined) return;

    try {
      const photoRefs = await uploadPendingPhotos(entry.recordId);
      await auth.api.put(`/visits/${encodeIdSegment(entry.recordId)}`, {
        body: toPayload(visit, photoRefs),
      });
    } catch (error) {
      if (isApiError(error) && error.status === 409 && error.code === "VISIT_LOCKED") {
        await visits.update(entry.recordId, {
          sync_state: "conflict",
          conflict_detail: error.detail,
        });
        return;
      }
      throw error;
    }

    const local = await visits.get(entry.recordId);
    if (local?.updated_at === visit.updated_at) {
      await visits.update(entry.recordId, { sync_state: "synced" });
    }
  },

  pullPage: async (since, cursor) => {
    const page = await auth.api.get<VisitChangesPage>("/visits/changes", {
      params: { since: since ?? undefined, cursor: cursor ?? undefined, limit: 100 },
    });
    return {
      items: page.items,
      nextCursor: page.has_more ? page.next_cursor : null,
      serverTime: page.server_time,
    };
  },

  applyRemote: async (dto) => {
    const owner = currentTechnicianId();
    if (owner === null) return;

    const local = await visits.get(dto.id);
    if (dto.is_deleted) {
      if (local?.sync_state !== "pending") await visits.delete(dto.id);
      return;
    }

    const remote = fromDto(dto);
    if (local?.sync_state === "pending") {
      const winner = lastWriteWins(local, remote, (visit) => visit.updated_at);
      if (winner === local) return;
    }
    await visits.put(remote, owner);
  },
});

export async function saveVisit(visit: Visit): Promise<void> {
  const owner = currentTechnicianId();
  if (owner === null) throw new Error("Sua sessão expirou. Entre de novo para salvar.");

  const existing = await visits.get(visit.id);
  const record: Visit = {
    ...visit,
    technician_id: owner,
    updated_at: new Date().toISOString(),
    sync_state: "pending",
    conflict_detail: null,
  };

  await visits.put(record, owner);
  await visitSync.enqueue(existing === undefined ? "create" : "update", record.id, record);
  void visitSync.flush("after-mutation");
}

export async function acceptServerVersion(visitId: string): Promise<void> {
  const owner = currentTechnicianId();
  if (owner === null) return;

  const dto = await auth.api.get<VisitDto>(`/visits/${encodeIdSegment(visitId)}`);
  await visits.put(fromDto(dto), owner);
}
```

Vamos por partes. 🔍

#### `saveVisit`: o aparelho primeiro, a rede depois

`saveVisit` grava no IndexedDB, coloca a visita na **outbox** e pede um `flush`. Nenhuma
dessas três coisas precisa de rede. Sem sinal, o `flush` é pulado sozinho (`summary.skipped`)
e a entrada fica esperando — a tela já respondeu.

O `create`/`update` é só rótulo: como a rota é upsert, os dois viram o mesmo `PUT`.

#### `deliver`: as fotos sobem antes da visita

O [`createOfflineSync`](../offline-sync.md#o-jeito-rapido-createofflinesync) chama o
`deliver` uma vez por entrada da outbox. Aqui ele faz duas coisas, nesta ordem:

1. **Sobe as fotos que ainda não têm `upload_url`**, uma por uma, com o
   [`createResumableUpload`](../resumable-upload.md).
2. **Manda o `PUT` da visita** com as URLs das fotos no corpo.

Por que as fotos ficam **dentro** do `deliver`, e não numa fila separada? Porque assim elas
herdam tudo que o motor já faz:

- Se qualquer coisa falha — a foto 3 de 5, ou o `PUT` —, o `deliver` lança, a entrada
  **continua na fila** com `attempts` incrementado, e o próximo flush tenta de novo.
- As fotos 1 e 2 já ganharam `upload_url` e não sobem de novo.
- A foto 3 **retoma do byte em que parou**: a `key: "visit-photo:<id>"` é a mesma, então o
  upload resumível acha o registro dele e continua com um `HEAD` + `PATCH`.
- A ordem por registro é preservada: uma visita que falhou não deixa a edição seguinte
  dela passar na frente. Outras visitas seguem normalmente.

!!! info "Por que `key` explícita"
    A impressão digital padrão do upload resumível usa nome e `lastModified` do `File`. Um
    `Blob` vindo do IndexedDB não tem nenhum dos dois, então dois blobs do mesmo tamanho
    colidiriam. Com o `id` da foto na chave, cada foto tem o seu ponto de retomada. Veja
    [Retomar depois de um reload](../resumable-upload.md#retomar-depois-de-um-reload).

!!! tip "Chunk pequeno para sinal ruim"
    O padrão do upload resumível é `DEFAULT_CHUNK_SIZE` (5 MiB), maior que uma foto inteira
    comprimida. Com `chunkSize: 256 * 1024`, uma queda de sinal perde no máximo um pedaço
    pequeno. O custo é mais round-trips — que é o que você quer trocar num 2G que cai.

O `getToken: auth.getToken` não é por acaso: com o getter do próprio `createTempestAuth`,
o ponto de retomada fica preso à **sessão**. Se outro técnico entrar no tablet, ele não
retoma o upload do anterior. Detalhes em
[`getToken: auth.getToken`](../resumable-upload.md#gettoken-authgettoken-o-registro-e-da-sessao).

#### `getPrincipal`: o tablet compartilhado

Com `getPrincipal`, cada entrada da outbox ganha a impressão de quem a criou. Antes de cada
envio o motor confere de novo:

| Quem está logado no envio | O que acontece |
| --- | --- |
| o mesmo técnico | entregue |
| ninguém | fica na fila até ele voltar |
| outro técnico | **descartada sem envio** |

A terceira linha protege o servidor de receber a vistoria do Carlos com o token da Ana.
Mas ela também quer dizer: se o Carlos sair com visitas pendentes e a Ana entrar e
sincronizar, as visitas do Carlos se perdem. Por isso o botão de sair (mais abaixo)
**avisa** antes. 👇

#### `pullPage` e `applyRemote`: o que vem do escritório

O pull traz o que mudou no servidor desde o último `server_time`. O `pullPage` só traduz
o formato: `has_more` vira `nextCursor: null` quando a página acabou.

O `applyRemote` decide o conflito, e a regra é simples:

- Visita local **já enviada** (`synced` ou `conflict`)? A do servidor substitui.
- Visita local **pendente**? Vence a mais recente por `updated_at`, com o
  [`lastWriteWins`](../pwa.md#9-resolucao-de-conflitos). Se a local for mais nova, ela fica,
  e o próximo flush a envia.
- Tombstone (`is_deleted`)? Apaga — a não ser que exista edição local pendente.

#### O `409 VISIT_LOCKED`: conflito que a máquina não resolve

O supervisor aprovou a visita no escritório. O técnico, sem sinal, ainda corrigiu o número
de cabeças. Quando o `PUT` chega, o servidor recusa com `409 VISIT_LOCKED`.

Retentar não adianta — a quinta tentativa recebe a mesma resposta. Então o `deliver`
**não lança**: marca a visita local como `conflict`, guarda a frase do servidor e
**resolve**. A entrada sai da fila, e a decisão vai para quem sabe decidir: o técnico, na
tela. O `acceptServerVersion` busca a versão do escritório e a grava por cima.

??? note "Variante: conflito por `version` em vez de relógio"
    `updated_at` vem do relógio do **aparelho**. Tablet com data errada (bateria que
    zerou, fuso trocado) faz uma edição antiga parecer nova. Se o seu backend mantém um
    contador `version` que ele mesmo incrementa a cada escrita, extraia a regra para um
    `pickWinner` e troque a comparação:

    === "Por `updated_at` (padrão)"

        ```ts
        // src/visits/conflict.ts
        import { lastWriteWins } from "tempest-react-sdk";
        import type { Visit } from "@/visits/types";

        export function pickWinner(local: Visit, remote: Visit): Visit {
          return lastWriteWins(local, remote, (visit) => visit.updated_at);
        }
        ```

    === "Por `version` do servidor"

        ```ts
        // src/visits/conflict.ts
        import { higherVersionWins } from "tempest-react-sdk";

        export interface VersionedVisit {
          id: string;
          version: number;
        }

        export function pickWinner<T extends VersionedVisit>(local: T, remote: T): T {
          return higherVersionWins(local, remote, (visit) => visit.version);
        }
        ```

    No `applyRemote`, troque o `lastWriteWins(...)` por `pickWinner(local, remote)`. Nos
    dois, empate vai para o servidor.

### 5. As fotos no aparelho

```ts
// src/visits/photos.ts
import type { CompressedImage } from "tempest-react-sdk/imaging";
import { currentTechnicianId } from "@/lib/auth";
import { photos } from "@/visits/db";
import type { VisitPhoto } from "@/visits/types";

export async function addPhoto(visitId: string, image: CompressedImage): Promise<VisitPhoto> {
  const owner = currentTechnicianId();
  if (owner === null) throw new Error("Sua sessão expirou. Entre de novo para fotografar.");

  const photo: VisitPhoto = {
    id: crypto.randomUUID(),
    visit_id: visitId,
    technician_id: owner,
    blob: image.blob,
    bytes: image.bytes,
    taken_at: new Date().toISOString(),
    upload_url: null,
  };
  await photos.put(photo, owner);
  return photo;
}

export function listPhotos(visitId: string): Promise<VisitPhoto[]> {
  return photos.raw.where("visit_id").equals(visitId).sortBy("taken_at");
}
```

A foto entra no banco com `upload_url: null`. Quem a manda para o servidor é o `deliver`,
na próxima vez que a visita sincronizar.

### 6. As queries da tela

```ts
// src/visits/use-visits.ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { auth } from "@/lib/auth";
import { visits } from "@/visits/db";
import { listPhotos } from "@/visits/photos";
import type { Visit, VisitPhoto } from "@/visits/types";

export function useVisitList(): UseQueryResult<Visit[], Error> {
  const technicianId: string | null = auth.useAuthStore((state) => state.user?.id ?? null);

  return useQuery({
    queryKey: ["visits", "list", technicianId],
    enabled: technicianId !== null,
    networkMode: "always",
    queryFn: () =>
      visits.list(technicianId ?? undefined, { orderBy: "visited_at", reverse: true }),
  });
}

export function useVisit(visitId: string): UseQueryResult<Visit | null, Error> {
  return useQuery({
    queryKey: ["visits", "one", visitId],
    networkMode: "always",
    queryFn: async () => (await visits.get(visitId)) ?? null,
  });
}

export function useVisitPhotos(visitId: string): UseQueryResult<VisitPhoto[], Error> {
  return useQuery({
    queryKey: ["visits", "photos", visitId],
    networkMode: "always",
    queryFn: () => listPhotos(visitId),
  });
}
```

!!! danger "Sem `networkMode: \"always\"`, a lista fica carregando para sempre no pasto"
    O TanStack Query **pausa** queries quando o navegador está offline — o padrão é
    `networkMode: "online"`. Aqui a `queryFn` lê o IndexedDB, que não precisa de rede
    nenhuma, mas a query nem chega a rodar: a tela fica no skeleton até o sinal voltar.
    `networkMode: "always"` diz ao Query que essa função não depende de rede. A medição, e por
    que o SDK não troca o default do client inteiro, estão em
    [Query → `networkMode`](../query.md#query-que-le-so-o-indexeddb-networkmode-always).

### 7. Status de sync: o painel e o botão de sair

```tsx
// src/components/SyncPanel.tsx
import { Alert, Button, Card, RelativeTime, useOfflineSync, useOnline } from "tempest-react-sdk";
import { visitSync } from "@/visits/sync";

export function SyncPanel() {
  const online = useOnline();
  const { pending, syncing, lastSyncedAt, lastError, flush } = useOfflineSync(visitSync, {
    flushOnOnline: false,
  });

  if (pending === 0 && lastError === null) return null;

  return (
    <Card title="Envio pendente" style={{ marginBottom: 16 }}>
      <p>
        {pending === 1
          ? "1 alteração esperando sinal."
          : `${pending} alterações esperando sinal.`}
      </p>
      {lastSyncedAt !== null && (
        <p>
          Último envio completo: <RelativeTime date={lastSyncedAt} />
        </p>
      )}
      {lastError !== null && (
        <Alert variant="warning" title="A última tentativa não terminou">
          {lastError}
        </Alert>
      )}
      <Button
        fullWidth
        loading={syncing}
        disabled={!online}
        onClick={() => void flush("manual")}
        style={{ marginTop: 12 }}
      >
        {online ? "Enviar agora" : "Sem sinal — envia sozinho quando voltar"}
      </Button>
    </Card>
  );
}
```

```tsx
// src/components/LogoutButton.tsx
import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button, ConfirmDialog, useOfflineSync } from "tempest-react-sdk";
import { auth } from "@/lib/auth";
import { visitSync } from "@/visits/sync";

export function LogoutButton() {
  const { pending } = useOfflineSync(visitSync, { flushOnOnline: false });
  const [asking, setAsking] = useState(false);

  async function signOut(): Promise<void> {
    visitSync.resetWatermark();
    await auth.logout();
  }

  return (
    <>
      <Button
        variant="ghost"
        iconOnly
        aria-label="Sair"
        onClick={() => (pending > 0 ? setAsking(true) : void signOut())}
      >
        <LogOut size={18} />
      </Button>
      <ConfirmDialog
        open={asking}
        variant="danger"
        title={`${pending} alterações ainda não foram enviadas`}
        description="Elas ficam guardadas neste aparelho e saem quando você entrar de novo. Se outro técnico entrar aqui antes disso, elas são descartadas."
        confirmLabel="Sair mesmo assim"
        cancelLabel="Ficar e esperar o sinal"
        onConfirm={signOut}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}
```

O [`useOfflineSync`](../offline-sync.md#ui-reativa-e-flush-automatico) inscreve o componente
no motor: `pending`, `syncing`, `lastSyncedAt` e `lastError` mudam sozinhos a cada envio.
Os dois componentes passam `flushOnOnline: false` porque quem dispara o envio é um só — o
`SyncRunner`, no `App`.

O `lastError` mostra o motivo da última falha. "Failed to fetch" no pasto é rotina; o que
você quer ver é um `401` ou um `413` que não vai passar sozinho.

!!! warning "Sair não apaga a outbox — e de propósito"
    O logout chama `resetWatermark()`, não `clearOutbox()`. Apagar a fila perderia o dia de
    trabalho de quem saiu sem sinal. Com o `getPrincipal`, as entradas do técnico ficam
    **seguras** até ele voltar — o `ConfirmDialog` só deixa claro o único caso em que elas
    se perdem.

### 8. A câmera

```tsx
// src/components/VisitPhotos.tsx
import { useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import { Badge, Button, EmptyState, Skeleton, formatBytes, useToast } from "tempest-react-sdk";
import { bestSupportedType, useImagePreview, useImageProcessing } from "tempest-react-sdk/imaging";
import { addPhoto } from "@/visits/photos";
import { useVisitPhotos } from "@/visits/use-visits";
import type { VisitPhoto } from "@/visits/types";

function PhotoThumb({ photo }: { photo: VisitPhoto }) {
  const { url } = useImagePreview(photo.blob);

  return (
    <figure style={{ margin: 0, display: "grid", gap: 4 }}>
      {url === null ? (
        <Skeleton height={96} />
      ) : (
        <img
          src={url}
          alt="Foto da vistoria"
          style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8 }}
        />
      )}
      <figcaption>
        <Badge size="sm" variant={photo.upload_url === null ? "warning" : "success"}>
          {photo.upload_url === null ? formatBytes(photo.bytes) : "Enviada"}
        </Badge>
      </figcaption>
    </figure>
  );
}

export function VisitPhotos({ visitId, disabled }: { visitId: string; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const toast = useToast();
  const list = useVisitPhotos(visitId);
  const { compress, isWorking } = useImageProcessing();

  async function handleFiles(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const type = await bestSupportedType(["image/webp", "image/jpeg"]);

    for (const file of files) {
      try {
        const image = await compress(file, {
          maxBytes: 400_000,
          width: 1600,
          height: 1600,
          fit: "contain",
          withoutEnlargement: true,
          type,
        });
        await addPhoto(visitId, image);
      } catch {
        toast.error("Não deu para processar a foto. Tente fotografar de novo.");
      }
    }
    await client.invalidateQueries({ queryKey: ["visits", "photos", visitId] });
  }

  return (
    <section>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(event) => void handleFiles(event)}
      />
      <Button
        variant="soft"
        fullWidth
        leftIcon={<Camera size={18} />}
        loading={isWorking}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        Tirar foto
      </Button>

      {list.isPending ? (
        <Skeleton height={96} style={{ marginTop: 12 }} />
      ) : list.isError ? (
        <p role="alert">Não deu para ler as fotos deste aparelho.</p>
      ) : list.data.length === 0 ? (
        <EmptyState
          title="Nenhuma foto"
          description="Fotografe bebedouros, cercas e o que mais o produtor precisar ver."
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
            gap: 8,
            marginTop: 12,
          }}
        >
          {list.data.map((photo) => (
            <PhotoThumb key={photo.id} photo={photo} />
          ))}
        </div>
      )}
    </section>
  );
}
```

O `<input type="file" capture="environment">` abre **o app de câmera do próprio celular**,
na câmera traseira. Você ganha foco, flash e resolução total sem pedir permissão nenhuma —
e funciona no iPhone, onde nem todo navegador abre câmera dentro da página.

A foto de um celular atual tem vários MB. Guardar isso cru encheria o aparelho em poucos
dias. Então ela passa pelo [`useImageProcessing`](../imaging.md#no-react) antes:

- `width`/`height` 1600 com `fit: "contain"` — reduzir é o que mais economiza;
- `maxBytes: 400_000` — o `compress` procura a qualidade que cabe no orçamento;
- `bestSupportedType` — WebP onde o navegador sabe codificar, JPEG onde não. Pedir WebP a
  um navegador que não codifica devolveria PNG, várias vezes maior, sem erro nenhum.

O `useImagePreview` cria a URL de preview do `Blob` e a **revoga** sozinho no unmount.

!!! warning "Reencodar apaga o GPS da foto"
    O EXIF some no reencode, incluindo as coordenadas. Isso protege a localização de quem
    fotografa — mas numa vistoria você **quer** saber onde a foto foi tirada. Por isso a
    localização vai no registro da visita, pelo `useGeolocation`, logo abaixo. Veja
    [Imaging › Reencodar apaga o EXIF](../imaging.md#reencodar-apaga-o-exif).

??? tip "Variante: visor dentro do app, com `captureFrame`"
    Se a vistoria precisa de um enquadramento guiado (uma moldura para o brinco do animal,
    por exemplo), abra a câmera dentro da página e capture um frame do vídeo:

    ```tsx
    // src/components/InlineCamera.tsx
    import { Button } from "tempest-react-sdk";
    import { captureFrame, type CapturedFrame } from "tempest-react-sdk/imaging";
    import { useCameraStream } from "tempest-react-sdk/vision";

    export function InlineCamera({ onShot }: { onShot: (frame: CapturedFrame) => void }) {
      const camera = useCameraStream({
        constraints: { video: { facingMode: "environment" }, audio: false },
      });

      async function shoot(): Promise<void> {
        const video = camera.videoRef.current;
        if (video === null) return;
        onShot(await captureFrame(video, { width: 1600, type: "image/jpeg", quality: 0.85 }));
      }

      if (camera.status === "error") {
        return (
          <div role="alert">
            <p>{camera.error?.message}</p>
            <Button onClick={camera.retry}>Tentar de novo</Button>
          </div>
        );
      }

      return (
        <>
          <video ref={camera.videoRef} muted playsInline style={{ width: "100%" }} />
          <Button fullWidth disabled={camera.status !== "ready"} onClick={() => void shoot()}>
            Capturar
          </Button>
        </>
      );
    }
    ```

    O preço: o `useCameraStream` mora no subpath `/vision`, que exige o
    `onnxruntime-web` instalado mesmo sem modelo nenhum (veja
    [Vision](../vision.md#onnxruntime-web-e-peer-dependency-opcional)). E o frame sai na
    resolução do stream de vídeo, normalmente menor que a da câmera nativa. Para foto de
    vistoria, o `<input capture>` costuma ser a escolha melhor.

### 9. A tela da visita

```tsx
// src/pages/VisitFormPage.tsx
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Alert,
  AppBar,
  Button,
  CPFInput,
  Checkbox,
  ErrorState,
  Input,
  Skeleton,
  Textarea,
  useGeolocation,
  useOnline,
  useToast,
  validateCPF,
} from "tempest-react-sdk";
import { ExportVisitButton } from "@/components/ExportVisitButton";
import { VisitPhotos } from "@/components/VisitPhotos";
import { acceptServerVersion, saveVisit } from "@/visits/sync";
import { useVisit } from "@/visits/use-visits";
import type { Visit, VisitChecklist, VisitStatus } from "@/visits/types";

const CHECKLIST: { key: keyof VisitChecklist; label: string }[] = [
  { key: "water", label: "Bebedouros limpos e com água" },
  { key: "fences", label: "Cercas e porteiras em bom estado" },
  { key: "vaccination", label: "Vacinação em dia (aftosa e brucelose)" },
  { key: "pasture", label: "Pastagem sem sinais de degradação" },
];

function blankVisit(id: string): Visit {
  const now = new Date().toISOString();
  return {
    id,
    technician_id: "",
    farm_name: "",
    producer_name: "",
    producer_cpf: "",
    herd_size: 0,
    checklist: { water: false, fences: false, vaccination: false, pasture: false },
    notes: "",
    status: "draft",
    latitude: null,
    longitude: null,
    visited_at: now,
    updated_at: now,
    sync_state: "pending",
    conflict_detail: null,
  };
}

function VisitForm({ initial, isNew }: { initial: Visit; isNew: boolean }) {
  const navigate = useNavigate();
  const toast = useToast();
  const online = useOnline();
  const [draft, setDraft] = useState<Visit>(initial);
  const [cpfError, setCpfError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const gps = useGeolocation({ enableHighAccuracy: true, timeout: 30_000, disabled: !isNew });
  const locked = draft.status === "approved";
  const coords = gps.coords;

  useEffect(() => {
    if (coords === null) return;
    setDraft((current) =>
      current.latitude === null
        ? { ...current, latitude: coords.latitude, longitude: coords.longitude }
        : current,
    );
  }, [coords]);

  function patch(changes: Partial<Visit>): void {
    setDraft((current) => ({ ...current, ...changes }));
  }

  async function submit(status: VisitStatus): Promise<void> {
    if (!validateCPF(draft.producer_cpf)) {
      setCpfError("CPF inválido. Confira com o produtor.");
      return;
    }
    setSaving(true);
    try {
      await saveVisit({ ...draft, status });
      toast.success(
        online ? "Visita salva. Enviando…" : "Visita salva no aparelho. Sai quando tiver sinal.",
      );
      navigate("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não deu para salvar a visita.");
    } finally {
      setSaving(false);
    }
  }

  async function takeServerVersion(): Promise<void> {
    try {
      await acceptServerVersion(draft.id);
      navigate("/");
    } catch {
      toast.error("Não deu para buscar a versão do escritório. Tente com sinal.");
    }
  }

  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void submit("done");
      }}
    >
      <AppBar
        title={isNew ? "Nova visita" : draft.farm_name}
        showBack
        onBack={() => navigate("/")}
        sticky
        safeArea
        actions={isNew ? undefined : <ExportVisitButton visit={draft} />}
      />

      <main style={{ padding: 16, paddingBottom: 120, display: "grid", gap: 16 }}>
        {draft.sync_state === "conflict" && (
          <Alert variant="danger" title="O escritório já fechou esta visita">
            <p>{draft.conflict_detail}</p>
            <Button variant="outline" disabled={!online} onClick={() => void takeServerVersion()}>
              Usar a versão do escritório
            </Button>
          </Alert>
        )}
        {locked && (
          <Alert variant="info" title="Visita aprovada">
            Só o supervisor pode alterar uma visita aprovada.
          </Alert>
        )}

        <Input
          label="Fazenda"
          required
          disabled={locked}
          value={draft.farm_name}
          onChange={(event) => patch({ farm_name: event.target.value })}
        />
        <Input
          label="Produtor"
          required
          disabled={locked}
          value={draft.producer_name}
          onChange={(event) => patch({ producer_name: event.target.value })}
        />
        <CPFInput
          label="CPF do produtor"
          required
          disabled={locked}
          value={draft.producer_cpf}
          error={cpfError}
          onChange={(value) => {
            setCpfError(undefined);
            patch({ producer_cpf: value });
          }}
        />
        <Input
          label="Cabeças no rebanho"
          type="number"
          inputMode="numeric"
          min={0}
          disabled={locked}
          value={String(draft.herd_size)}
          onChange={(event) => patch({ herd_size: Number(event.target.value) || 0 })}
        />

        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}>
          <legend>Checklist</legend>
          {CHECKLIST.map((item) => (
            <Checkbox
              key={item.label}
              label={item.label}
              disabled={locked}
              checked={draft.checklist[item.key]}
              onChange={(event) =>
                patch({ checklist: { ...draft.checklist, [item.key]: event.target.checked } })
              }
            />
          ))}
        </fieldset>

        <Textarea
          label="Observações"
          rows={4}
          disabled={locked}
          value={draft.notes}
          onChange={(event) => patch({ notes: event.target.value })}
        />

        <p>
          {draft.latitude !== null && draft.longitude !== null
            ? `📍 ${draft.latitude.toFixed(5)}, ${draft.longitude.toFixed(5)}`
            : gps.loading
              ? "📍 Buscando GPS…"
              : "📍 Sem localização — a visita salva assim mesmo."}
        </p>

        <VisitPhotos visitId={draft.id} disabled={locked} />
      </main>

      {!locked && (
        <footer
          style={{
            position: "fixed",
            insetInline: 0,
            bottom: 0,
            display: "flex",
            gap: 8,
            padding: 16,
            background: "var(--tempest-surface)",
            borderTop: "1px solid var(--tempest-border)",
          }}
        >
          <Button
            type="button"
            variant="outline"
            fullWidth
            disabled={saving}
            onClick={() => void submit("draft")}
          >
            Salvar rascunho
          </Button>
          <Button type="submit" fullWidth loading={saving}>
            Concluir visita
          </Button>
        </footer>
      )}
    </form>
  );
}

export function VisitFormPage() {
  const { visitId = "" } = useParams();
  const query = useVisit(visitId);

  if (query.isPending) {
    return (
      <div style={{ padding: 16, display: "grid", gap: 12 }} aria-busy="true">
        <Skeleton height={48} />
        <Skeleton height={48} />
        <Skeleton height={160} />
      </div>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Não deu para abrir esta visita"
        description={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return (
    <VisitForm
      key={visitId}
      initial={query.data ?? blankVisit(visitId)}
      isNew={query.data === null}
    />
  );
}
```

O que acontece nessa tela:

- **Carregando**: skeletons no formato do formulário enquanto o IndexedDB responde.
- **Erro**: o [`ErrorState`](../components/feedback.md#errorstate) com "tentar de novo".
  Ler o próprio banco quase nunca falha — mas quando falha (cota estourada, modo privado),
  o técnico precisa saber.
- **Visita nova vs. existente**: a rota é `/visitas/:visitId`, e o `id` já nasce na lista
  (`crypto.randomUUID()`). Se o banco não tem esse `id`, é visita nova.
- **GPS**: o [`useGeolocation`](../geo.md) só liga em visita nova. O GPS do celular não
  precisa de internet — só de céu aberto, o que no pasto não falta. 🛰️
- **CPF**: o [`CPFInput`](../forms-br.md#inputs-com-mascara) aplica a máscara e o
  `validateCPF` confere os dígitos antes de salvar.
- **Conflito e aprovada**: o `Alert` explica o que houve. Em visita aprovada os campos
  ficam desabilitados e a barra de ações some.
- **Celular**: a barra de ações fica **fixa no rodapé**, onde o polegar alcança, e o
  `paddingBottom` da página impede que ela cubra o último campo.

### 10. A lista

```tsx
// src/pages/VisitListPage.tsx
import { Plus } from "lucide-react";
import { useNavigate } from "react-router";
import {
  AppBar,
  Badge,
  EmptyState,
  ErrorState,
  FloatingActionButton,
  ListTile,
  Skeleton,
  SyncStatusBadge,
  formatDateTime,
} from "tempest-react-sdk";
import { LogoutButton } from "@/components/LogoutButton";
import { SyncPanel } from "@/components/SyncPanel";
import { visitSync } from "@/visits/sync";
import { useVisitList } from "@/visits/use-visits";
import type { VisitStatus, VisitSyncState } from "@/visits/types";

const STATUS_LABEL: Record<VisitStatus, string> = {
  draft: "Rascunho",
  done: "Concluída",
  approved: "Aprovada",
};

const SYNC_BADGE: Record<
  VisitSyncState,
  { label: string; variant: "warning" | "success" | "danger" }
> = {
  pending: { label: "Não enviada", variant: "warning" },
  synced: { label: "Enviada", variant: "success" },
  conflict: { label: "Conflito", variant: "danger" },
};

export function VisitListPage() {
  const navigate = useNavigate();
  const list = useVisitList();

  return (
    <>
      <AppBar
        title="Visitas"
        sticky
        safeArea
        actions={
          <>
            <SyncStatusBadge sync={visitSync} />
            <LogoutButton />
          </>
        }
      />

      <main style={{ padding: 16, paddingBottom: 96 }}>
        <SyncPanel />

        {list.isPending ? (
          <div style={{ display: "grid", gap: 8 }} aria-busy="true">
            <Skeleton height={64} />
            <Skeleton height={64} />
            <Skeleton height={64} />
          </div>
        ) : list.isError ? (
          <ErrorState
            title="Não deu para ler as visitas deste aparelho"
            description={list.error.message}
            onRetry={() => void list.refetch()}
          />
        ) : list.data.length === 0 ? (
          <EmptyState
            title="Nenhuma visita ainda"
            description="Toque em “Nova visita” na porteira da fazenda. Funciona sem sinal."
          />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {list.data.map((visit) => (
              <li key={visit.id}>
                <ListTile
                  title={visit.farm_name}
                  subtitle={`${visit.producer_name} · ${formatDateTime(visit.visited_at)} · ${STATUS_LABEL[visit.status]}`}
                  trailing={
                    <Badge size="sm" variant={SYNC_BADGE[visit.sync_state].variant}>
                      {SYNC_BADGE[visit.sync_state].label}
                    </Badge>
                  }
                  onClick={() => navigate(`/visitas/${visit.id}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </main>

      <FloatingActionButton
        icon={<Plus />}
        label="Nova visita"
        onClick={() => navigate(`/visitas/${crypto.randomUUID()}`)}
      />
    </>
  );
}
```

Os quatro estados, cada um com o componente certo:

| Estado | O que aparece |
| --- | --- |
| carregando | três [`Skeleton`](../components/feedback.md#skeleton) no formato de linha |
| erro | [`ErrorState`](../components/feedback.md#errorstate) com "tentar de novo" |
| vazio | [`EmptyState`](../components/feedback.md#emptystate) dizendo o que fazer — e que funciona sem sinal |
| com dados | [`ListTile`](../components/data.md#listtile) por visita, com o badge de envio de cada uma |

No topo, o [`SyncStatusBadge`](../components/feedback.md#syncstatusbadge) recebe o motor
em `sync={visitSync}`, se inscreve nele sozinho e mostra o estado geral: sincronizado,
sincronizando, pendente, offline ou erro. O badge **por linha** diz qual visita, especificamente, ainda não foi.

O [`FloatingActionButton`](../components/actions.md#floatingactionbutton) fica no canto inferior direito, ao
alcance do polegar. O `paddingBottom: 96` da lista garante que ele não cubra a última visita.

### 11. Exportar a visita (sem rede)

O produtor quer o relatório **na hora**, no WhatsApp dele. Não dá para esperar o servidor
gerar um PDF à noite.

```ts
// src/visits/export.ts
import { createZip, formatDateTime, writeXlsx } from "tempest-react-sdk";
import { listPhotos } from "@/visits/photos";
import type { Visit } from "@/visits/types";

function extensionOf(type: string): string {
  if (type === "image/webp") return "webp";
  if (type === "image/png") return "png";
  return "jpg";
}

function yesNo(value: boolean): string {
  return value ? "Sim" : "Não";
}

export async function buildVisitZip(
  visit: Visit,
  onPercent: (percent: number) => void,
): Promise<Blob> {
  const photoList = await listPhotos(visit.id);

  const sheet = writeXlsx(
    ["Campo", "Valor"],
    [
      ["Fazenda", visit.farm_name],
      ["Produtor", visit.producer_name],
      ["CPF do produtor", visit.producer_cpf],
      ["Data da visita", formatDateTime(visit.visited_at)],
      ["Cabeças no rebanho", visit.herd_size],
      ["Bebedouros limpos e com água", yesNo(visit.checklist.water)],
      ["Cercas e porteiras em bom estado", yesNo(visit.checklist.fences)],
      ["Vacinação em dia", yesNo(visit.checklist.vaccination)],
      ["Pastagem sem degradação", yesNo(visit.checklist.pasture)],
      ["Latitude", visit.latitude],
      ["Longitude", visit.longitude],
      ["Observações", visit.notes],
      ["Fotos", photoList.length],
    ],
  );

  return createZip(
    [
      { path: "visita.xlsx", data: sheet },
      ...photoList.map((photo, index) => ({
        path: `fotos/foto-${String(index + 1).padStart(2, "0")}.${extensionOf(photo.blob.type)}`,
        data: photo.blob,
      })),
    ],
    {
      onProgress: ({ loaded, total }) =>
        onPercent(total === 0 ? 100 : Math.round((loaded / total) * 100)),
    },
  );
}
```

```tsx
// src/components/ExportVisitButton.tsx
import { Share2 } from "lucide-react";
import { useState } from "react";
import { Button, Progress, shareOrDownloadBlob, useToast } from "tempest-react-sdk";
import { buildVisitZip } from "@/visits/export";
import type { Visit } from "@/visits/types";

export function ExportVisitButton({ visit }: { visit: Visit }) {
  const toast = useToast();
  const [percent, setPercent] = useState<number | null>(null);
  const [zip, setZip] = useState<Blob | null>(null);

  async function generate(): Promise<void> {
    setPercent(0);
    try {
      setZip(await buildVisitZip(visit, setPercent));
    } catch {
      toast.error("Não deu para montar o arquivo da visita.");
    } finally {
      setPercent(null);
    }
  }

  async function share(file: Blob): Promise<void> {
    await shareOrDownloadBlob(file, `visita-${visit.id.slice(0, 8)}.zip`, {
      title: `Visita — ${visit.farm_name}`,
    });
    setZip(null);
  }

  if (percent !== null) {
    return <Progress value={percent} showLabel label="Montando o arquivo" />;
  }
  if (zip !== null) {
    return (
      <Button size="sm" leftIcon={<Share2 size={16} />} onClick={() => void share(zip)}>
        Compartilhar
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" onClick={() => void generate()}>
      Exportar
    </Button>
  );
}
```

- O [`writeXlsx`](../utilities.md#planilhas-xlsx-writexlsx) gera a planilha em memória.
  Número entra como número (o Excel soma), `null` vira célula vazia, acento sobrevive.
- O [`createZip`](../utilities.md#arquivos-zip-createzip) monta o arquivo em fatias, sem
  travar a tela, e **guarda** as fotos sem recomprimir — elas já são WebP/JPEG. O
  `onProgress` alimenta o [`Progress`](../components/feedback.md#progress).
- O [`shareOrDownloadBlob`](../share.md#exportar-um-arquivo-shareordownloadblob) abre a
  folha de compartilhamento do celular (WhatsApp, e-mail, Drive) e baixa no desktop.

!!! tip "Por que dois toques: \"Exportar\" e depois \"Compartilhar\""
    O navegador só abre a folha de compartilhamento logo depois de um toque do usuário (a
    *ativação transitória*). Montar um ZIP com dez fotos leva tempo, e ao fim dele essa
    janela pode ter fechado — aí o `navigator.share` recusa e o `shareOrDownloadBlob` cai
    no download. Separar "montar" de "compartilhar" faz o segundo toque abrir a folha na
    hora.

!!! danger "O ZIP leva o CPF do produtor"
    Dado pessoal saindo do app por WhatsApp é tratamento de dado pessoal sob a LGPD.
    Confirme com o jurídico da cooperativa que o produtor recebe **o próprio** relatório e
    que esse é um uso previsto. Se não precisar do CPF na planilha, tire a linha.

### 12. O app e o service worker

```tsx
// src/App.tsx
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import {
  Banner,
  Button,
  OfflineIndicator,
  QueryProvider,
  ToastProvider,
  UpdatePrompt,
  useOfflineSync,
  useServiceWorkerUpdate,
  useStorageEstimate,
} from "tempest-react-sdk";
import { VisitFormPage } from "@/pages/VisitFormPage";
import { VisitListPage } from "@/pages/VisitListPage";
import { visitSync } from "@/visits/sync";

function SyncRunner() {
  const client = useQueryClient();
  useOfflineSync(visitSync, { flushOnMount: true, flushOnOnline: true, intervalMs: 120_000 });

  useEffect(
    () =>
      visitSync.subscribe(() => {
        void client.invalidateQueries({ queryKey: ["visits"] });
      }),
    [client],
  );

  return null;
}

function StorageGuard() {
  const storage = useStorageEstimate();

  if (storage.persisted === false) {
    return (
      <Banner
        variant="warning"
        title="Proteja as visitas deste aparelho"
        action={<Button size="sm" onClick={() => void storage.requestPersist()}>Proteger</Button>}
      >
        Sem isso, o navegador pode apagar visitas e fotos não enviadas quando faltar espaço.
      </Banner>
    );
  }
  if (storage.ratio !== null && storage.ratio > 0.8) {
    return (
      <Banner variant="danger" title="Armazenamento quase cheio">
        Envie as visitas pendentes antes de tirar mais fotos.
      </Banner>
    );
  }
  return null;
}

function ServiceWorkerGate() {
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate({ url: "/sw.js" });
  return <UpdatePrompt open={updateAvailable} onUpdate={applyUpdate} />;
}

export function App() {
  return (
    <QueryProvider>
      <ToastProvider position="top-center">
        <BrowserRouter>
          <OfflineIndicator position="top" />
          <StorageGuard />
          <SyncRunner />
          <Routes>
            <Route path="/" element={<VisitListPage />} />
            <Route path="/visitas/:visitId" element={<VisitFormPage />} />
          </Routes>
          <ServiceWorkerGate />
        </BrowserRouter>
      </ToastProvider>
    </QueryProvider>
  );
}
```

```ts
// src/sw.ts
import { installPrecache, installSkipWaitingListener } from "tempest-react-sdk/sw";

installSkipWaitingListener();

installPrecache({
  navigateFallback: "/index.html",
  navigateFallbackDenylist: [/^\/api\//],
});
```

- **`SyncRunner`** é o único lugar que dispara o envio: no boot, quando a rede volta e a
  cada dois minutos. O `flush` é single-flight, então gatilhos juntos viram um envio só. A
  cada mudança do motor ele invalida as queries `["visits"]`, e a lista mostra o badge
  novo sem recarregar.
- **`StorageGuard`** usa o [`useStorageEstimate`](../pwa.md#4-durabilidade-peca-armazenamento-persistente).
  Sem armazenamento persistente o navegador pode **despejar** o IndexedDB sob pressão de
  disco — e aqui o IndexedDB guarda trabalho que ainda não existe em lugar nenhum.
- **`OfflineIndicator`** mostra a barra de offline e pisca a confirmação quando o sinal volta.
- **`UpdatePrompt`** pergunta antes de trocar de versão. Recarregar sozinho no meio de uma
  vistoria apagaria o que está digitado no formulário.
- **`sw.ts`** só faz precache do app shell, para o app abrir sem rede. Veja
  [PWA](../pwa.md#2-precache-cache-runtime-navigation-preload).

!!! warning "Não ligue o `installBackgroundSync` nas rotas que a outbox já cuida"
    O template `--pwa` vem com `installBackgroundSync` casando **todo** `/api/`. Neste app,
    quem reenvia é a outbox. Com os dois ligados, um `PUT /api/visits/…` que falhou offline
    sai duas vezes — e um `PATCH` do tus guardado pelo worker é reenviado depois, com um
    `Upload-Offset` velho, e leva `409`. Remova o `installBackgroundSync` (como acima) ou
    tire `/api/visits` e `/api/uploads` do `match` dele.

## Testando no campo (sem ir ao campo)

1. Abra o app no Chrome, entre e deixe o service worker instalar.
2. DevTools → **Network** → **Offline**. Crie duas visitas com fotos. A lista mostra
   "Não enviada"; o badge do topo, "Offline".
3. Recarregue a página ainda offline. Tudo continua lá — app shell do precache, dados do
   IndexedDB. ✅
4. Troque para **Slow 3G** e salve. Durante o envio de uma foto, volte para **Offline** e
   depois para **Slow 3G**. Na aba Network, o upload retoma com um `HEAD` seguido de
   `PATCH` a partir do offset — não um `POST` novo.
5. No servidor, marque uma visita como aprovada. Edite-a no app e salve: ela aparece como
   "Conflito", com a frase do servidor.
6. DevTools → **Device Toolbar** → um celular de 360 px. A barra de ações fica no rodapé e
   o botão "Nova visita" não cobre a lista.

!!! check "O que você deve ver no fim"
    Nenhuma visita perdida, nenhuma visita duplicada no servidor, e cada foto enviada
    **uma vez**, mesmo com quedas no meio.

## Recap

- 🗄️ **`createOfflineDatabase`** guarda visitas e fotos (como `Blob`) na mesma base, com
  dono por técnico.
- 📤 **`createOfflineSync`** é a outbox: `saveVisit` grava local e enfileira; o envio
  acontece quando der.
- 📸 As fotos sobem **dentro do `deliver`** com **`createResumableUpload`** e `key` por
  foto — falha retenta, queda retoma do offset, foto enviada não sobe de novo.
- ⚖️ Conflito tem dois tipos: o que a máquina resolve (`lastWriteWins` no `applyRemote`)
  e o que o técnico resolve (`409 VISIT_LOCKED` vira estado `conflict` na tela).
- 🗜️ **`useImageProcessing` + `bestSupportedType`** reduzem a foto no aparelho; o GPS vai
  no registro, porque o reencode apaga o EXIF.
- 🟢 **`SyncStatusBadge`**, **`useOfflineSync`** e **`OfflineIndicator`** contam ao técnico
  o que está acontecendo; o logout avisa antes de arriscar a fila.
- 📦 **`writeXlsx` + `createZip` + `shareOrDownloadBlob`** entregam o relatório sem rede.
- 🔒 **`useStorageEstimate`** pede armazenamento persistente; o `UpdatePrompt` não troca
  de versão no meio da vistoria; o service worker só faz precache.
- ⚠️ **`networkMode: "always"`** nas queries que leem o IndexedDB, senão elas pausam
  offline.

## Veja também

- [Offline Sync (FastAPI)](../offline-sync.md) — o motor da outbox, peça por peça
- [Offline (IndexedDB)](../offline.md) — `createOfflineStore` e `createOfflineDatabase`
- [Upload resumível (tus)](../resumable-upload.md) — retomada, chave e o que o backend implementa
- [Imaging](../imaging.md) — reduzir, comprimir e capturar frames no navegador
- [PWA & Offline-First](../pwa.md) — service worker, durabilidade e UI de status
- [Utilitários](../utilities.md) — `writeXlsx`, `createZip` e companhia
