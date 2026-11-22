# Live trip (map + WebSocket)

It is 6:40 a.m. and Juliana is waiting at the stop on Av. Frei Serafim. The factory's charter van should pass at 6:50 — but has it already gone by? Is it stuck in traffic? She opens the transport company's app and wants to see **where the van is right now**, **how long until it reaches her stop** and, if the signal drops, **to know the map stopped moving** instead of trusting an old position.

On the other side, Marcos drives the van with a phone mounted on the dashboard. His app **broadcasts the GPS position**, shows the stops in order and how many people board at each one.

Both screens use the same map. In this recipe you will build both, from the backend contract to the theme. 🚐

## What we will build

- 🧭 **Passenger screen**: map with the route, the trail already driven and the van with its heading arrow; **her pickup emphasized**; the other stops **numbered in order**; legend; a panel with the **time until pickup**.
- 🚦 **Driver screen**: the same map with **the boarding count** at each stop (and the list of names on tap), fed by the device's own GPS, which **broadcasts the position** over the WebSocket.
- 📡 **Live position** through the SDK's `useWebSocket`: frame validated with zod, automatic reconnection, refetch after the gap, and a **signal indicator** — live, no signal for X minutes, disconnected with a "try again" button.
- ⏱️ **Next stop and ETA**: the backend's forecast when there is one, and a local estimate when there is not.
- The states a real screen has: **loading**, **trip has not started** (empty), **error**, **success**, **offline** and **phone**.
- Optional: **roads on the map** and the van snapped to the road, with the street name.
- Theme: the **tokens** the map reads.

