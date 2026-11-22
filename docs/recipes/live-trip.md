# Viagem ao vivo (mapa + WebSocket)

São 6h40 e a Juliana está no ponto da Av. Frei Serafim. A van do fretado da fábrica deveria passar às 6h50 — mas ela já passou? Está presa no trânsito? Ela abre o app da transportadora e quer ver **onde a van está agora**, **quanto falta para chegar no ponto dela** e, se o sinal sumir, **saber que o mapa parou de andar** em vez de confiar numa posição velha.

Do outro lado, o Marcos dirige a van com um celular preso no painel. O app dele **transmite a posição pelo GPS**, mostra as paradas na ordem e quantas pessoas embarcam em cada uma.

As duas telas usam o mesmo mapa. Nesta receita você vai construir as duas, do contrato com o backend até o tema. 🚐

## O que vamos construir

- 🧭 **Tela do passageiro**: mapa com a rota, a trilha já percorrida e a van com a seta de direção; o **embarque dela em destaque**; as outras paradas **numeradas na ordem**; legenda; painel com o **tempo até o embarque**.
- 🚦 **Tela do motorista**: o mesmo mapa com **a contagem de embarques** em cada parada (e a lista de nomes ao tocar nela), alimentado pelo GPS do próprio aparelho, que **transmite a posição** pelo WebSocket.
- 📡 **Posição ao vivo** pelo `useWebSocket` do SDK: frame validado com zod, reconexão sozinha, refetch depois do buraco, e um **indicador de sinal** — ao vivo, sem sinal há X minutos, sem conexão com botão de "tentar de novo".
- ⏱️ **Próxima parada e ETA**: a previsão do backend quando ela existe, e uma estimativa local quando não.
- Os estados que uma tela real tem: **carregando**, **viagem ainda não começou** (vazio), **erro**, **sucesso**, **offline** e **celular**.
- Opcional: **ruas no mapa** e a van encaixada na rua, com o nome da via.
- Tema: os **tokens** que o mapa lê.

