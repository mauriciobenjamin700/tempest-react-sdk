# Geolocation

A **100% self-hosted** geolocation module: capture latitude/longitude through the browser API, compute distance/trajectory, and plot maps — **with no paid or external API**. The default map is a **tile-free SVG** plot (no tile images, no requests). It mirrors the `geo` module of [`tempest-fastapi-sdk`](https://pypi.org/project/tempest-fastapi-sdk/), so types and math match between client and server.

!!! info "Why tile-free?"
    Any image map (OpenStreetMap, Mapbox, Google) downloads _tiles_ from an external server. That clashes with the "nothing external" requirement. So `TrajectoryMap` draws the projected trajectory in SVG (Web Mercator) with no background — zero requests. If you **host your own** tile server, you can enable the optional Leaflet layer by passing `tileUrl`.

<!-- gallery:geo -->
[![Geolocalização (mapas & trajetória) in the gallery](assets/gallery/geo.webp)](gallery.md)

*Section `geo` of the [gallery](gallery.md) — run it locally to interact.*
<!-- /gallery -->

## When to use

- Capture the user's position (once or continuously) via `navigator.geolocation`.
- Record and display a **trajectory** (run, delivery, trail).
- Compute distance between points or estimate travel time **offline**.
- Follow a trip **live**: planned route, trail, vehicle and pickup points.
- Plot everything without depending on a paid/external map.

## Types — `Coordinate`, `TrackPoint`, `TravelEstimate`

Types mirror the FastAPI SDK schemas (snake_case preserved on `TravelEstimate` so a response deserializes directly):

```ts
import type { Coordinate, TrackPoint, TravelEstimate, TravelMode } from "tempest-react-sdk";

const sp: Coordinate = { latitude: -23.5505, longitude: -46.6333 };

// TrackPoint = Coordinate + capture time (+ optional accuracy, speed and heading)
const point: TrackPoint = { ...sp, timestamp: Date.now(), accuracy: 12, speed: 8.3, heading: 90 };

// TravelMode = "car" | "motorcycle" | "bus"
const mode: TravelMode = "car";
```

Utility validators: `isValidLatitude`, `isValidLongitude`, `isCoordinate` (type guard), `clampLatitude`, `normalizeLongitude` (antimeridian wrap).

## Distance and trajectory — `haversineKm`, `pathLengthKm`, `bearingDeg`

Pure math, no network, identical to the server:

```ts
import { haversineKm, pathLengthKm, bearingDeg } from "tempest-react-sdk";

const sp = { latitude: -23.5505, longitude: -46.6333 };
const rio = { latitude: -22.9068, longitude: -43.1729 };

haversineKm(sp, rio); // ≈ 360.9 (km, great-circle)

// Total length of a trajectory (sum of legs):
pathLengthKm([sp, { latitude: -23.2, longitude: -45 }, rio]);

// Initial bearing (degrees, 0 = north, clockwise):
bearingDeg(sp, rio); // ≈ 65 (north-east)
```

### Framing a set of points — `boundingBox`, `boundsCenter`, `expandBounds`

To center a map on a track, or decide the zoom that covers it:

```ts
import { boundingBox, boundsCenter, expandBounds } from "tempest-react-sdk";

const bounds = boundingBox([sp, rio]); // { north, south, east, west } | null

if (bounds) {
  boundsCenter(bounds); // the midpoint, to center on
  expandBounds(bounds, 0.1); // 10% of slack, so the route does not touch the edge
}
```

`boundingBox` returns `null` for an empty list — there is no frame around no
points, and returning a zeroed box would put the map in the Atlantic.

`expandBounds` exists because framing exactly on the extremes puts the first and
last point against the frame — the margin is what makes the path fit visually.

### The raw math

`haversineKm` is the ready-made formula, but its two pieces come out on their
own for callers building a calculation of their own: `EARTH_RADIUS_KM` (6371,
the mean radius the formula assumes) and `toRadians(degrees)`. And
`unprojectMercator` is `projectMercator`'s counterpart — it converts screen
coordinates back to lat/long, which is what a click on the map needs.

```ts
import { EARTH_RADIUS_KM, projectMercator, toRadians, unprojectMercator } from "tempest-react-sdk";

const xy = projectMercator({ latitude: -23.55, longitude: -46.63 });
unprojectMercator(xy); // back to the lat/long pair

EARTH_RADIUS_KM * toRadians(1); // ≈ 111.2 km per degree of latitude
```

## Offline travel estimate — `estimateTravel`

No network: great-circle distance × circuity factor, duration from a mode-adjusted average speed. Mirrors `estimate_travel` from the FastAPI SDK.

```ts
import { estimateTravel } from "tempest-react-sdk";

const est = estimateTravel(sp, rio, "car");
// { mode: "car", distance_km: ~469, duration_minutes: ~562, source: "heuristic" }

// A bus is ~1.6× slower than a car over the same leg:
estimateTravel(sp, rio, "bus").duration_minutes;

// Tune the factors:
estimateTravel(sp, rio, "car", { circuityFactor: 1.4, carSpeedKmh: 60 });
```

!!! tip "Default factors"
    `circuityFactor = 1.3` (roads are ~30% longer than the straight line), `carSpeedKmh = 50`, duration multipliers `car: 1.0 · motorcycle: 0.95 · bus: 1.6`.

    They are exported too — `DEFAULT_CIRCUITY_FACTOR`, `DEFAULT_CAR_SPEED_KMH` and
    `DEFAULT_MODE_DURATION_FACTORS` — so a settings screen can show the value it
    is about to override instead of restating it and drifting.

## Real routing (opt-in) — `createOSRMBackend`

When you **host an OSRM** and want real street routing, build a backend injecting **your** server URL. It is the only piece that makes a request — and only when you create it.

```ts
import { createOSRMBackend } from "tempest-react-sdk";

const backend = createOSRMBackend({ baseUrl: "https://osrm.internal" });
const est = await backend.route(sp, rio, { mode: "car" });
// { …, source: "osrm" }
```

!!! warning "This makes a network request"
    The SDK ships no endpoint. Point `baseUrl` at a routing engine **you host**. For a zero-network estimate, use `estimateTravel`.

Any engine (Valhalla, GraphHopper) works: implement the `RoutingBackend` interface (`route(origin, destination, { mode }) => Promise<TravelEstimate>`).

## Live tracking — `usePositionTracker`

Records a trajectory from `watchPosition`, filtering jitter and accumulating distance. Lifecycle tied to the component (the watch is cleared on unmount).

```tsx
import { usePositionTracker, TrajectoryMap } from "tempest-react-sdk";

export function LiveRun() {
  const { points, lastPoint, distanceKm, isTracking, start, stop, clear } =
    usePositionTracker({ minDistanceKm: 0.01, positionOptions: { enableHighAccuracy: true } });

  return (
    <div>
      <button onClick={isTracking ? stop : start}>
        {isTracking ? "Stop" : "Track"}
      </button>
      <button onClick={clear}>Clear</button>
      <span>{distanceKm.toFixed(2)} km · {points.length} points</span>
      <TrajectoryMap points={points} current={lastPoint} height={360} />
    </div>
  );
}
```

- `minDistanceKm` (default `0.005` = 5 m) discards samples that are too close — filters GPS jitter while standing still.
- `maxPoints` caps the retained array (total distance keeps counting).
- `onPoint(point)` is called **once per accepted point** (after the `minDistanceKm` filter), in order. It is the way to forward each position: a `useEffect` on `lastPoint` sees only the last of two readings that land before one render — measured with two readings in the same `act`, the effect saw `[2, 3]` out of `[1, 2, 3]`, and `onPoint` saw all three. The hook reads `onPoint` from the latest render, so an inline arrow sees current state.
- `autoStart: true` starts tracking on mount.
- Each point carries `speed` (m/s, the browser's unit — `× 3.6` gives km/h) and `heading` (degrees from north), `null` when the device does not report them. The `NaN` heading some browsers send while the device is stationary becomes `null` too.

### Transient error, refusal and `lastError`

In a tunnel or an area without signal the browser sends `POSITION_UNAVAILABLE` (code `2`) or `TIMEOUT` (code `3`) and `status` becomes `"error"`, but the watch stays alive: **the next reading moves `status` back to `"tracking"`** — even one the jitter filter discards, because it already proves the signal is back. Repeated `TIMEOUT`s keep `"error"` and call `onError` each time.

`PERMISSION_DENIED` (code `1`) is terminal: the browser sends no further readings, so the watch is released and `status` stays `"error"` until a new `start()`. `lastError` (on the hook and on the tracker) tells the screen which of the two cases it is in; it goes back to `null` on recovery, on `start()`, on `stop()` and on `clear()`.

```tsx
import { usePositionTracker } from "tempest-react-sdk";

export function TrackingStatus() {
  const { status, lastError, lastPoint, start } = usePositionTracker({ autoStart: true });

  if (status === "error" && lastError?.code === 1) {
    return (
      <p>
        Allow location access. <button onClick={start}>Try again</button>
      </p>
    );
  }
  if (status === "error") return <p>No GPS signal — waiting for the next reading…</p>;

  const kmh = lastPoint?.speed != null ? (lastPoint.speed * 3.6).toFixed(0) : "—";
  const direction = lastPoint?.heading != null ? `${lastPoint.heading.toFixed(0)}°` : "—";
  return (
    <p>
      {kmh} km/h · heading {direction}
    </p>
  );
}
```

### Imperative version — `createPositionTracker`

Outside React (services), the controller exposes `start`/`stop`/`clear` + `points`/`distanceKm`/`status`/`lastError` getters:

```ts
import { createPositionTracker } from "tempest-react-sdk";

const tracker = createPositionTracker({
  minDistanceKm: 0.01,
  onUpdate: (pts) => console.log(pts.length),
});
tracker.start();
// …later
tracker.stop();
console.log(tracker.distanceKm);
```

## Map plot — `TrajectoryMap`

By default, a **tile-free SVG** plot: it projects the points (Web Mercator), auto-fits the bounds, and draws the polyline + markers (green start, pulsing current) + grid + a km scale bar. Zero dependency, zero network.

```tsx
import { TrajectoryMap } from "tempest-react-sdk";

<TrajectoryMap
  points={points}
  current={lastPoint}
  height={360}
  showGrid
  showScale
/>;
```

### Real tiles (opt-in) with Leaflet

If you **host your own tiles**, pass `tileUrl` — the component loads Leaflet on demand (dynamic import) and mounts a real tile layer. Requires `leaflet` installed in the app and its stylesheet imported once.

```tsx
// npm install leaflet
import "leaflet/dist/leaflet.css";
import { TrajectoryMap } from "tempest-react-sdk";

<TrajectoryMap
  points={points}
  tileUrl="https://tiles.YOUR-SERVER/{z}/{x}/{y}.png"
  tileAttribution="© Your map data"
  height={420}
/>;
```

!!! note "Leaflet is an optional peer"
    Without `tileUrl`, Leaflet **never** enters the bundle (the import is lazy). If `tileUrl` is passed and `leaflet` is not installed, the component shows a message instead of crashing.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `points` | `readonly Coordinate[]` | — | Trajectory to draw. |
| `current` | `Coordinate \| null` | — | Current-position marker (pulsing). |
| `height` | `number` | `320` | Viewport height in px. |
| `padding` | `number` | `24` | Inner padding in px. |
| `showGrid` / `showScale` | `boolean` | `true` | Grid and scale bar (SVG mode). |
| `strokeColor` | `string` | primary token | Path color. |
| `tileUrl` | `string` | — | `{z}/{x}/{y}` template of **your** tile server → enables Leaflet. |
| `tileAttribution` | `string` | — | Attribution over the tiles. |

## Live trip map — `LiveRouteMap`

`TrajectoryMap` plots a **recorded** trajectory and refits the map on every change. On a trip that is happening, that gets in the way: every new vehicle position (over SSE, every few seconds) would zoom out. `LiveRouteMap` is the map of a trip **in progress**:

- the **planned route** (`route`, e.g. the OSRM geometry) dashed, and the **traveled trail** (`trail`) solid on top;
- the **vehicle** with a **heading** arrow (`vehicle.heading`), gliding between two positions instead of jumping;
- the **trip points** (`markers`) by kind — origin, stop, destination —, with a numeric **badge** and **content** that opens by tap, click or keyboard;
- **follow** mode (`follow`): a new position **does not refit** the map; it only pans, at the same zoom, when the vehicle nears an edge. If the user drags the map, follow pauses and a recenter button shows up.

A complete example — route, trail, vehicle with heading and 3 pickup points with content:

```tsx
import { useEffect, useState } from "react";
import { LiveRouteMap, bearingDeg, type Coordinate, type LiveRouteMarker } from "tempest-react-sdk";

const ROUTE: Coordinate[] = [
  { latitude: -23.5505, longitude: -46.6333 },
  { latitude: -23.5535, longitude: -46.6301 },
  { latitude: -23.5571, longitude: -46.6268 },
  { latitude: -23.5612, longitude: -46.6239 },
  { latitude: -23.5648, longitude: -46.6197 },
];

const STOPS: LiveRouteMarker[] = [
  {
    id: "se",
    label: "Praça da Sé",
    kind: "origin",
    badge: 2,
    ...ROUTE[0],
    content: <p>Ana and Bruno board here.</p>,
  },
  {
    id: "liberdade",
    label: "Liberdade",
    kind: "stop",
    badge: 3,
    ...ROUTE[2],
    content: (
      <ul>
        <li>Carla</li>
        <li>Diego</li>
        <li>Elisa</li>
      </ul>
    ),
  },
  {
    id: "paraiso",
    label: "Paraíso",
    kind: "destination",
    ...ROUTE[4],
    content: <p>Expected arrival at 08:40.</p>,
  },
];

export function TripMap() {
  const [traveled, setTraveled] = useState<Coordinate[]>([ROUTE[0]]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTraveled((prev) =>
        prev.length < ROUTE.length ? [...prev, ROUTE[prev.length]] : prev,
      );
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  const position = traveled[traveled.length - 1];
  const previous = traveled[traveled.length - 2];
  const heading = previous ? bearingDeg(previous, position) : null;
  const minutes = (ROUTE.length - traveled.length) * 2;

  return (
    <LiveRouteMap
      route={ROUTE}
      trail={traveled}
      vehicle={{ position, heading, label: "Bus 42" }}
      markers={STOPS}
      follow
      etaLabel={`Estimated arrival in ${minutes} minutes`}
      label="Trip map"
      recenterLabel="Recenter"
      closeLabel="Close"
      kindLabels={{ origin: "origin", stop: "stop", destination: "destination" }}
      height={400}
    />
  );
}
```

Piece by piece:

- **`route` decides the initial framing**, together with the `markers`. The vehicle and the trail are **not** part of it — that is what prevents the zoom-out on every position.
- **`vehicle.heading`** is the bearing in degrees (0 = north, clockwise). Without it the vehicle is a dot. If your backend already sends the heading, pass it through; if not, `bearingDeg(previous, current)` computes it.
- **`markers[].content`** is any `ReactNode`. The marker is a button: it opens on click/tap, `Enter` or `Space`; focus moves into the panel and `Esc` closes it and returns focus to the marker.
- **`etaLabel`** is the text the screen reader announces (a polite `status` region). The map does **not** compute the ETA: it comes from the app, which already knows where to get it.
- The default texts are PT-BR; `label`, `recenterLabel`, `closeLabel` and `kindLabels` translate them.

!!! tip "Reduced motion"
    The vehicle glides for `animationMs` (600 ms by default) between two positions. With `prefers-reduced-motion: reduce` on the system it jumps straight there, with nothing for you to do. `animationMs={0}` turns it off for everyone.

!!! note "Offline by default, tiles if you host them"
    Without `tileUrl` it is pure SVG: zero requests, works offline and in tests. With `tileUrl` pointing at **your** tile server, the map draws the tiles under the lines, in the same projection — no Leaflet, no new dependency. There is no Google Maps path.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `route` | `readonly Coordinate[]` | — | Planned route, dashed. Frames the map. |
| `trail` | `readonly Coordinate[]` | — | Traveled path, solid. |
| `vehicle` | `LiveVehicle \| null` | — | `{ position, heading?, label?, stale?, staleLabel? }`. |
| `markers` | `readonly LiveRouteMarker[]` | — | `{ id, label, latitude, longitude, kind?, badge?, emphasis?, glyphText?, icon?, visited?, content? }`. |
| `follow` | `boolean` | `false` | Keeps the vehicle in sight without changing the zoom. |
| `etaLabel` | `string` | — | Text announced to the screen reader. |
| `height` / `padding` | `number` | `360` / `32` | Height and framing margin, in px. |
| `markerScale` | `number` | `1` | Size of the marker glyphs. The touch target is 44 px at any scale. |
| `animationMs` | `number` | `600` | Vehicle glide duration. `0` jumps. |
| `showScale` | `boolean` | `true` | Scale bar in m/km. |
| `tileUrl` / `tileAttribution` / `tileMaxZoom` | `string` / `string` / `number` | — / — / `19` | Tiles from **your** server. |
| `label` / `recenterLabel` / `closeLabel` | `string` | `"Mapa da viagem"` / `"Recentralizar"` / `"Fechar"` | Accessible texts. |
| `kindLabels` | `Partial<Record<LiveRouteMarkerKind, string>>` | `origem` / `parada` / `destino` | Spoken name of each kind. |
| `visitedLabel` | `string` | `"visita concluída"` | Appended to the spoken name of a `visited` marker. |
| `onMarkerOpenChange` | `(id: string \| null) => void` | — | A marker panel opened (`id`) or closed (`null`). |
| `roads` | `RoadGraph<E>` | — | Graph from `createRoadGraph`: draws the roads and snaps the vehicle and trail. |
| `onMatch` | `(match: MatchedFix<E> \| null) => void` | — | Each new snapped position (your edge, point, distance), or `null` off every road. Only with `roads`. |

### Symbology: emphasis, number, icon and size

Colors and spoken names you already change with tokens and `kindLabels`. Four fields change the **glyph** itself:

- **`emphasis`** sets one marker apart from the others — the passenger's "Your pickup" among the line's stops. The glyph grows 1.4× and gets a halo in its own color, so it stays the same kind.
- **`glyphText`** writes short text **inside** the glyph, such as the stop order (`"1"`, `"2"`). `badge` stays free for the count.
- **`icon`** draws SVG inside the glyph, in a 24×24 box — a `lucide-react` icon fits as is. The finish flag is `icon: <Flag />` on the destination.
- **`markerScale`** (on the map) grows every glyph together — shape, badge and focus ring.

```tsx
import { Flag } from "lucide-react";
import { LiveRouteMap, type Coordinate, type LiveRouteMarker } from "tempest-react-sdk";

const ROUTE: Coordinate[] = [
  { latitude: -23.5505, longitude: -46.6333 },
  { latitude: -23.5571, longitude: -46.6268 },
  { latitude: -23.5612, longitude: -46.6239 },
  { latitude: -23.5648, longitude: -46.6197 },
];

const STOPS: LiveRouteMarker[] = [
  { id: "p1", label: "Stop 1 — Praça da Sé", kind: "origin", glyphText: "1", ...ROUTE[0] },
  { id: "p2", label: "Stop 2 — Liberdade", glyphText: "2", badge: 3, ...ROUTE[1] },
  {
    id: "p3",
    label: "Your pickup — Stop 3, São Joaquim",
    glyphText: "3",
    emphasis: true,
    ...ROUTE[2],
  },
  { id: "end", label: "Arrival — Paraíso", kind: "destination", icon: <Flag />, ...ROUTE[3] },
];

export function PassengerMap() {
  return (
    <LiveRouteMap
      route={ROUTE}
      markers={STOPS}
      markerScale={1.25}
      kindLabels={{ origin: "origin", stop: "stop", destination: "destination" }}
      height={360}
    />
  );
}
```

Piece by piece:

- **`emphasis`, `glyphText` and `icon` are visual only.** The screen reader reads the `label` and the kind — which is why the example puts "Your pickup" and "Stop 3" **in the `label`** too.
- **With `glyphText` or `icon`, a stop grows from 16 to 20 px**, so the text fits at 12 px. One or two characters read best; longer text shrinks to fit. When both are set, `glyphText` wins.
- **`icon` takes the glyph's ink** through `currentColor` — `lucide-react` icons already paint that way.

!!! info "A 44 px touch target, at any size"
    Measured in Chromium on the 0.91.0 gallery (`elementFromPoint` in 16 directions, every 2 px): a stop answered only inside its **16 px** disc, and then only on a 3 px ring 16 px from the center — the transparent stroke of the focus ring. Each marker now has an invisible **44 px** circle (WCAG 2.2, SC 2.5.5) that takes the touch, and `markerScale` never shrinks it. That is why `markerScale` still defaults to `1`: it is for **reading** the glyph from afar, not for being able to tap it.

### States: visited stop and stale position

What is behind and what is ahead cannot look the same, and a position from four minutes ago cannot look live. Two fields say so on the glyph itself:

- **`visited`** on a `LiveRouteMarker` paints the marker in a neutral gray (`--tempest-live-route-visited`, default `--tempest-text-muted`). The shape stays the kind's — a served stop is still round, the number still inside — and the accessible name gains `visitedLabel` (default `"visita concluída"`).
- **`stale`** on the `vehicle` keeps it where it was last seen, without the halo and in gray (`--tempest-live-route-stale`), and appends `staleLabel` (default `"posição desatualizada"`) to the name the screen reader reads.

```tsx
import { LiveRouteMap, type Coordinate, type LiveRouteMarker, type TrackPoint } from "tempest-react-sdk";

const STALE_AFTER_MS = 30_000;

export function TripNow({
  route,
  stops,
  position,
  now,
}: {
  route: Coordinate[];
  stops: (LiveRouteMarker & { departed: boolean })[];
  position: TrackPoint;
  now: number;
}) {
  return (
    <LiveRouteMap
      route={route}
      markers={stops.map(({ departed, ...stop }) => ({ ...stop, visited: departed }))}
      vehicle={{
        position,
        heading: position.heading ?? null,
        label: "Van 12",
        stale: now - position.timestamp > STALE_AFTER_MS,
      }}
    />
  );
}
```

- **The app decides what "stale" is.** The map keeps no clock: a timer inside it would re-render a map with nothing new to draw. The app already has the position's `timestamp` and a moving `now` (see [`RelativeTime`](./components/utility.md#relativetime) with `updateEvery`).
- **The gray measures 6.92:1 (light) and 7.43:1 (dark) against the map background** (`--tempest-surface-2`), and the number inside, in `--tempest-surface`, 7.30 and 8.39:1 — measured in the browser and asserted in `src/geo/LiveRouteMap.states.test.tsx`.
- **The same gray for both states, on purpose**: "already passed" and "stopped arriving" carry one message — this is the past. The shape tells them apart.

### Legend — `LiveRouteMapLegend`

Each app drew its own legend, imitating the SDK glyphs with SVG of its own — and a theme or glyph change left the legend behind. `LiveRouteMapLegend` draws **the same glyphs**, with the same classes and tokens as the map:

```tsx
import { Flag } from "lucide-react";
import { LiveRouteMapLegend } from "tempest-react-sdk";

export function PassengerLegend() {
  return (
    <LiveRouteMapLegend
      label="Map legend"
      markerScale={1.25}
      items={[
        { symbol: "stop", label: "Your pickup", emphasis: true },
        { symbol: "stop", label: "Stop (trip order)", glyphText: "1" },
        { symbol: "destination", label: "Arrival", icon: <Flag /> },
        { symbol: "vehicle", label: "Bus" },
        { symbol: "route", label: "Planned route" },
        { symbol: "trail", label: "Already traveled" },
        { symbol: "stop", label: "Served stop", glyphText: "1", visited: true },
        { symbol: "vehicle", label: "No signal from the bus", stale: true },
        { symbol: "badge", label: "Boarding at the stop", badge: 3 },
      ]}
    />
  );
}
```

- **`symbol`** is a marker kind (`"origin"`, `"stop"`, `"destination"`), `"vehicle"`, one of the lines (`"route"`, `"trail"`) or `"badge"`, the count pill. `emphasis`, `glyphText`, `icon` and `visited` apply to the marker kinds, the same as on `LiveRouteMarker`; `stale` to the vehicle; `badge` (default `1`) to the pill.
- **The legend's pill is the map's drawing** (a shared `BadgeShape`): same color token, same width for `"99+"`. There used to be no symbol for it, and the legend left the number on a stop unexplained.
- **Without `items`**, the legend lists the six symbols with PT-BR labels.
- **Pass the map's `markerScale`** so the glyphs match; the vehicle and the lines do not scale, as on the map.
- It is a list (`<ul>`) with the accessible name `"Legenda do mapa"` (change it with `label`); the drawings are `aria-hidden`, and the screen reader reads the text.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `items` | `readonly LiveRouteLegendItem[]` | the six symbols, PT-BR | `{ symbol, label, emphasis?, glyphText?, icon?, visited?, stale?, badge? }`, in order. |
| `markerScale` | `number` | `1` | The same factor as the map. |
| `label` | `string` | `"Legenda do mapa"` | Accessible name of the list. |

### CSS variables the map reads

The map and the legend are themed by tokens only. To recolor, override them on `:root` or on a common ancestor — the legend follows.

| Variable | Where it shows | Default |
| --- | --- | --- |
| `--tempest-surface-2` / `--tempest-border` | Map background and border | theme |
| `--tempest-text` / `--tempest-text-muted` | Text, scale bar / planned route | theme |
| `--tempest-surface` | Outline of glyphs and lines, panel, origin dot | theme |
| `--tempest-success-fg` | Origin glyph | theme |
| `--tempest-info-solid` | Stop glyph | theme |
| `--tempest-danger-solid` | Destination glyph | theme |
| `--tempest-primary` / `--tempest-primary-foreground` | Trail and vehicle / vehicle arrow | theme |
| `--tempest-focus-ring-color` | Marker focus ring | theme |
| `--tempest-live-route-badge` / `--tempest-live-route-badge-text` | `badge` background / number | `--tempest-gray-700` / `--tempest-neutral-on-solid` |
| `--tempest-live-route-origin-ink` | `glyphText` and `icon` on the origin | `--tempest-surface` |
| `--tempest-live-route-stop-ink` | `glyphText` and `icon` on a stop | `--tempest-info-on-solid` |
| `--tempest-live-route-destination-ink` | `glyphText` and `icon` on the destination | `--tempest-danger-on-solid` |
| `--tempest-live-route-road` / `--tempest-live-route-road-casing` | `roads` streets | `--tempest-bg` / `--tempest-text-subtle` |
| `--tempest-live-route-visited` / `--tempest-live-route-visited-ink` | `visited` marker / its `glyphText` and `icon` | `--tempest-text-muted` / `--tempest-surface` |
| `--tempest-live-route-stale` / `--tempest-live-route-stale-ink` | `stale` vehicle / its arrow | `--tempest-text-muted` / `--tempest-surface` |

!!! note "Why the badge no longer uses `--tempest-text` over `--tempest-bg`"
    Up to 0.91.0 the `badge` was `--tempest-text` behind a number in `--tempest-bg` — the inverted pair. In the SDK's own theme that gave 17.75:1 (light) and 17.51:1 (dark). But the contrast hung on **two** tokens an app overrides separately: a theme that lightened `--tempest-text` and left `--tempest-bg` white put a white number on an almost-white badge — **1.11:1**, measured in Chromium. The badge now uses the fixed neutral pair (`--tempest-gray-700` + `--tempest-neutral-on-solid`), the same as the solid neutral `Badge`: **10.46:1** in both themes, and with the partial theme too. Glyph inks use the measured `*-solid`/`*-on-solid` pairs — 5.17 and 4.83:1 in light, 5.25 and 5.13:1 in dark; the origin, `--tempest-surface` over `--tempest-success-fg` (8.65 and 10.28:1). If your theme changes `--tempest-surface` without `--tempest-success-fg`, set `--tempest-live-route-origin-ink` along with it.

### Roads on the map and the vehicle on the road — `roads`

GPS is off by 3 to 30 m in a city. Drawn raw, the bus "drives" on the sidewalk, cuts across the block at a corner and, on an avenue with a parallel street next to it, jumps from one to the other. Pass the region's road graph in `roads` and the map handles it **with no code in the app**:

- it draws the graph's **roads** as a vector layer under the route and the trail — no tiles, works offline;
- it runs each `vehicle.position` through an internal [`createRoadMatcher`](#on-the-live-map-createroadmatcher) and draws the vehicle **at the point snapped to the road**;
- when the position has no `heading`, the arrow follows the **direction of the road** the vehicle is on;
- it draws the `trail` **along the matched roads**, turning the corner instead of cutting the block.

```tsx
import { useEffect, useState } from "react";
import {
  LiveRouteMap,
  createRoadGraph,
  type Coordinate,
  type MatchedFix,
  type RoadEdge,
  type RoadGraph,
} from "tempest-react-sdk";

interface Street extends RoadEdge {
  id: string;
  name: string;
}

interface RoadTile {
  nodes: Coordinate[];
  edges: Street[];
}

export function BusOnTheStreet({ fixes }: { fixes: Coordinate[] }) {
  const [roads, setRoads] = useState<RoadGraph<Street> | undefined>(undefined);
  const [street, setStreet] = useState<string>("");

  useEffect(() => {
    let alive = true;
    fetch("/api/roads?bbox=-46.66,-23.57,-46.64,-23.55")
      .then((response) => response.json() as Promise<RoadTile>)
      .then((tile) => {
        if (alive) setRoads(createRoadGraph({ ...tile, twoWay: true }));
      });
    return () => {
      alive = false;
    };
  }, []);

  const onMatch = (match: MatchedFix<Street> | null): void => {
    setStreet(match ? match.edge.name : "off the road network");
  };

  return (
    <>
      <p aria-live="polite">{street}</p>
      <LiveRouteMap
        trail={fixes}
        vehicle={{ position: fixes[fixes.length - 1], label: "Bus 7" }}
        roads={roads}
        onMatch={onMatch}
        follow
        height={400}
      />
    </>
  );
}
```

Piece by piece:

- **`roads`** is the same `RoadGraph` from [`createRoadGraph`](#where-the-graph-comes-from). Build it once per region and pass **the same instance** on every render: snapping keeps its history while the object stays the same, and a new graph starts a new chain.
- **`vehicle.position` is still the raw position.** You snap nothing: the map does. If your backend sends `heading`, it wins; without it, the arrow follows the road.
- **A position with a `timestamp` stays chained even when sparse.** If the vehicle reports every 5–30 s, send each position's `timestamp` (a `TrackPoint` has one): the snapping then accepts the trip round the block between two reports instead of cutting the chain. Without `timestamp`, everything works as before — see [Sparse sources](#sparse-sources-timestamp).
- **`onMatch`** is called on each new position with the match — the edge (**your** object, with name, id, speed limit), the point on the road (`point`) and the distance (`distanceM`) — or with `null` when the position is far from every road.
- **The graph does not enter the framing.** A whole city of streets does not zoom the map out: `route` and `markers` still decide the framing.

!!! note "Off every road, the vehicle shows where it is"
    With no road within 200 m (the matcher's `radiusM`) there is nothing to snap to: the vehicle is drawn at the raw position, with its halo replaced by a **dashed ring**, and `onMatch` gets `null`. The vehicle never disappears — in a bus yard or on a street the graph does not have yet, it stays visible.

!!! info "Apps that never pass `roads` never download the matcher"
    Snapping (`createRoadMatcher` + `matchToRoads`) comes in through a **dynamic import**, the first time a map with `roads` mounts. Without `roads` nothing changes: the map draws exactly what it drew, and the bundler leaves the matcher in a separate chunk nobody requests.

The roads use two tokens of their own, which you override in the theme: `--tempest-live-route-road` (the road surface, default `--tempest-bg`) and `--tempest-live-route-road-casing` (the edge, default `--tempest-text-subtle`).

??? info "Technical details: what the map does underneath"
    - The vehicle runs through a `createRoadMatcher(roads)` with the measured defaults (`lag` 5). The drawn point is `current` — the best guess for the position that just arrived, which already weighs every earlier one. That is what holds the vehicle on the avenue when the noise puts it closer to the parallel street.
    - The whole trail runs through `matchToRoads` on every change (~3 ms per thousand positions, measured on desktop), and each unbroken run becomes a line through the nodes of the roads driven. Positions with no road in reach are left out of that line.
    - Only the roads that cross the screen go into the SVG.
    - Weight, measured on the 0.90.0 `dist` with esbuild (`bundle` + `minify`, CSS out, the dynamic import kept external — the chunk the app's bundler splits off), in brotli: `{ LiveRouteMap }` comes to **5.33 kB brotli**, against 4.67 kB before `roads`; with the matcher in the same file it would be 8.42 kB.

## Snapping to the road (map-matching) — `createRoadGraph`, `matchToRoads`, `createRoadMatcher`

City GPS is off by 3 to 30 m, sometimes much more. Snapping each position to the **nearest** road looks like the fix, but it is wrong on 1 position in 7: the parallel street 15 m away, the other side of the intersection, the opposite carriageway. `matchToRoads` looks at the **sequence**: a road the vehicle could not have reached in one second loses to the road it is driving on.

It is the hidden Markov model of Newson & Krumm (2009), decoded with Viterbi:

- **Candidates**: the roads within `radiusM` of the position, at most `maxCandidates`.
- **Emission**: a Gaussian on the distance from the position to the road (`sigmaM`) — a near road is more likely.
- **Transition**: an exponential on `|straight line − network distance|` (`betaM`) — between two consecutive positions, the path along the network should be as long as the move. The network distance comes from a bounded Dijkstra (`maxDetourM`, which grows with the interval when the position carries a `timestamp`).

### Where the graph comes from

The API is **source-agnostic**: `nodes` are coordinates and `edges` are pairs of node **indices** (`from` → `to`), each carrying whatever your app wants (`id`, name, speed limit). The recommended path is **OpenStreetMap served by your backend**, per tile or region:

- every `way` with `highway=*` becomes one edge per pair of consecutive nodes;
- `oneway=yes` becomes `twoWay: false`; no `oneway`, `twoWay: true`; `oneway=-1`, swap `from`/`to`;
- the backend cuts the region (bounding box or tile) and sends the JSON below, which the app caches.

```json
{
  "nodes": [{ "latitude": -5.0892, "longitude": -42.8016 }, { "latitude": -5.0901, "longitude": -42.8003 }],
  "edges": [{ "from": 0, "to": 1, "twoWay": true, "id": "way/24680", "name": "Av. Frei Serafim" }]
}
```

Build the graph **once** per region and reuse it for every trace: building is the expensive part (the spatial index and the adjacency); querying is cheap.

### Matching a recorded trace

```ts
import {
  createRoadGraph,
  matchToRoads,
  type Coordinate,
  type RoadEdge,
  type RoadGraph,
} from "tempest-react-sdk";

interface Street extends RoadEdge {
  id: string;
  name: string;
}

interface RoadTile {
  nodes: Coordinate[];
  edges: Street[];
}

export async function loadRoads(bbox: string): Promise<RoadGraph<Street>> {
  const response = await fetch(`/api/roads?bbox=${bbox}`);
  if (!response.ok) throw new Error(`roads: HTTP ${response.status}`);
  const tile = (await response.json()) as RoadTile;
  return createRoadGraph(tile);
}

export async function streetsDriven(trace: Coordinate[]): Promise<string[]> {
  const graph = await loadRoads("-42.83,-5.11,-42.78,-5.06");
  const result = matchToRoads(trace, graph);

  for (const [i, match] of result.matches.entries()) {
    if (match === null) console.warn(`position ${i}: no road within 200 m`);
  }
  console.log(`${result.breaks} breaks, ${result.dropped} stopped positions`);

  return result.routes.flatMap((route) => route.edges.map((step) => step.edge.name));
}
```

Piece by piece:

- **`matches`** has one entry per position, in order: the edge (`edge`, **your** object), the point projected on the road (`point`), the distance (`distanceM`), the position along the edge (`offsetM`), and `reversed` when a two-way road is driven from `to` to `from`. `null` when no road is within `radiusM`.
- **`routes`** is the inferred route: the edges driven, in order, **including the ones between two positions**, recovered by the shortest path on the network.
- **Break (`breaks`)**: when no transition is possible (a signal gap, a road missing from the graph), the chain restarts at that position instead of failing. Each unbroken run becomes one entry in `routes`.
- **Stopped position (`dropped`)**: a position closer than `minSpacingM` (default `2 × sigmaM`) to the previous one skips the model — the vehicle moved less than the GPS noise. It is projected onto the previous position's edge and comes back with `inferred: true`, never `null`.

`TrackPoint` is a `Coordinate` with a `timestamp`, so the `points` of `usePositionTracker` go straight in — and their `timestamp` already keeps the chain on a [sparse source](#sparse-sources-timestamp).

### On the live map — `createRoadMatcher`

`matchToRoads` needs the whole trace. To draw the vehicle **now**, `createRoadMatcher` runs the same model one position at a time, with fixed-lag Viterbi:

!!! tip "On `LiveRouteMap`, just pass `roads`"
    If your map is `LiveRouteMap`, you do not call the matcher: [`roads`](#roads-on-the-map-and-the-vehicle-on-the-road-roads) does it inside. Use `createRoadMatcher` directly when the drawing is yours.

```ts
import { createRoadMatcher, type Coordinate, type RoadGraph } from "tempest-react-sdk";

export function snapLive(graph: RoadGraph): (fix: Coordinate) => Coordinate {
  const matcher = createRoadMatcher(graph, { lag: 5 });
  return (fix) => {
    const { current, committed } = matcher.push(fix);
    for (const final of committed) {
      console.log(`position ${final.index} confirmed on`, final.match?.edge);
    }
    return current?.point ?? fix;
  };
}
```

- **`current`** is the best guess for the position that just arrived: draw the vehicle with it. It can still change.
- **`committed`** holds the positions that became **final**: each waits for `lag` newer positions before it is decided. A confirmed position never changes.
- Memory is bounded by `lag`; `flush()` confirms what is left (end of the trip). The route between positions is not rebuilt here: run `matchToRoads` on the finished trace for it.

### Sparse sources — `timestamp`

The fixed maximum detour (`maxDetourM`, 100 m) was calibrated at 1 Hz. With one position every 5, 10 or 30 s, the vehicle turns corners and goes round the block between two points, the path along the network exceeds the straight line by more than 100 m, and the chain **breaks**. Raising `maxDetourM` for everyone does not work: at 1 Hz it lets the model invent loops that never happened.

The way out is to say **when** each position was taken. With a `timestamp` on both positions, the detour allowed between them becomes:

```text
maxDetourM + detourPerSecondM × min(Δt, maxIntervalS)
```

Tight where positions are dense, loose where they are sparse. Without `timestamp` (or with a clock that repeats or goes back), the bound is exactly the one before.

```ts
import { matchToRoads, type RoadFix, type RoadGraph } from "tempest-react-sdk";

interface Ping {
  lat: number;
  lon: number;
  sentAt: string;
}

export function tripRuns(pings: Ping[], graph: RoadGraph): number {
  const fixes: RoadFix[] = pings.map((ping) => ({
    latitude: ping.lat,
    longitude: ping.lon,
    timestamp: Date.parse(ping.sentAt),
  }));
  const result = matchToRoads(fixes, graph);
  console.log(`${result.breaks} breaks in ${fixes.length} positions`);
  return result.routes.length;
}
```

- **`timestamp`** is in milliseconds since the epoch, the same as `GeolocationPosition.timestamp`. The `points` of `usePositionTracker` already carry it.
- `createRoadMatcher` and `LiveRouteMap` with `roads` use the `timestamp` the same way: `matcher.push({ latitude, longitude, timestamp })`.
- **`detourPerSecondM`** (default `2`) is how much detour each second of interval earns. **`maxIntervalS`** (default `60`) is where that stops: after a 10-minute hole the bound is the 60 s one, and Dijkstra does not sweep the city.

!!! info "What breaks remain are wrong-way driving"
    Measured on Brazilian traces (below), almost every break left with a sparse source vanishes once every road is made two-way: it is a bicycle, or a wrong `oneway` in OSM, going against the direction. For those, more slack does not help — it trades the break for a **loop round the block that never happened**, which is why the default is small.

??? info "Technical details: how the defaults were chosen"
    Two datasets, the same sweep (`detourPerSecondM` 1/2/3/5/10, `maxIntervalS` 30/60/no cap, against the fixed detour of 100/300/1000 m), each trace thinned by its own clock:

    - Kubicka (`npm run build && node --expose-gc scripts/bench-map-matching.mjs`), with the true route;
    - public OSM traces in five Brazilian city centres (`npm run build && node scripts/bench-br-osm.mjs [cache-dir]`), compared with the dense match of the same run.

    `2` is the largest rate that does not hurt 1 Hz (92.33% → 92.34% right road on Kubicka, with `timestamp`); `3` already loses 0.05 pp. Without a cap, the long holes inside the 1 Hz traces cost 0.2 pp (92.13%); with 60 s, they do not.

| Brazil, all runs (default without → with `timestamp`) | 5 s | 10 s | 30 s |
| --- | --- | --- | --- |
| Breaks per 1000 positions | 5.7 → 5.4 | 10.1 → 8.9 | 24.2 → 13.8 |
| Extra route | 1.3% → 1.6% | 1.4% → 1.9% | 3.6% → 4.4% |
| Same way as the 1 Hz match | 95.0% → 95.0% | 93.7% → 93.7% | 89.6% → 90.1% |
| Breaks, runs at ≥ 6 m/s only | 0.8 → **0** | 1.5 → **0** | 9.3 → **0** |
| Breaks with every road two-way, with `timestamp` | 0.3 | 0.6 | 0 |

For comparison: the fixed 1000 m detour brings breaks down to 1.9 at 5 s, but the extra route up to 6.1%.

### What was measured

`npm run build && node --expose-gc scripts/bench-map-matching.mjs`, on the Kubicka et al. dataset (Zenodo 57731, CC BY-SA 4.0): 100 real drives worldwide, 247 251 positions at ~1 Hz, each with its ground-truth route and OpenStreetMap excerpt. "Right road" is the same metric as the naive snap: the matched edge belongs to the true route (direction ignored); `null` counts as wrong.

| Measure (defaults) | Result |
| --- | --- |
| Right road, snap to the nearest road | 85.7% |
| Right road, `matchToRoads`, all 100 drives | **92.33%** |
| Right road, without the 3 drives tagged `hives` (97 drives) | **98.53%** |
| Right road, median per drive | 99.9% (88 of 100 drives ≥ 97%) |
| Length of the true route recovered | 99.27% (0.78% extra length) |
| Breaks | 48 over 100 drives |
| `createRoadMatcher`, `lag` 0 / 1 / 5 / 20 | 89.04% / 91.10% / 92.23% / 92.32% |
| Time (Node 24, i9-13900F) | 8.1 µs per position; 1 h at 1 Hz (3600 positions) in 11 ms |

!!! warning "The measured limit"
    Two drives (5 844 and 19 313 positions, 10% of the dataset) wander through yards and areas with no road in the OSM excerpt — the dataset itself tags them `hives` — and score 18% and 43%. No parameter saves them: there is no right road to snap to. It is the same "road the base does not have" signal the backend inference will handle. Without them, matching is above 97%.

!!! note "Performance on the device"
    Measured on a desktop, not on a phone. A 16-thousand-edge graph (a mid-sized city) builds in 8 ms and takes ~1 MB; the dataset's largest, 307 thousand edges, builds in 68 ms and takes 47 MB — cut the region into tiles. Matching 1 h at 1 Hz allocates ~30 MB of short-lived memory and retains almost nothing; the live mode costs ~3 µs per position. Even on a phone 10× slower, that is under 1 ms per position.

| Option | Default | What it does |
| --- | --- | --- |
| `sigmaM` | `7` | GPS noise, in metres (Gaussian emission). |
| `betaM` | `3` | Transition scale, in metres. Smaller punishes detours harder. |
| `radiusM` | `200` | Roads farther than this are not candidates. |
| `maxCandidates` | `16` | At most this many roads per position (a two-way road counts once). |
| `minSpacingM` | `2 × sigmaM` | Positions closer than this to the previous one skip the model. |
| `maxDetourM` | `100` | Maximum network detour over the straight line. Beyond it the transition is impossible. |
| `detourPerSecondM` | `2` | Extra detour per second between two positions with a `timestamp`. `0` turns it off. |
| `maxIntervalS` | `60` | Interval past which the detour stops growing. |
| `lag` (`createRoadMatcher` only) | `5` | Newer positions before one is confirmed. |

The defaults live in `ROAD_MATCH_DEFAULTS` and `ROAD_MATCHER_DEFAULT_LAG`. The full sweep table (radius × k, σ × β, detour, pre-filter) comes out of the same command.

## Recap

- **Capture**: `usePositionTracker` / `createPositionTracker` record a trajectory via `navigator.geolocation`, filtering jitter — all in the browser.
- **Math**: `haversineKm`, `pathLengthKm`, `bearingDeg`, `estimateTravel` — offline, mirroring `tempest-fastapi-sdk`.
- **Map**: `TrajectoryMap` plots tile-free SVG by default; `tileUrl` enables Leaflet only with a server **you host**.
- **Live trip**: `LiveRouteMap` shows planned route + trail + vehicle with heading, and follows the vehicle without refitting on every position. With `roads`, it draws the streets and snaps the vehicle and trail to them, with no code in the app. `emphasis`, `glyphText`, `icon` and `markerScale` change the glyph, and `LiveRouteMapLegend` draws the legend with the same glyphs.
- **Road snapping**: `createRoadGraph` + `matchToRoads` (whole trace) and `createRoadMatcher` (live) put each position on the right road — 98.5% measured outside the road-less areas. With `timestamp`, one position every 5–30 s does not break the chain at the corner.
- **Real routing**: `createOSRMBackend` is opt-in and points at **your** OSRM — the only piece that touches the network.

## See also

- [Utility hooks](./hooks.md) — `useGeolocation` (single fix / low-level watch)
- [HTTP](./http.md) — send the trajectory to the backend
- [Offline](./offline.md) — persist the trajectory locally
