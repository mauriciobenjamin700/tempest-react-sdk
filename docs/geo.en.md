# Geolocation

A **100% self-hosted** geolocation module: capture latitude/longitude through the browser API, compute distance/trajectory, and plot maps — **with no paid or external API**. The default map is a **tile-free SVG** plot (no tile images, no requests). It mirrors the `geo` module of [`tempest-fastapi-sdk`](https://pypi.org/project/tempest-fastapi-sdk/), so types and math match between client and server.

!!! info "Why tile-free?"
    Any image map (OpenStreetMap, Mapbox, Google) downloads _tiles_ from an external server. That clashes with the "nothing external" requirement. So `TrajectoryMap` draws the projected trajectory in SVG (Web Mercator) with no background — zero requests. If you **host your own** tile server, you can enable the optional Leaflet layer by passing `tileUrl`.

## When to use

- Capture the user's position (once or continuously) via `navigator.geolocation`.
- Record and display a **trajectory** (run, delivery, trail).
- Compute distance between points or estimate travel time **offline**.
- Plot everything without depending on a paid/external map.

## Types — `Coordinate`, `TrackPoint`, `TravelEstimate`

Types mirror the FastAPI SDK schemas (snake_case preserved on `TravelEstimate` so a response deserializes directly):

```ts
import type { Coordinate, TrackPoint, TravelEstimate, TravelMode } from "tempest-react-sdk";

const sp: Coordinate = { latitude: -23.5505, longitude: -46.6333 };

// TrackPoint = Coordinate + capture time (+ optional accuracy)
const point: TrackPoint = { ...sp, timestamp: Date.now(), accuracy: 12 };

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
- `autoStart: true` starts tracking on mount.

### Imperative version — `createPositionTracker`

Outside React (services), the controller exposes `start`/`stop`/`clear` + `points`/`distanceKm`/`status` getters:

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

## Recap

- **Capture**: `usePositionTracker` / `createPositionTracker` record a trajectory via `navigator.geolocation`, filtering jitter — all in the browser.
- **Math**: `haversineKm`, `pathLengthKm`, `bearingDeg`, `estimateTravel` — offline, mirroring `tempest-fastapi-sdk`.
- **Map**: `TrajectoryMap` plots tile-free SVG by default; `tileUrl` enables Leaflet only with a server **you host**.
- **Real routing**: `createOSRMBackend` is opt-in and points at **your** OSRM — the only piece that touches the network.

## See also

- [Utility hooks](./hooks.md) — `useGeolocation` (single fix / low-level watch)
- [HTTP](./http.md) — send the trajectory to the backend
- [Offline](./offline.md) — persist the trajectory locally