!!! info "Nothing external"
    [`LiveRouteMap`](../geo.md#live-trip-map-liveroutemap) is pure SVG: no tiles, no Google Maps, no API key. It works offline and in tests. If you host your own tile server it accepts `tileUrl` — but nothing in this recipe needs it.

## The backend contract

The backend is a FastAPI service built with [`tempest-fastapi-sdk`](../integration-fastapi.md), mounted under `/api`. It exposes three things:

| Route | What it does |
| --- | --- |
| `GET /api/trips/{trip_id}` | The whole trip: route, stops, trail so far and the requester's pickup. |
| `WS /api/trips/{trip_id}/watch` | Live frames for the passenger: position, stop change, status change. |
| `WS /api/trips/{trip_id}/drive` | The driver's channel: the app **sends** the position here. |

The `GET` response (abridged):

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

And the WebSocket frames, one per message:

```json
{ "type": "position", "latitude": -5.0761, "longitude": -42.7968, "heading": 215, "speed_kmh": 41, "recorded_at": "2026-11-23T09:44:17Z" }
{ "type": "stop", "stop_id": "stp_01", "status": "arrived", "eta_at": null }
{ "type": "trip", "status": "finished" }
{ "type": "ping" }
```

!!! note "Empty `passengers` for the passenger"
    The backend only fills the names in `passengers` when the requester is the driver. For Juliana the list comes back empty and only `boarding_count` is set: she does not need — and should not — see who boards at each stop. That decision belongs to the backend, not the screen.

## The files

```text
src/
├── trips/
│   ├── contract.ts         types + zod schema of the frames
│   ├── api.ts              HTTP client, query keys, useTrip, socket URL
│   ├── use-live-vehicle.ts live position, trail and signal state
│   ├── trip-markers.tsx    stops → map markers
│   ├── TripMap.tsx         LiveRouteMap + legend, shared by both screens
│   ├── trip-map.css        map tokens
│   ├── SignalStatus.tsx    signal indicator
│   └── NextStopPanel.tsx   next stop, ETA and stop list
└── pages/
    ├── PassengerTripPage.tsx
    └── DriverTripPage.tsx
```

The files import each other through `@/…` — the alias the SDK scaffold already points at `src/`. The UI copy stays in PT-BR: this is a Brazilian app.

## Step 1 — The contract in code

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

export const liveFrameSchema = z.discriminatedUnion("type", [
  positionFrameSchema,
  stopFrameSchema,
  tripFrameSchema,
]);

export type LiveFrame = z.infer<typeof liveFrameSchema>;
export type PositionFrame = z.infer<typeof positionFrameSchema>;
```

Piece by piece:

- **`TripStop` and `TripPlace` extend `Coordinate`.** Since the backend already sends `latitude`/`longitude`, a stop **is** a coordinate: it goes straight into `estimateTravel`, `boundingBox` and the map marker with no conversion.
- **`recorded_at` is when the GPS took the fix**, not when the frame arrived. It is what tells whether the position is old.
- **The frames are a union discriminated by `type`.** `liveFrameSchema` is what [`useWebSocket` validates](../websocket.md#validating-the-frame-with-schema) before delivering: an off-contract frame is dropped and never becomes a van at `latitude: undefined`.
- **`ping` stays out of the schema.** `tempest-fastapi-sdk` sends `{"type":"ping"}` as a heartbeat, and the SDK answers the `pong` and drops the ping without calling `onValidationError` — your "the backend changed the contract" log only hears payload frames. See [The `pong` still goes out](../websocket.md#validating-the-frame-with-schema).
- **`Street`** is the road edge of the optional section [Roads on the map](#optional-roads-on-the-map-and-the-van-on-the-road). Delete it if you will not use it.

## Step 2 — HTTP client and the trip query

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
  return api.wsUrl(`/trips/${encodeIdSegment(tripId)}/${channel}`);
}
```

- **[`createApiClient`](../http.md#createapiclient)** with `prefix: "/api"`: paths go without the prefix, the way the FastAPI service declares them.
- **[`createQueryKeys`](../query.md#typed-query-keys)** gives the key `["trips", tripId]`. The position hook will **write** to this same key when a stop changes — that is why it lives in one place.
- **`encodeIdSegment`** escapes the id before it goes into the path: an id with `/` does not become another route.
- **`liveTripUrl`** uses [`api.wsUrl()`](../http.md#createapiclient) — the URL the client would hit, same `baseURL` and `prefix`, with `http` swapped for `ws` (and `https` for `wss`). The socket talks to the same server with no second environment variable.

!!! tip "Socket authentication"
    The browser does not let a `WebSocket` send an `Authorization` header. Here the session travels by cookie (`withCredentials: true` over HTTP, and the socket handshake carries the same-site cookie). If your backend authenticates by token, follow what it expects in the handshake — `useWebSocket` accepts `protocols`.

## Step 3 — The live position

This is the heart of the recipe. The hook opens the socket, turns each frame into state and answers the question the screen needs most: **can this position be trusted?**

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

Piece by piece:

- **`enabled: trip.status === "in_progress"`** — a scheduled or finished trip opens no socket at all.
- **`schema: liveFrameSchema`** — every frame goes through zod before `onMessage`. What does not match goes to `onValidationError`, which only logs here; in production, send it to your logger.
- **`silenceTimeout: 75_000`** — a phone link that dies mid-flight **fires no event**: the socket stays "open" and nothing arrives. With 75 s of silence (≈ 2.5× this backend's 30 s ping) the SDK drops it and reconnects on its own. Details in [Failures that fire no event](../websocket.md#failures-that-fire-no-event).
- **`onReconnecting` / `onReconnected` / `onLost`** — the three states that [are not the same thing](../websocket.md#reconnecting-error). Reconnecting is quiet; only `onLost` deserves a button. On the way back the hook **invalidates the trip query**: stop frames lost in the gap come back through the `GET`.
- **Stop and trip frames write to the query cache** with `setQueryData`. The screen never holds two states of the same trip — the panel, the map and the list read from one place.
- **The trail joins two sources**: the history that came with the `GET` (`trip.trail`) and what arrived over the socket afterwards. The `timestamp > lastKnown` filter avoids duplicating the stretch when the refetch after a reconnect brings points the socket had already sent.
- **`useInterval` updates `now` every 5 s.** It is what turns `signal` into `stale` when nothing arrives: nothing re-renders while the socket is silent — which is exactly the case that matters. The same `now` goes to step 6's `RelativeTime`, so the whole screen runs on one clock.
- **`signal`** sums it all up in one state: `connecting`, `waiting` (open, no position yet), `live`, `stale` (last position older than 30 s) and `lost`.

!!! info "An old position must not look like a good one"
    The map does not know the position's age — `signal` does. So the page passes `stale` to the map when the signal is `stale` or `lost`: the van stays where it was last seen, gray and without the halo, and the screen reader hears "sem sinal, última posição conhecida". See [States](../geo.md#states-visited-stop-and-stale-position).

## Step 4 — Stops become markers

```tsx
// src/trips/trip-markers.tsx
import type { ReactElement } from "react";
import { Flag } from "lucide-react";
import { formatTime, type LiveRouteMarker } from "tempest-react-sdk";
import type { Trip, TripStop } from "@/trips/contract";

export type TripViewer = "passenger" | "driver";

function stopLabel(stop: TripStop, isMine: boolean): string {
  const mine = isMine ? "Seu embarque — " : "";
  return `${mine}Parada ${stop.order}, ${stop.name}`;
}

function StopDetails({ stop, viewer }: { stop: TripStop; viewer: TripViewer }): ReactElement {
  return (
    <div>
      <strong>
        {stop.order}. {stop.name}
      </strong>
      <p>{stop.address}</p>
      {stop.eta_at && stop.status === "pending" && <p>Previsão: {formatTime(stop.eta_at)}</p>}
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
        visited: stop.status === "departed",
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

- **`glyphText: String(stop.order)`** writes the stop number **inside** the glyph. Whoever looks at the map knows the van passes 2 before 3.
- **`emphasis: isMine`** grows Juliana's pickup glyph and adds a halo in the same color. It is still a stop — just hers. See [Symbology](../geo.md#symbology-emphasis-number-icon-and-size).
- **`badge`** only in the driver's view, and only on a pending stop: it is the count of who still boards there. A served stop loses the badge.
- **`visited`** paints the stop the van already served in gray — what is behind stops looking like what is ahead — and the screen reader hears "visita concluída" after the kind.
- **`icon: <Flag />`** on the arrival: a `lucide-react` icon fits as-is and inherits the glyph's ink.
- **`content`** opens a panel on tapping the marker. For the driver, the list of names; for the passenger, the address and the forecast.
- **The `label` repeats in text what the glyph shows** — "Seu embarque — Parada 3, …". The screen reader reads the `label` and the kind; `emphasis`, `glyphText` and `icon` are visual only. "Already served" does not need to be in the `label`: `visited` says it.

## Step 5 — The map of both screens

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
  stale?: boolean;
  trail: readonly TrackPoint[];
  etaLabel?: string;
  roads?: RoadGraph<Street>;
  onMatch?: (match: MatchedFix<Street> | null) => void;
}

const PASSENGER_LEGEND: LiveRouteLegendItem[] = [
  { symbol: "stop", label: "Seu embarque", emphasis: true },
  { symbol: "stop", label: "Outras paradas, na ordem", glyphText: "1" },
  { symbol: "stop", label: "Parada já atendida", glyphText: "1", visited: true },
  { symbol: "destination", label: "Chegada", icon: <Flag /> },
  { symbol: "vehicle", label: "Van" },
  { symbol: "vehicle", label: "Van sem sinal", stale: true },
  { symbol: "trail", label: "Já percorrido" },
];

const DRIVER_LEGEND: LiveRouteLegendItem[] = [
  { symbol: "origin", label: "Garagem" },
  { symbol: "stop", label: "Parada, na ordem", glyphText: "1" },
  { symbol: "badge", label: "Embarques pendentes na parada", badge: 3 },
  { symbol: "stop", label: "Parada já atendida", glyphText: "1", visited: true },
  { symbol: "destination", label: "Chegada", icon: <Flag /> },
  { symbol: "route", label: "Rota planejada" },
  { symbol: "trail", label: "Já percorrido" },
];

export function TripMap({
  trip,
  viewer,
  vehicle,
  stale = false,
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
                stale,
                staleLabel: "sem sinal, última posição conhecida",
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

- **`route`** is the planned route, dashed; **`trail`** is the path driven, solid. The route and the markers decide the framing — the van does **not** enter it, so a new position does not zoom out.
- **`follow`** keeps the van in sight without changing the zoom. If Juliana drags the map to look at her own stop, following pauses and **Recentralizar** shows up.
- **`vehicle.heading`** comes from the GPS. Without it the van becomes a dot — or, with `roads`, follows the street's direction.
- **`etaLabel`** is what the screen reader announces, in a polite region. The map does not compute an ETA: it comes from step 7.
- **`markerScale` 1.25 on touch screens** (`pointer: coarse`) keeps the number legible on a phone. The touch target is already 44 px at any scale — the scale is for **reading**, not for being able to tap.
- **[`LiveRouteMapLegend`](../geo.md#legend-liveroutemaplegend)** draws the same glyphs as the map. Pass the same `markerScale` so they match.

## Step 6 — Signal indicator

```tsx
// src/trips/SignalStatus.tsx
import type { ReactElement } from "react";
import { Badge, Banner, Button, RelativeTime, type BadgeVariant } from "tempest-react-sdk";
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


  const text: Record<Exclude<SignalState, "lost">, string> = {
    connecting: "Conectando ao veículo…",
    waiting: "Aguardando a primeira posição",
    live: "Ao vivo",
    stale: "Sem sinal do veículo · última posição",
  };

  return (
    <Badge variant={VARIANT[live.signal]} dot role="status">
      {text[live.signal]}
      {live.signal === "stale" && live.position ? (
        <>
          {" "}
          <RelativeTime date={live.position.timestamp} now={live.now} />
        </>
      ) : null}
    </Badge>
  );
}
```

- **[`Badge`](../components/feedback.md#badge)** with `dot` and `role="status"` for the states that resolve on their own: connecting, waiting, live, no signal.
- **[`Banner`](../components/feedback.md#banner)** only for `lost`, the one state where the person can do something. `"rejected"` (the server refused with 4400–4499) gets no button: trying again does not change a refusal.
- **[`RelativeTime`](../components/utility.md#relativetime) with `now`** uses the clock the hook keeps updating, and writes the age in a `<time>` with `dateTime`. Without a clock in the app, `updateEvery` would make the component count on its own.

## Step 7 — Next stop and ETA

```tsx
// src/trips/NextStopPanel.tsx
import type { ReactElement } from "react";
import {
  Card,
  EmptyState,
  Stat,
  Timeline,
  estimateTravel,
  formatTime,
  type TimelineItem,
  type TimelineMarker,
  type TrackPoint,
} from "tempest-react-sdk";
import type { StopStatus, Trip, TripStop } from "@/trips/contract";
import type { TripViewer } from "@/trips/trip-markers";

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
          ? formatTime(stop.eta_at)
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
    : `Previsão ${formatTime(eta.at)}${eta.source === "estimate" ? " · estimativa" : ""}`;

  return (
    <Card title={title}>
      <Stat label={`${stop.order}. ${stop.name}`} value={value} hint={hint} />
      <Timeline items={timelineItems(trip)} />
    </Card>
  );
}
```

- **`nextStop`**: for the passenger, it is their pickup while it is pending; for the driver, the first open stop.
- **`stopEta` prefers the backend's forecast** (`eta_at`), which knows the traffic and the stop order. Without it, it falls back to [`estimateTravel`](../geo.md#offline-travel-estimate-estimatetravel) in `"bus"` mode: straight line × circuity factor, no network. The panel says "estimativa" so the person knows which of the two they are seeing.
- **[`Stat`](../components/feedback.md#stat)** shows the big number; **[`Timeline`](../components/data.md#timeline)** the whole trip, with the marker color by status and the passenger's pickup in `primary`.
- With no stop ahead, the panel becomes an **[`EmptyState`](../components/feedback.md#emptystate)** — "Você já embarcou" is not an error.

!!! note "The local estimate is approximate"
    `estimateTravel` knows no street and no traffic light. It keeps the panel from going blank between two `eta_at` values — it does not replace the backend's forecast.

## Step 8 — The passenger screen

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
  formatTime,
  useMediaQuery,
} from "tempest-react-sdk";
import { useTrip } from "@/trips/api";
import type { Trip } from "@/trips/contract";
import { NextStopPanel, etaAnnouncement, nextStop, stopEta } from "@/trips/NextStopPanel";
import { SignalStatus } from "@/trips/SignalStatus";
import { TripMap } from "@/trips/TripMap";
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
          stale={live.signal === "stale" || live.signal === "lost"}
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
        description={`Saída prevista às ${formatTime(trip.departure_at)}. O mapa aparece quando a van sair da garagem.`}
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

The states, top to bottom:

- ⏳ **Loading** — [`Skeleton`](../components/feedback.md#skeleton) shaped like the screen: title, map, status line.
- ❌ **Error** — [`ErrorState`](../components/feedback.md#errorstate) with the sentence from [`describeApiError`](../http.md#from-a-typed-error-to-the-sentence-on-screen-describeapierror): offline becomes "no connection", a 404 uses the backend's `detail`, and nothing becomes "error 0".
- 🗓️ **Not started / cancelled / finished** — [`EmptyState`](../components/feedback.md#emptystate). There is no map to show, and the socket does not even open (`enabled` is false).
- ✅ **In progress** — the map, the signal and the panel. `LiveTrip` is a separate component because `useLiveVehicle` needs the trip already loaded.
- 📴 **Offline** — [`OfflineIndicator`](../components/feedback.md#offlineindicator) warns at the top. While the radio is off, `useWebSocket` **suspends** its attempts (`waitForOnline`, on by default) and resumes on the `online` event.
- 📱 **Phone** — below 640 px the grid becomes one column: map on top, panel below, and the map shrinks to 320 px tall.

!!! tip "Bottom sheet on a phone"
    In an app that is all map, the panel usually goes into a [`BottomSheet`](../components/overlay.md#bottomsheet) over the map. The change is only in `LiveTrip`: `TripMap` and `NextStopPanel` stay the same.

## Step 9 — The driver screen

```tsx
// src/pages/DriverTripPage.tsx
import { useMemo, type ReactElement } from "react";
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
  const socket = useWebSocket<LiveFrame>(liveTripUrl(trip.id, "drive"), {
    schema: liveFrameSchema,
    silenceTimeout: 75_000,
    onMessage: ({ data }) => {
      if (data.type === "stop" || data.type === "trip") {
        void queryClient.invalidateQueries({ queryKey: tripKeys.detail(trip.id) });
      }
    },
  });

  const gps = usePositionTracker({
    autoStart: true,
    minDistanceKm: 0.01,
    maxPoints: 2_000,
    positionOptions: { enableHighAccuracy: true, maximumAge: 0 },
    onPoint: (point) => {
      const frame: PositionFrame = {
        type: "position",
        latitude: point.latitude,
        longitude: point.longitude,
        heading: point.heading ?? null,
        speed_kmh: point.speed == null ? null : Math.round(point.speed * 3.6),
        recorded_at: new Date(point.timestamp).toISOString(),
      };
      socket.send(JSON.stringify(frame));
    },
  });

  const { lastPoint } = gps;

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

- **[`usePositionTracker`](../geo.md#live-tracking-usepositiontracker)** turns on the GPS on mount (`autoStart`), with high accuracy, and drops fixes closer than 10 m to the previous one — stopped at a light, the phone sends nothing.
- **Every accepted point becomes a `position` frame** on the `drive` socket, through `onPoint`. A `useEffect` on `lastPoint` would lose the first of two points that land before one render; `onPoint` is called once per point. The `PositionFrame` type comes from the same schema the passenger validates: if the contract changes, TypeScript complains on both sides.
- **`send()` returns `false` while the socket is down, and the position is dropped.** That is what you want here: a position from 40 s ago helps nobody, and the next one arrives in seconds.
- **The driver's map uses the local GPS**, not the server's echo: zero latency, and it works even without a connection.
- **A location refusal is terminal** (`lastError.code === 1`) and gets its own screen. No GPS signal (tunnel) is transient: a badge, and the tracker recovers on the next reading. See [Transient error, refusal and `lastError`](../geo.md#transient-error-refusal-and-lasterror).
- **`stop` and `trip` frames invalidate the query**: when the backend marks the arrival at a stop, the driver's panel and badges update.

??? info "What if every position has to arrive?"
    If the backend bills by km from the trail, losing positions during a drop is not acceptable. Turn on `queueWhileClosed: true` in `useWebSocket`: `send()` buffers during backoff (up to `maxQueuedMessages`, 100 by default) and flushes everything, in order, when the socket is back. With cookie login, also pass `getPrincipal: () => driverId` — what one driver queued is not sent in another's session.

## Optional — roads on the map and the van on the road

GPS is off by 3 to 30 m in the city. On the passenger screen that shows as the van "driving" on the sidewalk or jumping to the parallel street. Pass the region's road graph in [`roads`](../geo.md#roads-on-the-map-and-the-vehicle-on-the-road-roads) and the map draws the roads and snaps the van and the trail onto them — no tiles and no snapping code in the app.

The backend serves the region's OpenStreetMap extract (see [Where the graph comes from](../geo.md#where-the-graph-comes-from)) at `GET /api/roads?bbox=…`:

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

In `PassengerTripPage`, replace `<TripMap … />` with `<TripMapOnRoads … />` with the same props.

- **The graph is built once per region** (`staleTime: STALE_TIME.INFINITE`) and the **same instance** goes to the map on every render. A new graph restarts the matching.
- **`onMatch`** receives your own edge — with `name` and `id` — for every snapped position, or `null` off every road. That is where "Agora em: Av. Frei Serafim" comes from.
- **`recorded_at` becomes `timestamp`** in step 3's `toTrackPoint`, and that is what keeps the matching chained when the van reports every 5–30 s. See [Sparse sources](../geo.md#sparse-sources-timestamp).
- **Without `roads`, the matcher is never downloaded**: it comes in through a dynamic import only when a map with `roads` mounts.

## Theme: the tokens the map reads

The map and the legend are themed by `--tempest-*` tokens only. To give the transport company's color **to the map alone**, set the tokens on a class that wraps `TripMap` — the `trip-map.css` it imports:

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

- **`--tempest-primary` / `--tempest-primary-foreground`**: the trail and the van / the arrow inside the van.
- **`--tempest-info-solid` / `--tempest-live-route-stop-ink`**: the stop glyph / the number inside it. Change both together — the number has to read on the glyph.
- **`--tempest-live-route-badge` / `--tempest-live-route-badge-text`**: the boarding-count badge.
- The full table is in [CSS variables the map reads](../geo.md#css-variables-the-map-reads); for the whole app, see [Customizing tokens](../theme.md#customizing-tokens).

!!! warning "Contrast is measured in a real browser"
    When you change a glyph token, check the contrast in the browser, in both themes: the stop number needs 4.5:1 over the glyph, and the glyph 3:1 over the map background. jsdom's `axe` does not measure color.

## Recap

- 📜 **Contract first**: types that extend `Coordinate` and a zod schema with the payload only — the same schema validates what the passenger receives and types what the driver sends; the heartbeat is the SDK's.
- 📡 **`useWebSocket`** with `schema`, `silenceTimeout` and the three connection states; `onReconnected` invalidates the query to cover the gap.
- ⏱️ **A position has an age**: `recorded_at` + a `now` that moves with `useInterval` give the "no signal for X" state, which becomes `stale` on the vehicle and `RelativeTime` with `now` on the badge.
- 🗺️ **`LiveRouteMap`** with `route`, `trail`, `vehicle.heading`, `follow`, `glyphText` in order, `emphasis` on the pickup, `badge` for the driver, `visited` on served stops, `icon` on the arrival, `markerScale` on touch and **`LiveRouteMapLegend`** with the same glyphs.
- 🛰️ **Driver**: `usePositionTracker` with `onPoint` + `send()`; old positions are dropped, unless the trail is worth money (`queueWhileClosed`).
- 🧩 **Real states**: `Skeleton`, `ErrorState` + `describeApiError`, `EmptyState`, `OfflineIndicator` and a single column on a phone.
- 🛣️ **Optional**: `roads` + `createRoadGraph` snap the van to the road and give the street name through `onMatch`.