!!! info "Nada externo"
    O [`LiveRouteMap`](../geo.md#mapa-de-viagem-ao-vivo-liveroutemap) é SVG puro: sem tiles, sem Google Maps, sem chave de API. Funciona offline e no teste. Se você hospeda o próprio servidor de tiles, ele aceita `tileUrl` — mas nada nesta receita precisa disso.

## O contrato com o backend

O backend é um serviço FastAPI feito com o [`tempest-fastapi-sdk`](../integration-fastapi.md), montado sob `/api`. Ele expõe três coisas:

| Rota | O que faz |
| --- | --- |
| `GET /api/trips/{trip_id}` | A viagem inteira: rota, paradas, trilha até agora e o embarque de quem pediu. |
| `WS /api/trips/{trip_id}/watch` | Frames ao vivo para o passageiro: posição, mudança de parada, mudança de status. |
| `WS /api/trips/{trip_id}/drive` | O canal do motorista: o app **manda** a posição por aqui. |

A resposta do `GET` (resumida):

```json
{
  "id": "trp_8f2c",
  "line_name": "Linha 042 — Centro ↔ Distrito Industrial",
  "vehicle_label": "Van 12",
  "plate": "QRS4E21",
  "driver_name": "Marcos Souza",
  "status": "in_progress",
  "departure_at": "2026-11-23T09:30:00Z",
  "origin": { "name": "Garagem Centro", "latitude": -5.0712, "longitude": -42.7905 },
  "destination": { "name": "Fábrica — Portaria 2", "latitude": -5.1103, "longitude": -42.8297 },
  "route": [{ "latitude": -5.0712, "longitude": -42.7905 }, { "latitude": -5.0801, "longitude": -42.8003 }],
  "stops": [
    {
      "id": "stp_01",
      "order": 1,
      "name": "Av. Frei Serafim",
      "address": "Av. Frei Serafim, 1450 — Centro",
      "latitude": -5.0892,
      "longitude": -42.8016,
      "status": "pending",
      "eta_at": "2026-11-23T09:50:00Z",
      "boarding_count": 3,
      "passengers": []
    }
  ],
  "trail": [
    { "latitude": -5.0745, "longitude": -42.7951, "heading": 212, "speed_kmh": 38, "recorded_at": "2026-11-23T09:44:12Z" }
  ],
  "my_stop_id": "stp_01"
}
```

E os frames do WebSocket, um por mensagem:

```json
{ "type": "position", "latitude": -5.0761, "longitude": -42.7968, "heading": 215, "speed_kmh": 41, "recorded_at": "2026-11-23T09:44:17Z" }
{ "type": "stop", "stop_id": "stp_01", "status": "arrived", "eta_at": null }
{ "type": "trip", "status": "finished" }
{ "type": "ping" }
```

!!! note "`passengers` vazio para o passageiro"
    O backend só preenche os nomes em `passengers` quando quem pede é o motorista. Para a Juliana, a lista vem vazia e só `boarding_count` vem preenchido: ela não precisa — nem deve — ver quem embarca em cada ponto. Essa decisão é do backend, não da tela.

## Os arquivos

```text
src/
├── trips/
│   ├── contract.ts         tipos + schema zod dos frames
│   ├── api.ts              cliente HTTP, query keys, useTrip, URL do socket
│   ├── use-live-vehicle.ts posição ao vivo, trilha e estado do sinal
│   ├── trip-markers.tsx    paradas → marcadores do mapa
│   ├── TripMap.tsx         LiveRouteMap + legenda, usado pelas duas telas
│   ├── trip-map.css        tokens do mapa
│   ├── SignalStatus.tsx    indicador de sinal
│   └── NextStopPanel.tsx   próxima parada, ETA e lista de paradas
└── pages/
    ├── PassengerTripPage.tsx
    └── DriverTripPage.tsx
```

Os arquivos importam uns aos outros por `@/…` — o alias que o scaffold do SDK já configura para `src/`.

## Passo 1 — O contrato em código

```ts
// src/trips/contract.ts
import { z } from "zod";
import type { Coordinate, RoadEdge } from "tempest-react-sdk";

export type TripStatus = "scheduled" | "in_progress" | "finished" | "cancelled";
export type StopStatus = "pending" | "arrived" | "departed" | "skipped";

export interface TripPassenger {
  id: string;
  name: string;
}

export interface TripPlace extends Coordinate {
  name: string;
}

export interface TripStop extends TripPlace {
  id: string;
  order: number;
  address: string;
  status: StopStatus;
  eta_at: string | null;
  boarding_count: number;
  passengers: TripPassenger[];
}

export interface VehiclePosition extends Coordinate {
  heading: number | null;
  speed_kmh: number | null;
  recorded_at: string;
}

export interface Trip {
  id: string;
  line_name: string;
  vehicle_label: string;
  plate: string;
  driver_name: string;
  status: TripStatus;
  departure_at: string;
  origin: TripPlace;
  destination: TripPlace;
  route: Coordinate[];
  stops: TripStop[];
  trail: VehiclePosition[];
  my_stop_id: string | null;
}

export interface Street extends RoadEdge {
  id: string;
  name: string;
}

const positionFrameSchema = z.object({
  type: z.literal("position"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().nullable(),
  speed_kmh: z.number().nullable(),
  recorded_at: z.string(),
});

const stopFrameSchema = z.object({
  type: z.literal("stop"),
  stop_id: z.string(),
  status: z.enum(["pending", "arrived", "departed", "skipped"]),
  eta_at: z.string().nullable(),
});

const tripFrameSchema = z.object({
  type: z.literal("trip"),
  status: z.enum(["scheduled", "in_progress", "finished", "cancelled"]),
});

const pingFrameSchema = z.object({
  type: z.literal("ping"),
});

export const liveFrameSchema = z.discriminatedUnion("type", [
  positionFrameSchema,
  stopFrameSchema,
  tripFrameSchema,
  pingFrameSchema,
]);

export type LiveFrame = z.infer<typeof liveFrameSchema>;
export type PositionFrame = z.infer<typeof positionFrameSchema>;
```

Pedaço por pedaço:

- **`TripStop` e `TripPlace` estendem `Coordinate`.** Como o backend já manda `latitude`/`longitude`, uma parada **é** uma coordenada: ela entra direto em `estimateTravel`, `boundingBox` e no marcador do mapa, sem conversão.
- **`recorded_at` é a hora em que o GPS tomou a posição**, não a hora em que o frame chegou. É ela que diz se a posição está velha.
- **Os frames são uma união discriminada por `type`.** O `liveFrameSchema` é o que o [`useWebSocket` valida](../websocket.md#validar-o-frame-com-schema) antes de entregar: um frame fora do contrato é descartado e nunca vira uma van em `latitude: undefined`.
- **O `ping` está no schema de propósito.** O `tempest-fastapi-sdk` manda `{"type":"ping"}` como heartbeat. O SDK responde o `pong` mesmo que o schema recuse o ping — mas um ping recusado também chega no `onValidationError`, e o seu log de "backend mudou o contrato" encheria de falso alarme. Declarar o ping resolve.
- **`Street`** é a aresta de rua da seção opcional [Ruas no mapa](#opcional-ruas-no-mapa-e-a-van-na-rua). Se você não for usar, pode apagar.

## Passo 2 — Cliente HTTP e a query da viagem

```ts
// src/trips/api.ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { createApiClient, createQueryKeys, encodeIdSegment } from "tempest-react-sdk";
import type { Trip } from "@/trips/contract";

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
  prefix: "/api",
  withCredentials: true,
});

export const tripKeys = createQueryKeys("trips", {
  detail: (tripId: string) => [tripId] as const,
});

export function useTrip(tripId: string): UseQueryResult<Trip> {
  return useQuery({
    queryKey: tripKeys.detail(tripId),
    queryFn: () => api.get<Trip>(`/trips/${encodeIdSegment(tripId)}`),
  });
}

export function liveTripUrl(tripId: string, channel: "watch" | "drive"): string {
  const http = api.url(`/trips/${encodeIdSegment(tripId)}/${channel}`);
  return http.replace(/^http/, "ws");
}
```

- **[`createApiClient`](../http.md#createapiclient)** com `prefix: "/api"`: os caminhos ficam sem o prefixo, como o serviço FastAPI os declara.
- **[`createQueryKeys`](../query.md#query-keys-tipadas)** dá a key `["trips", tripId]`. O hook de posição vai **escrever** nessa mesma key quando uma parada mudar — por isso ela mora num lugar só.
- **`encodeIdSegment`** escapa o id antes de ir para o caminho: um id com `/` não vira outra rota.
- **`liveTripUrl`** usa `api.url()` — a URL absoluta que o cliente atingiria, com o mesmo `baseURL` e `prefix` — e troca `http` por `ws` (e `https` por `wss`). O socket fala com o mesmo servidor, sem uma segunda variável de ambiente.

!!! tip "Autenticação do socket"
    O navegador não deixa um `WebSocket` mandar header `Authorization`. Aqui a sessão vai por cookie (`withCredentials: true` no HTTP, e o handshake do socket leva o cookie do mesmo site). Se o seu backend autentica por token, siga o que ele espera no handshake — o `useWebSocket` aceita `protocols`.

## Passo 3 — A posição ao vivo

Este é o coração da receita. O hook abre o socket, transforma cada frame em estado e responde à pergunta que a tela mais precisa: **dá para confiar nessa posição?**

```ts
// src/trips/use-live-vehicle.ts
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useInterval,
  useWebSocket,
  type TrackPoint,
  type WebSocketLostReason,
} from "tempest-react-sdk";
import { liveTripUrl, tripKeys } from "@/trips/api";
import { liveFrameSchema, type LiveFrame, type Trip, type VehiclePosition } from "@/trips/contract";

export const STALE_AFTER_MS = 30_000;
const MAX_TRAIL_POINTS = 600;

export type SignalState = "connecting" | "waiting" | "live" | "stale" | "lost";

export interface LiveVehicle {
  position: TrackPoint | null;
  trail: TrackPoint[];
  signal: SignalState;
  lostReason: WebSocketLostReason | null;
  now: number;
  reconnect: () => void;
}

export function toTrackPoint(position: VehiclePosition): TrackPoint {
  return {
    latitude: position.latitude,
    longitude: position.longitude,
    timestamp: Date.parse(position.recorded_at),
    heading: position.heading,
    speed: position.speed_kmh === null ? null : position.speed_kmh / 3.6,
  };
}

export function useLiveVehicle(trip: Trip): LiveVehicle {
  const queryClient = useQueryClient();
  const [received, setReceived] = useState<TrackPoint[]>([]);
  const [reconnecting, setReconnecting] = useState<boolean>(false);
  const [lostReason, setLostReason] = useState<WebSocketLostReason | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useInterval(() => setNow(Date.now()), 5_000);

  const patchTrip = (update: (current: Trip) => Trip): void => {
    queryClient.setQueryData<Trip>(tripKeys.detail(trip.id), (current) =>
      current ? update(current) : current,
    );
  };

  const onFrame = (frame: LiveFrame): void => {
    if (frame.type === "position") {
      const point = toTrackPoint(frame);
      setReceived((previous) => [...previous, point].slice(-MAX_TRAIL_POINTS));
      return;
    }
    if (frame.type === "stop") {
      patchTrip((current) => ({
        ...current,
        stops: current.stops.map((stop) =>
          stop.id === frame.stop_id
            ? { ...stop, status: frame.status, eta_at: frame.eta_at }
            : stop,
        ),
      }));
      return;
    }
    if (frame.type === "trip") {
      patchTrip((current) => ({ ...current, status: frame.status }));
    }
  };

  const socket = useWebSocket<LiveFrame>(liveTripUrl(trip.id, "watch"), {
    enabled: trip.status === "in_progress",
    schema: liveFrameSchema,
    silenceTimeout: 75_000,
    onValidationError: (issues, raw) => {
      console.warn("frame fora do contrato", issues, raw.slice(0, 120));
    },
    onMessage: ({ data }) => onFrame(data),
    onOpen: () => setLostReason(null),
    onReconnecting: () => setReconnecting(true),
    onReconnected: () => {
      setReconnecting(false);
      void queryClient.invalidateQueries({ queryKey: tripKeys.detail(trip.id) });
    },
    onLost: (reason) => {
      setReconnecting(false);
      setLostReason(reason);
    },
  });

  const trail = useMemo<TrackPoint[]>(() => {
    const history = trip.trail.map(toTrackPoint);
    const lastKnown = history.at(-1)?.timestamp ?? 0;
    return [...history, ...received.filter((point) => point.timestamp > lastKnown)];
  }, [trip.trail, received]);

  const position = trail.at(-1) ?? null;

  const signal: SignalState = lostReason
    ? "lost"
    : reconnecting || socket.status === "connecting"
      ? "connecting"
      : position === null
        ? "waiting"
        : now - position.timestamp > STALE_AFTER_MS
          ? "stale"
          : "live";

  const reconnect = (): void => {
    setLostReason(null);
    socket.reconnect();
    void queryClient.invalidateQueries({ queryKey: tripKeys.detail(trip.id) });
  };

  return { position, trail, signal, lostReason, now, reconnect };
}
```

Pedaço por pedaço:

- **`enabled: trip.status === "in_progress"`** — viagem agendada ou encerrada não abre socket nenhum.
- **`schema: liveFrameSchema`** — cada frame passa pelo zod antes do `onMessage`. O que não casa vai para o `onValidationError`, que aqui só loga; em produção, mande para o seu logger.
- **`silenceTimeout: 75_000`** — um link de celular que morre no meio **não dispara evento nenhum**: o socket continua "aberto" e nada chega. Com 75 s de silêncio (≈ 2,5× o ping de 30 s deste backend), o SDK derruba e reconecta sozinho. Detalhes em [Falhas que não disparam evento](../websocket.md#falhas-que-nao-disparam-evento).
- **`onReconnecting` / `onReconnected` / `onLost`** — os três estados que [não são a mesma coisa](../websocket.md#reconectando-erro). Reconectar é discreto; só `onLost` merece um botão. Ao voltar, o hook **invalida a query da viagem**: os frames de parada que se perderam no buraco voltam pelo `GET`.
- **Frames de parada e de viagem escrevem no cache da query** com `setQueryData`. A tela não tem dois estados da mesma viagem — o painel, o mapa e a lista leem do mesmo lugar.
- **A trilha junta duas fontes**: o histórico que veio no `GET` (`trip.trail`) e o que chegou pelo socket depois. O filtro `timestamp > lastKnown` evita duplicar o trecho quando o refetch depois da reconexão traz pontos que o socket também já tinha mandado.
- **`useInterval` atualiza `now` a cada 5 s.** Sem ele, "há 1 min" ficaria congelado na tela: nada re-renderiza quando o socket fica em silêncio — que é justamente o caso que importa.
- **`signal`** resume tudo em um estado: `connecting`, `waiting` (aberto, sem posição ainda), `live`, `stale` (última posição há mais de 30 s) e `lost`.

!!! warning "Posição velha parece posição boa"
    O mapa não sabe a idade da posição: a van continua desenhada onde estava, com a mesma seta. Quem diz "isso tem 4 minutos" é a sua tela — por isso o `signal` existe e o `SignalStatus` do passo 5 aparece logo acima do mapa.

## Passo 4 — Paradas viram marcadores

```tsx
// src/trips/trip-markers.tsx
import type { ReactElement } from "react";
import { Flag } from "lucide-react";
import type { LiveRouteMarker } from "tempest-react-sdk";
import type { Trip, TripStop } from "@/trips/contract";

export type TripViewer = "passenger" | "driver";

const clock = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function formatClock(value: string | Date): string {
  return clock.format(typeof value === "string" ? new Date(value) : value);
}

function stopLabel(stop: TripStop, isMine: boolean): string {
  const served = stop.status === "departed" ? " (já atendida)" : "";
  const mine = isMine ? "Seu embarque — " : "";
  return `${mine}Parada ${stop.order}, ${stop.name}${served}`;
}

function StopDetails({ stop, viewer }: { stop: TripStop; viewer: TripViewer }): ReactElement {
  return (
    <div>
      <strong>
        {stop.order}. {stop.name}
      </strong>
      <p>{stop.address}</p>
      {stop.eta_at && stop.status === "pending" && <p>Previsão: {formatClock(stop.eta_at)}</p>}
      {viewer === "driver" && stop.passengers.length > 0 && (
        <ul>
          {stop.passengers.map((passenger) => (
            <li key={passenger.id}>{passenger.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function tripMarkers(trip: Trip, viewer: TripViewer): LiveRouteMarker[] {
  const stops = [...trip.stops]
    .sort((a, b) => a.order - b.order)
    .map((stop): LiveRouteMarker => {
      const isMine = viewer === "passenger" && stop.id === trip.my_stop_id;
      const pendingBoarding = stop.status === "pending" ? stop.boarding_count : 0;
      return {
        id: stop.id,
        label: stopLabel(stop, isMine),
        latitude: stop.latitude,
        longitude: stop.longitude,
        kind: "stop",
        glyphText: String(stop.order),
        emphasis: isMine,
        badge: viewer === "driver" && pendingBoarding > 0 ? pendingBoarding : undefined,
        content: <StopDetails stop={stop} viewer={viewer} />,
      };
    });

  return [
    {
      id: "origin",
      label: `Saída — ${trip.origin.name}`,
      kind: "origin",
      latitude: trip.origin.latitude,
      longitude: trip.origin.longitude,
    },
    ...stops,
    {
      id: "destination",
      label: `Chegada — ${trip.destination.name}`,
      kind: "destination",
      icon: <Flag />,
      latitude: trip.destination.latitude,
      longitude: trip.destination.longitude,
    },
  ];
}
```

- **`glyphText: String(stop.order)`** escreve o número da parada **dentro** do glifo. Quem olha o mapa sabe que a van passa no 2 antes do 3.
- **`emphasis: isMine`** cresce o glifo do embarque da Juliana e põe um halo na mesma cor. Continua sendo uma parada — só que a dela. Veja [Simbologia](../geo.md#simbologia-destaque-numero-icone-e-tamanho).
- **`badge`** só na visão do motorista, e só em parada pendente: é a contagem de quem ainda vai embarcar ali. Parada atendida perde o selo.
- **`icon: <Flag />`** na chegada: um ícone do `lucide-react` cabe direto e herda a tinta do glifo.
- **`content`** abre um painel ao tocar no marcador. Para o motorista, a lista de nomes; para o passageiro, o endereço e a previsão.
- **O `label` repete em texto o que o glifo mostra** — "Seu embarque — Parada 3, …" e "(já atendida)". O leitor de tela lê o `label` e o tipo; `emphasis`, `glyphText` e `icon` são só visuais.

## Passo 5 — O mapa das duas telas

```tsx
// src/trips/TripMap.tsx
import { useMemo, type ReactElement } from "react";
import { Flag } from "lucide-react";
import {
  LiveRouteMap,
  LiveRouteMapLegend,
  useMediaQuery,
  type LiveRouteLegendItem,
  type MatchedFix,
  type RoadGraph,
  type TrackPoint,
} from "tempest-react-sdk";
import type { Street, Trip } from "@/trips/contract";
import "@/trips/trip-map.css";
import { tripMarkers, type TripViewer } from "@/trips/trip-markers";

export interface TripMapProps {
  trip: Trip;
  viewer: TripViewer;
  vehicle: TrackPoint | null;
  trail: readonly TrackPoint[];
  etaLabel?: string;
  roads?: RoadGraph<Street>;
  onMatch?: (match: MatchedFix<Street> | null) => void;
}

const PASSENGER_LEGEND: LiveRouteLegendItem[] = [
  { symbol: "stop", label: "Seu embarque", emphasis: true },
  { symbol: "stop", label: "Outras paradas, na ordem", glyphText: "1" },
  { symbol: "destination", label: "Chegada", icon: <Flag /> },
  { symbol: "vehicle", label: "Van" },
  { symbol: "trail", label: "Já percorrido" },
];

const DRIVER_LEGEND: LiveRouteLegendItem[] = [
  { symbol: "origin", label: "Garagem" },
  { symbol: "stop", label: "Parada, na ordem", glyphText: "1" },
  { symbol: "destination", label: "Chegada", icon: <Flag /> },
  { symbol: "route", label: "Rota planejada" },
  { symbol: "trail", label: "Já percorrido" },
];

export function TripMap({
  trip,
  viewer,
  vehicle,
  trail,
  etaLabel,
  roads,
  onMatch,
}: TripMapProps): ReactElement {
  const isPhone = useMediaQuery("(max-width: 640px)");
  const isTouch = useMediaQuery("(pointer: coarse)");
  const markerScale = isTouch ? 1.25 : 1;
  const markers = useMemo(() => tripMarkers(trip, viewer), [trip, viewer]);

  return (
    <div className="trip-map">
      <LiveRouteMap
        route={trip.route}
        trail={trail}
        vehicle={
          vehicle
            ? {
                position: vehicle,
                heading: vehicle.heading ?? null,
                label: `${trip.vehicle_label}, placa ${trip.plate}`,
              }
            : null
        }
        markers={markers}
        follow
        etaLabel={etaLabel}
        height={isPhone ? 320 : 480}
        markerScale={markerScale}
        label={`Mapa da ${trip.line_name}`}
        roads={roads}
        onMatch={onMatch}
      />
      <LiveRouteMapLegend
        markerScale={markerScale}
        items={viewer === "passenger" ? PASSENGER_LEGEND : DRIVER_LEGEND}
      />
    </div>
  );
}
```

- **`route`** é a rota planejada, tracejada; **`trail`** é o caminho percorrido, sólido. A rota e os marcadores decidem o enquadramento — a van **não** entra nele, então uma posição nova não dá zoom-out.
- **`follow`** mantém a van à vista sem mudar o zoom. Se a Juliana arrasta o mapa para olhar o próprio ponto, o seguir pausa e aparece **Recentralizar**.
- **`vehicle.heading`** vem do GPS. Sem ele, a van vira um ponto — ou, com `roads`, segue a direção da rua.
- **`etaLabel`** é o que o leitor de tela anuncia, numa região educada. O mapa não calcula ETA: ela vem do passo 6.
- **`markerScale` 1,25 em tela de toque** (`pointer: coarse`) deixa o número legível no celular. O alvo de toque já é 44 px em qualquer escala — a escala é para **ler**, não para conseguir tocar.
- **[`LiveRouteMapLegend`](../geo.md#legenda-liveroutemaplegend)** desenha os mesmos glifos do mapa. Passe o mesmo `markerScale` para eles baterem.

## Passo 6 — Indicador de sinal

```tsx
// src/trips/SignalStatus.tsx
import type { ReactElement } from "react";
import { Badge, Banner, Button, relativeTime, type BadgeVariant } from "tempest-react-sdk";
import type { LiveVehicle, SignalState } from "@/trips/use-live-vehicle";

const VARIANT: Record<Exclude<SignalState, "lost">, BadgeVariant> = {
  connecting: "info",
  waiting: "neutral",
  live: "success",
  stale: "warning",
};

export function SignalStatus({ live }: { live: LiveVehicle }): ReactElement {
  if (live.signal === "lost") {
    return (
      <Banner
        variant="danger"
        title={live.lostReason === "rejected" ? "Acesso ao rastreio negado" : "Sem conexão"}
        action={
          live.lostReason === "rejected" ? undefined : (
            <Button size="sm" onClick={live.reconnect}>
              Tentar de novo
            </Button>
          )
        }
      >
        {live.lostReason === "rejected"
          ? "Esta viagem não está mais disponível para a sua conta."
          : "Não conseguimos falar com o servidor. O mapa mostra a última posição recebida."}
      </Banner>
    );
  }

  const seen = live.position ? relativeTime(live.position.timestamp, { now: live.now }) : null;

  const text: Record<Exclude<SignalState, "lost">, string> = {
    connecting: "Conectando ao veículo…",
    waiting: "Aguardando a primeira posição",
    live: "Ao vivo",
    stale: `Sem sinal do veículo · última posição ${seen ?? ""}`,
  };

  return (
    <Badge variant={VARIANT[live.signal]} dot role="status">
      {text[live.signal]}
    </Badge>
  );
}
```

- **[`Badge`](../components/feedback.md#badge)** com `dot` e `role="status"` para os estados que se resolvem sozinhos: conectando, aguardando, ao vivo, sem sinal.
- **[`Banner`](../components/feedback.md#banner)** só para `lost`, o único estado em que a pessoa pode fazer alguma coisa. `"rejected"` (o servidor recusou com 4400–4499) não ganha botão: tentar de novo não muda uma recusa.
- **`relativeTime(…, { now })`** usa o `now` que o hook atualiza. O componente [`RelativeTime`](../components/utility.md#relativetime) calcula na hora do render e não aceita `now` — por isso o texto aqui usa a função.

## Passo 7 — Próxima parada e ETA

```tsx
// src/trips/NextStopPanel.tsx
import type { ReactElement } from "react";
import {
  Card,
  EmptyState,
  Stat,
  Timeline,
  estimateTravel,
  type TimelineItem,
  type TimelineMarker,
  type TrackPoint,
} from "tempest-react-sdk";
import type { StopStatus, Trip, TripStop } from "@/trips/contract";
import { formatClock, type TripViewer } from "@/trips/trip-markers";

export interface StopEta {
  stop: TripStop;
  minutes: number;
  at: Date;
  source: "backend" | "estimate";
}

const MARKER: Record<StopStatus, TimelineMarker> = {
  pending: "neutral",
  arrived: "primary",
  departed: "success",
  skipped: "warning",
};

const STATUS_TEXT: Record<StopStatus, string> = {
  pending: "",
  arrived: "na parada agora",
  departed: "atendida",
  skipped: "pulada",
};

export function nextStop(trip: Trip, viewer: TripViewer): TripStop | null {
  const open = [...trip.stops]
    .sort((a, b) => a.order - b.order)
    .filter((stop) => stop.status === "pending" || stop.status === "arrived");
  if (viewer === "passenger") {
    return open.find((stop) => stop.id === trip.my_stop_id) ?? null;
  }
  return open[0] ?? null;
}

export function stopEta(stop: TripStop, position: TrackPoint | null, now: number): StopEta | null {
  if (stop.eta_at) {
    const at = new Date(stop.eta_at);
    const minutes = Math.max(0, Math.round((at.getTime() - now) / 60_000));
    return { stop, minutes, at, source: "backend" };
  }
  if (!position) return null;
  const estimate = estimateTravel(position, stop, "bus");
  const minutes = Math.round(estimate.duration_minutes);
  return { stop, minutes, at: new Date(now + minutes * 60_000), source: "estimate" };
}

export function etaAnnouncement(eta: StopEta | null): string | undefined {
  if (!eta) return undefined;
  const where = `parada ${eta.stop.order} (${eta.stop.name})`;
  return eta.minutes <= 1
    ? `Van chegando à ${where}`
    : `Van chega à ${where} em ${eta.minutes} minutos`;
}

function timelineItems(trip: Trip): TimelineItem[] {
  return [...trip.stops]
    .sort((a, b) => a.order - b.order)
    .map((stop) => ({
      id: stop.id,
      title: `${stop.order}. ${stop.name}`,
      description: stop.address,
      meta:
        stop.status === "pending" && stop.eta_at
          ? formatClock(stop.eta_at)
          : STATUS_TEXT[stop.status],
      marker: stop.id === trip.my_stop_id ? "primary" : MARKER[stop.status],
    }));
}

export interface NextStopPanelProps {
  trip: Trip;
  viewer: TripViewer;
  eta: StopEta | null;
}

export function NextStopPanel({ trip, viewer, eta }: NextStopPanelProps): ReactElement {
  const stop = nextStop(trip, viewer);
  const title = viewer === "passenger" ? "Seu embarque" : "Próxima parada";

  if (!stop) {
    return (
      <Card title={title}>
        <EmptyState
          title={viewer === "passenger" ? "Você já embarcou" : "Todas as paradas atendidas"}
          description={`Chegada em ${trip.destination.name}.`}
        />
      </Card>
    );
  }

  const value = !eta ? "—" : eta.minutes <= 1 ? "Chegando" : `${eta.minutes} min`;
  const hint = !eta
    ? "Aguardando a posição da van"
    : `Previsão ${formatClock(eta.at)}${eta.source === "estimate" ? " · estimativa" : ""}`;

  return (
    <Card title={title}>
      <Stat label={`${stop.order}. ${stop.name}`} value={value} hint={hint} />
      <Timeline items={timelineItems(trip)} />
    </Card>
  );
}
```

- **`nextStop`**: para o passageiro, é o embarque dele enquanto estiver pendente; para o motorista, a primeira parada aberta.
- **`stopEta` prefere a previsão do backend** (`eta_at`), que conhece o trânsito e a ordem das paradas. Sem ela, cai para [`estimateTravel`](../geo.md#estimativa-de-viagem-offline-estimatetravel) em modo `"bus"`: linha reta × fator de sinuosidade, sem rede. O painel diz "estimativa" para a pessoa saber qual das duas está vendo.
- **[`Stat`](../components/feedback.md#stat)** mostra o número grande; **[`Timeline`](../components/data.md#timeline)** a viagem inteira, com a cor do marcador pelo status e o embarque do passageiro em `primary`.
- Sem parada pela frente, o painel vira um **[`EmptyState`](../components/feedback.md#emptystate)** — "Você já embarcou" não é erro.

!!! note "Estimativa local é aproximada"
    `estimateTravel` não conhece rua nem semáforo. Ela serve para não deixar o painel vazio entre dois `eta_at` — não para substituir a previsão do backend.

## Passo 8 — A tela do passageiro

```tsx
// src/pages/PassengerTripPage.tsx
import type { ReactElement } from "react";
import { useParams } from "react-router";
import { BusFront } from "lucide-react";
import {
  EmptyState,
  ErrorState,
  OfflineIndicator,
  Skeleton,
  describeApiError,
  useMediaQuery,
} from "tempest-react-sdk";
import { useTrip } from "@/trips/api";
import type { Trip } from "@/trips/contract";
import { NextStopPanel, etaAnnouncement, nextStop, stopEta } from "@/trips/NextStopPanel";
import { SignalStatus } from "@/trips/SignalStatus";
import { TripMap } from "@/trips/TripMap";
import { formatClock } from "@/trips/trip-markers";
import { useLiveVehicle } from "@/trips/use-live-vehicle";

function LiveTrip({ trip }: { trip: Trip }): ReactElement {
  const live = useLiveVehicle(trip);
  const isPhone = useMediaQuery("(max-width: 640px)");
  const stop = nextStop(trip, "passenger");
  const eta = stop ? stopEta(stop, live.position, live.now) : null;

  return (
    <main
      style={{
        display: "grid",
        gap: 16,
        gridTemplateColumns: isPhone ? "1fr" : "minmax(0, 2fr) minmax(280px, 1fr)",
      }}
    >
      <section aria-label="Mapa">
        <header>
          <h1>{trip.line_name}</h1>
          <p>
            {trip.vehicle_label} · placa {trip.plate} · motorista {trip.driver_name}
          </p>
          <SignalStatus live={live} />
        </header>
        <TripMap
          trip={trip}
          viewer="passenger"
          vehicle={live.position}
          trail={live.trail}
          etaLabel={etaAnnouncement(eta)}
        />
      </section>
      <NextStopPanel trip={trip} viewer="passenger" eta={eta} />
    </main>
  );
}

export function PassengerTripPage(): ReactElement {
  const { tripId = "" } = useParams<{ tripId: string }>();
  const query = useTrip(tripId);

  if (query.isPending) {
    return (
      <main aria-busy="true">
        <Skeleton variant="text" width="60%" />
        <Skeleton height={320} />
        <Skeleton variant="text" width="40%" />
      </main>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        title="Não foi possível abrir a viagem"
        description={describeApiError(query.error, "Tente de novo em instantes.")}
        onRetry={() => void query.refetch()}
        retryLabel="Tentar de novo"
      />
    );
  }

  const trip = query.data;

  if (trip.status === "scheduled") {
    return (
      <EmptyState
        icon={<BusFront />}
        title="A viagem ainda não começou"
        description={`Saída prevista às ${formatClock(trip.departure_at)}. O mapa aparece quando a van sair da garagem.`}
      />
    );
  }

  if (trip.status === "cancelled") {
    return (
      <EmptyState
        title="Viagem cancelada"
        description="A empresa cancelou esta viagem. Confira o aviso no seu e-mail."
      />
    );
  }

  if (trip.status === "finished") {
    return (
      <EmptyState
        title="Viagem encerrada"
        description={`A van chegou em ${trip.destination.name}.`}
      />
    );
  }

  return (
    <>
      <OfflineIndicator
        position="top"
        offlineLabel="Você está offline — o mapa vai parar de andar."
      />
      <LiveTrip trip={trip} />
    </>
  );
}
```

Os estados, de cima para baixo:

- ⏳ **Carregando** — [`Skeleton`](../components/feedback.md#skeleton) no formato da tela: título, mapa, linha de status.
- ❌ **Erro** — [`ErrorState`](../components/feedback.md#errorstate) com a frase do [`describeApiError`](../http.md#do-erro-tipado-para-a-frase-na-tela-describeapierror): offline vira "sem conexão", 404 usa o `detail` do backend, e nada vira "erro 0".
- 🗓️ **Ainda não começou / cancelada / encerrada** — [`EmptyState`](../components/feedback.md#emptystate). Não há mapa para mostrar, e o socket nem abre (`enabled` é falso).
- ✅ **Em andamento** — o mapa, o sinal e o painel. O `LiveTrip` é um componente separado porque `useLiveVehicle` precisa da viagem já carregada.
- 📴 **Offline** — [`OfflineIndicator`](../components/feedback.md#offlineindicator) avisa no topo. Enquanto o rádio está desligado, o `useWebSocket` **suspende** as tentativas (`waitForOnline`, ligado por padrão) e volta sozinho no evento `online`.
- 📱 **Celular** — abaixo de 640 px, a grade vira uma coluna: mapa em cima, painel embaixo, e o mapa encolhe para 320 px de altura.

!!! tip "Bottom sheet no celular"
    Num app que é só mapa, o painel costuma ir para um [`BottomSheet`](../components/overlay.md#bottomsheet) por cima do mapa. A troca é só no `LiveTrip`: o `TripMap` e o `NextStopPanel` não mudam.

## Passo 9 — A tela do motorista

```tsx
// src/pages/DriverTripPage.tsx
import { useEffect, useMemo, type ReactElement } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";
import {
  Badge,
  ErrorState,
  OfflineIndicator,
  Skeleton,
  describeApiError,
  usePositionTracker,
  useWebSocket,
} from "tempest-react-sdk";
import { liveTripUrl, tripKeys, useTrip } from "@/trips/api";
import { liveFrameSchema, type LiveFrame, type PositionFrame, type Trip } from "@/trips/contract";
import { NextStopPanel, etaAnnouncement, nextStop, stopEta } from "@/trips/NextStopPanel";
import { TripMap } from "@/trips/TripMap";

function Driving({ trip }: { trip: Trip }): ReactElement {
  const queryClient = useQueryClient();
  const gps = usePositionTracker({
    autoStart: true,
    minDistanceKm: 0.01,
    maxPoints: 2_000,
    positionOptions: { enableHighAccuracy: true, maximumAge: 0 },
  });

  const socket = useWebSocket<LiveFrame>(liveTripUrl(trip.id, "drive"), {
    schema: liveFrameSchema,
    silenceTimeout: 75_000,
    onMessage: ({ data }) => {
      if (data.type === "stop" || data.type === "trip") {
        void queryClient.invalidateQueries({ queryKey: tripKeys.detail(trip.id) });
      }
    },
  });

  const { lastPoint } = gps;
  const { send } = socket;

  useEffect(() => {
    if (!lastPoint) return;
    const frame: PositionFrame = {
      type: "position",
      latitude: lastPoint.latitude,
      longitude: lastPoint.longitude,
      heading: lastPoint.heading ?? null,
      speed_kmh: lastPoint.speed == null ? null : Math.round(lastPoint.speed * 3.6),
      recorded_at: new Date(lastPoint.timestamp).toISOString(),
    };
    send(JSON.stringify(frame));
  }, [lastPoint, send]);

  const stop = nextStop(trip, "driver");
  const now = lastPoint?.timestamp ?? Date.now();
  const eta = useMemo(() => (stop ? stopEta(stop, lastPoint, now) : null), [stop, lastPoint, now]);

  if (gps.status === "error" && gps.lastError?.code === 1) {
    return (
      <ErrorState
        title="Precisamos da sua localização"
        description="Sem o GPS, os passageiros não veem a van. Libere a localização nas configurações do navegador."
        onRetry={gps.start}
        retryLabel="Já liberei"
      />
    );
  }

  return (
    <main style={{ display: "grid", gap: 16 }}>
      <header>
        <h1>{trip.line_name}</h1>
        <Badge variant={socket.status === "open" ? "success" : "warning"} dot role="status">
          {socket.status === "open" ? "Transmitindo posição" : "Sem conexão — tentando de novo"}
        </Badge>
        {gps.status === "error" && (
          <Badge variant="warning" dot>
            GPS sem sinal
          </Badge>
        )}
      </header>
      <TripMap
        trip={trip}
        viewer="driver"
        vehicle={lastPoint}
        trail={gps.points}
        etaLabel={etaAnnouncement(eta)}
      />
      <NextStopPanel trip={trip} viewer="driver" eta={eta} />
    </main>
  );
}

export function DriverTripPage(): ReactElement {
  const { tripId = "" } = useParams<{ tripId: string }>();
  const query = useTrip(tripId);

  if (query.isPending) return <Skeleton height={480} />;

  if (query.isError) {
    return (
      <ErrorState
        title="Não foi possível abrir a viagem"
        description={describeApiError(query.error, "Tente de novo em instantes.")}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <>
      <OfflineIndicator
        position="top"
        offlineLabel="Sem internet — a posição volta a sair quando o sinal voltar."
      />
      <Driving trip={query.data} />
    </>
  );
}
```

- **[`usePositionTracker`](../geo.md#rastreamento-ao-vivo-usepositiontracker)** liga o GPS na montagem (`autoStart`), com alta precisão, e descarta posições a menos de 10 m da anterior — parado no sinal, o celular não manda nada.
- **Cada `lastPoint` novo vira um frame `position`** no socket `drive`. O tipo `PositionFrame` vem do mesmo schema que o passageiro valida: se o contrato mudar, o TypeScript reclama dos dois lados.
- **`send()` devolve `false` com o socket caído, e a posição é descartada.** É o que você quer aqui: uma posição de 40 s atrás não ajuda ninguém, e a próxima chega em segundos.
- **O mapa do motorista usa o GPS local**, não o eco do servidor: zero latência, e funciona mesmo sem conexão.
- **Recusa de localização é terminal** (`lastError.code === 1`) e ganha uma tela própria. Sem sinal de GPS (túnel) é passageiro: um selo, e o tracker volta sozinho na próxima leitura. Veja [Erro passageiro, recusa e `lastError`](../geo.md#erro-passageiro-recusa-e-lasterror).
- **Frames `stop` e `trip` invalidam a query**: quando o backend marca a chegada numa parada, o painel e os selos do motorista se atualizam.

??? info "E se cada posição tiver que chegar?"
    Se o backend usa a trilha para cobrança por km, perder posição durante uma queda não serve. Ligue `queueWhileClosed: true` no `useWebSocket`: o `send()` bufferiza durante o backoff (até `maxQueuedMessages`, 100 por padrão) e despeja tudo, na ordem, quando o socket volta. Com login por cookie, passe também `getPrincipal: () => motoristaId` — o que foi enfileirado por um motorista não sai na sessão de outro.

## Opcional — ruas no mapa e a van na rua

O GPS erra de 3 a 30 m na cidade. Na tela do passageiro isso aparece como a van "andando" pela calçada ou pulando para a rua paralela. Passe o grafo de ruas da região em [`roads`](../geo.md#ruas-no-mapa-e-veiculo-na-rua-roads) e o mapa desenha as ruas e encaixa a van e a trilha nelas — sem tiles e sem código de encaixe no app.

O backend serve o recorte do OpenStreetMap da região (veja [De onde vem o grafo](../geo.md#de-onde-vem-o-grafo)) em `GET /api/roads?bbox=…`:

```ts
// src/trips/use-road-graph.ts
import { useQuery } from "@tanstack/react-query";
import {
  STALE_TIME,
  boundingBox,
  createRoadGraph,
  expandBounds,
  type Coordinate,
  type RoadGraph,
} from "tempest-react-sdk";
import { api } from "@/trips/api";
import type { Street, Trip } from "@/trips/contract";

interface RoadTile {
  nodes: Coordinate[];
  edges: Street[];
}

function bboxParam(trip: Trip): string | null {
  const box = boundingBox([trip.origin, ...trip.route, trip.destination]);
  if (!box) return null;
  const padded = expandBounds(box, 0.1);
  return [padded.minLongitude, padded.minLatitude, padded.maxLongitude, padded.maxLatitude]
    .map((value) => value.toFixed(4))
    .join(",");
}

export function useRoadGraph(trip: Trip): RoadGraph<Street> | undefined {
  const bbox = bboxParam(trip);
  const query = useQuery({
    queryKey: ["roads", bbox],
    queryFn: async () => {
      const tile = await api.get<RoadTile>("/roads", { params: { bbox: bbox ?? "" } });
      return createRoadGraph(tile);
    },
    enabled: bbox !== null,
    staleTime: STALE_TIME.INFINITE,
  });
  return query.data;
}
```

```tsx
// src/trips/TripMapOnRoads.tsx
import { useState, type ReactElement } from "react";
import type { MatchedFix } from "tempest-react-sdk";
import type { Street } from "@/trips/contract";
import { TripMap, type TripMapProps } from "@/trips/TripMap";
import { useRoadGraph } from "@/trips/use-road-graph";

export function TripMapOnRoads(props: Omit<TripMapProps, "roads" | "onMatch">): ReactElement {
  const roads = useRoadGraph(props.trip);
  const [street, setStreet] = useState<string>("");

  const onMatch = (match: MatchedFix<Street> | null): void => {
    setStreet(match ? match.edge.name : "");
  };

  return (
    <div>
      <p aria-live="polite">{street ? `Passando pela ${street}` : " "}</p>
      <TripMap {...props} roads={roads} onMatch={onMatch} />
    </div>
  );
}
```

Na `PassengerTripPage`, troque `<TripMap … />` por `<TripMapOnRoads … />` com as mesmas props.

- **O grafo é montado uma vez por região** (`staleTime: STALE_TIME.INFINITE`) e a **mesma instância** vai para o mapa a cada render. Um grafo novo reinicia o encaixe.
- **`onMatch`** recebe a sua própria aresta — com `name` e `id` — a cada posição encaixada, ou `null` fora de qualquer rua. Daí sai o "Agora em: Av. Frei Serafim".
- **O `recorded_at` vira `timestamp`** no `toTrackPoint` do passo 3, e é ele que mantém o encaixe encadeado quando a van reporta a cada 5–30 s. Veja [Fonte esparsa](../geo.md#fonte-esparsa-timestamp).
- **Quem não passa `roads` não baixa o matcher**: ele entra por import dinâmico só quando um mapa com `roads` monta.

## Tema: os tokens que o mapa lê

O mapa e a legenda são temados só por tokens `--tempest-*`. Para dar a cor da transportadora **só ao mapa**, defina os tokens numa classe que envolve o `TripMap` — o `trip-map.css` que ele importa:

```css
/* src/trips/trip-map.css */
.trip-map {
  --tempest-primary: #0f766e;
  --tempest-primary-foreground: #ffffff;
  --tempest-info-solid: #1d4ed8;
  --tempest-live-route-stop-ink: #ffffff;
  --tempest-live-route-badge: #9a3412;
  --tempest-live-route-badge-text: #ffffff;
}

[data-tempest-theme="dark"] .trip-map {
  --tempest-primary: #2dd4bf;
  --tempest-primary-foreground: #042f2e;
  --tempest-info-solid: #60a5fa;
  --tempest-live-route-stop-ink: #0b1220;
}
```

- **`--tempest-primary` / `--tempest-primary-foreground`**: a trilha e a van / a seta dentro da van.
- **`--tempest-info-solid` / `--tempest-live-route-stop-ink`**: o glifo da parada / o número dentro dele. Troque os dois juntos — o número tem de ler sobre o glifo.
- **`--tempest-live-route-badge` / `--tempest-live-route-badge-text`**: o selo da contagem de embarques.
- A tabela completa está em [Variáveis CSS que o mapa lê](../geo.md#variaveis-css-que-o-mapa-le); para o app inteiro, veja [Customizando tokens](../theme.md#customizando-tokens).

!!! warning "Contraste se mede em browser real"
    Ao trocar um token de glifo, confira o contraste no navegador, nos dois temas: o número da parada precisa de 4,5:1 sobre o glifo, e o glifo de 3:1 sobre o fundo do mapa. O `axe` do jsdom não mede cor.

## Recap

- 📜 **Contrato primeiro**: tipos que estendem `Coordinate` e um schema zod com o `ping` incluso — o mesmo schema valida o que o passageiro recebe e tipa o que o motorista manda.
- 📡 **`useWebSocket`** com `schema`, `silenceTimeout` e os três estados de conexão; `onReconnected` invalida a query para cobrir o buraco.
- ⏱️ **Posição tem idade**: `recorded_at` + um `now` que anda com `useInterval` dão o estado "sem sinal há X" que o mapa sozinho não mostra.
- 🗺️ **`LiveRouteMap`** com `route`, `trail`, `vehicle.heading`, `follow`, `glyphText` na ordem, `emphasis` no embarque, `badge` para o motorista, `icon` na chegada, `markerScale` no toque e a **`LiveRouteMapLegend`** com os mesmos glifos.
- 🛰️ **Motorista**: `usePositionTracker` + `send()`; posição velha se descarta, a não ser que a trilha valha dinheiro (`queueWhileClosed`).
- 🧩 **Estados reais**: `Skeleton`, `ErrorState` + `describeApiError`, `EmptyState`, `OfflineIndicator` e uma coluna só no celular.
- 🛣️ **Opcional**: `roads` + `createRoadGraph` encaixam a van na rua e dão o nome da via por `onMatch`.
