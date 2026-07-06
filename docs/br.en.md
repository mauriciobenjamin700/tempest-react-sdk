# Brazil map & locations

A **clickable** national map of the 27 federative units + a states-and-cities dataset — **with no paid or external API**. The geometry is a **simplified, bundled** IBGE GeoJSON (rendered as SVG), and the locations list mirrors `utils/locations` from [`tempest-fastapi-sdk`](https://pypi.org/project/tempest-fastapi-sdk/).

!!! info "Import from the `tempest-react-sdk/br` subpath"
    This module bundles data (~5600 city names + UF geometry). To keep it off the bundle of apps that don't use it, it lives in a **separate subpath** — import from `tempest-react-sdk/br`, not the root. The map geometry still loads **lazily** (only when `BrazilMap` mounts).

    ```ts
    import { BrazilMap, citiesByUf } from "tempest-react-sdk/br";
    ```

## When to use

- A **clickable Brazil map** to pick a state (dashboards, regional filters).
- **Choropleth**: tint states by a metric (sales, users, coverage).
- A cascading **State → City selector** in forms.
- Query states/cities/regions offline (`citiesByUf`, `ufChoices`, ...).

---

## Part 1 — Locations data

Start with the data: pure, network-free functions available immediately.

```ts
import {
  listStates,
  getState,
  citiesByUf,
  statesByRegion,
  ufChoices,
  isValidUf,
  normalizeUf,
} from "tempest-react-sdk/br";

listStates().length; // 27 (sorted by name)

getState("sp");
// { uf: "SP", name: "São Paulo", region: "Sudeste", cities: [...] }

citiesByUf("RJ");     // ["Angra dos Reis", "Aperibé", ..., "Rio de Janeiro", ...]
citiesByUf("XX");     // [] — an invalid UF returns an empty list (never throws)

statesByRegion("Sul").map((s) => s.uf); // ["PR", "RS", "SC"]

normalizeUf(" rj "); // "RJ"
normalizeUf("zz");   // null
isValidUf("mg");     // true
```

!!! tip "Empty collections are not errors"
    `citiesByUf` of an unknown UF returns `[]`, it does not throw. Same convention as the backend: "no matches" is a valid result.

### Feed a `<Select>` / `<Combobox>`

`ufChoices()` and `cityChoices(uf)` already return `{ value, label }`:

```tsx
import { Select } from "tempest-react-sdk";
import { ufChoices } from "tempest-react-sdk/br";

<Select label="State" placeholder="Select" options={ufChoices()} />;
```

---

## Part 2 — State → City selector

`BrazilStateCitySelect` chains two selects: picking a state filters the cities of that UF. The city resets when the state changes.

```tsx
import { BrazilStateCitySelect } from "tempest-react-sdk/br";

export function AddressForm() {
  return (
    <BrazilStateCitySelect
      onChange={({ uf, city }) => console.log(uf, city)}
      stateLabel="State"
      cityLabel="City"
    />
  );
}
```

- `defaultUf` / `defaultCity` — initial values (uncontrolled).
- `onChange({ uf, city })` — fires on every change; `uf`/`city` are `null` when empty.
- `layout="column"` stacks the selects (default is side by side).
- `disabled` locks both.

!!! note "City enables only after a state"
    The city select is disabled until a state is chosen — there is nothing to list before that.

---

## Part 3 — The `BrazilMap`

SVG map of the 27 UFs, with auto-fit, acronym labels and per-state clicking. No external tiles.

### Clickable map

```tsx
import { useState } from "react";
import { BrazilMap, type UF } from "tempest-react-sdk/br";

export function MapPicker() {
  const [uf, setUf] = useState<UF | null>(null);
  return (
    <>
      <BrazilMap selected={uf} onSelect={setUf} height={440} />
      {uf && <p>Selected: {uf}</p>}
    </>
  );
}
```

- `onSelect(uf)` fires on click (and on Enter/Space — states are focusable when `onSelect` is set).
- `selected` accepts a single UF **or a list** — handy for multi-select.
- Each state has an `aria-label` with the name — accessible by default.

!!! tip "Hover tooltip"
    By default (`showTooltip`, default `true`) a **floating tooltip** appears on hover: **name, acronym, region and city count** — plus the choropleth value when `values` is set (e.g. `São Paulo (SP) · Sudeste · 645 cidades`). Pass `showTooltip={false}` to disable, or `renderTooltip={(data) => ...}` to customize the content (`data` = `{ uf, name, value? }`).

    ```tsx
    <BrazilMap
      renderTooltip={({ uf, name, value }) => (
        <><strong>{name}</strong> — {value ?? "no data"}</>
      )}
    />
    ```

### Choropleth (tint by metric)

Pass `values` (one number per UF) and each state is tinted linearly between `minColor` and `maxColor`:

```tsx
import { BrazilMap } from "tempest-react-sdk/br";

const sales = { SP: 1200, MG: 640, RJ: 580, BA: 410, RS: 390 };

<BrazilMap values={sales} minColor="#e0f2fe" maxColor="#0369a1" showLabels={false} />;
```

States without a value use the base surface color.

### Map + cities (full recipe)

The case that motivated the module: click the map and list the state's cities.

```tsx
import { useState } from "react";
import {
  BrazilMap,
  BrazilStateCitySelect,
  getState,
  type UF,
} from "tempest-react-sdk/br";

export function NationalMap() {
  const [uf, setUf] = useState<UF | null>(null);
  const state = uf ? getState(uf) : null;

  return (
    <div>
      <BrazilMap selected={uf} onSelect={setUf} height={440} />

      {state && (
        <section>
          <h3>
            {state.name} — {state.cities.length} cities
          </h3>
          <BrazilStateCitySelect
            key={uf}
            defaultUf={uf!}
            onChange={({ city }) => console.log("city:", city)}
          />
        </section>
      )}
    </div>
  );
}
```

!!! tip "Reset on state change"
    The `key={uf}` remounts the selector when the UF changes from the map, ensuring the city resets.

### `BrazilMap` props

_(see also [`BrazilStateMap`](#part-4-state-submap-brazilstatemap) for the municipality level.)_


| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `selected` | `UF \| UF[] \| null` | — | Highlighted UF(s). |
| `onSelect` | `(uf: UF) => void` | — | Click/keyboard on a state. |
| `values` | `Partial<Record<UF, number>>` | — | Per-UF metric → choropleth. |
| `minColor` / `maxColor` | `string` | primary tints | Choropleth scale ends. |
| `height` | `number` | `440` | Viewport height in px. |
| `padding` | `number` | `12` | Inner padding in px. |
| `showLabels` | `boolean` | `true` | Acronym at each UF centroid. |
| `showTooltip` | `boolean` | `true` | Floating hover tooltip (name + region + city count + value). |
| `renderTooltip` | `(data) => ReactNode` | — | Custom tooltip content (`{ uf, name, value? }`). |
| `label` | `string` | `"Mapa do Brasil por estado"` | Accessible region label. |

---

## Part 4 — State submap (`BrazilStateMap`)

A submap of **one state** with **all its municipalities** clickable. Municipal geometry is split per UF and loaded **lazily** — opening the SP map fetches only SP's chunk (~40-70 KB gzip), never the country's ~2 MB.

```tsx
import { useState } from "react";
import { BrazilStateMap, type Municipality } from "tempest-react-sdk/br";

export function SPMunicipalities() {
  const [city, setCity] = useState<Municipality | null>(null);
  return (
    <>
      <BrazilStateMap uf="SP" selected={city?.name} onSelect={setCity} height={420} />
      {city && <p>{city.name} — IBGE {city.id}</p>}
    </>
  );
}
```

- `uf` (required) — the state to draw.
- `onSelect({ id, name })` — fires on a municipality click (`id` = 7-digit IBGE code).
- `selected` — matches by `id` **or** `name`; accepts a list.
- `values` — choropleth by municipality (key = `id` or `name`).
- `showLabels` — **`false` by default**: a state has hundreds of municipalities and labels overlap.
- `showTooltip` (default `true`) — floating hover tooltip with **name + IBGE code** (+ choropleth value when present). `renderTooltip={(data) => ...}` customizes it (`data` = `{ id, name, value? }`).

### National → state drill-down (recipe)

Combine both maps: clicking the national map switches the submap's state.

```tsx
import { useState } from "react";
import { BrazilMap, BrazilStateMap, type Municipality, type UF } from "tempest-react-sdk/br";

export function DrillDown() {
  const [uf, setUf] = useState<UF>("SP");
  const [city, setCity] = useState<Municipality | null>(null);

  return (
    <div style={{ display: "flex", gap: 16 }}>
      <BrazilMap
        selected={uf}
        onSelect={(u) => {
          setUf(u);
          setCity(null);
        }}
        height={320}
      />
      <BrazilStateMap uf={uf} selected={city?.name} onSelect={setCity} height={320} />
    </div>
  );
}
```

### Municipal choropleth

```tsx
import { BrazilStateMap } from "tempest-react-sdk/br";

<BrazilStateMap
  uf="RJ"
  values={{ "Rio de Janeiro": 100, Niterói: 40, "Duque de Caxias": 55 }}
/>;
```

!!! note "Map names vs. names dataset"
    Municipality names on the map come from the IBGE GeoJSON; `citiesByUf` comes from the names dataset. They are nearly identical, but spelling/accents may differ in rare cases. To match values, prefer the **IBGE code** (`id`) when you have it.

### Direct municipal-geometry access

```ts
import { loadStateMunicipalities } from "tempest-react-sdk/br";

const sp = await loadStateMunicipalities("SP");
sp?.features.length; // 644
```

---

## Part 5 — Offline geocoding

Convert between name/coordinate and municipality, **offline**. Uses a compact centroid index (~97 KB gzip) loaded **lazily** — no network calls, no API key.

```ts
import {
  reverseGeocode,
  nearestMunicipality,
  geocodeMunicipality,
  municipalityCentroid,
  stateCentroid,
} from "tempest-react-sdk/br";

// Coordinate → the municipality that CONTAINS it (point-in-polygon, exact):
await reverseGeocode({ latitude: -23.5505, longitude: -46.6333 });
// { id: "3550308", name: "São Paulo", uf: "SP" }

// Coordinate → nearest-centroid municipality (fast, approximate, no geometry):
await nearestMunicipality({ latitude: -23.55, longitude: -46.63 });
// { id, name, uf: "SP", latitude, longitude, distanceKm }

// Name → coordinate (homonyms may exist across states):
await geocodeMunicipality("Bonito");          // several
await geocodeMunicipality("São Paulo", "SP"); // filtered by UF

// Centroids:
await municipalityCentroid("3550308"); // { id, name, uf, latitude, longitude }
await stateCentroid("SP");             // { latitude, longitude }
```

!!! tip "`reverseGeocode` vs `nearestMunicipality`"
    - **`reverseGeocode`** does **point-in-polygon** → returns the municipality that actually contains the point. Loads **one** state's geometry (lazy per-UF chunk). Pass `{ uf }` if you know it, to skip candidate-state detection.
    - **`nearestMunicipality`** compares **centroids** only → fast and geometry-free, but near borders / in large municipalities it can pick a neighbor.

### Recipe: "where am I?" (GPS → municipality)

Combine with `usePositionTracker` from the [Geolocation](./geo.md) module:

```tsx
import { useEffect, useState } from "react";
import { usePositionTracker } from "tempest-react-sdk";
import { reverseGeocode, type ReverseGeocodeResult } from "tempest-react-sdk/br";

export function WhereAmI() {
  const { lastPoint } = usePositionTracker({ autoStart: true });
  const [place, setPlace] = useState<ReverseGeocodeResult | null>(null);

  useEffect(() => {
    if (lastPoint) reverseGeocode(lastPoint).then(setPlace);
  }, [lastPoint]);

  return <p>{place ? `You are in ${place.name} — ${place.uf}` : "Locating…"}</p>;
}
```

!!! warning "Accuracy"
    The geometry is simplified (~2 km). Points within ~1-2 km of a border may resolve to the neighboring municipality; points offshore / outside the territory fall back to the nearest centroid.

---

## About the geometry

- Source: **IBGE** UF boundaries (public domain), simplified with Douglas-Peucker (~2 km tolerance) and rounded to 3 decimals.
- Size: **~119 KB raw / ~36 KB gzip**, in a separate chunk loaded **lazily** by `BrazilMap`.
- Accuracy: adequate for a **clickable overview map**, **not** for precise geographic analysis or area computation.

!!! info "Municipality: use `BrazilStateMap`"
    `BrazilMap` draws **states**. For the **municipality** level, [`BrazilStateMap`](#part-4-state-submap-brazilstatemap) draws every municipality of a state — the municipal geometry (~2 MB total) is split per UF and loaded **lazily**, one chunk per state, so it never lands in a single bundle.

## Advanced geometry access

Need the GeoJSON for a custom render? Load it lazily:

```ts
import { loadBrUfGeoJson } from "tempest-react-sdk/br";

const collection = await loadBrUfGeoJson();
collection.features.length; // 27
```

---

## Recap

- **Data**: `listStates`, `getState`, `citiesByUf`, `statesByRegion`, `ufChoices`, `cityChoices`, `isValidUf`, `normalizeUf`, `isValidCity` — offline, mirroring the FastAPI SDK's `utils/locations`.
- **Selector**: `BrazilStateCitySelect` chains State → City.
- **National map**: `BrazilMap` renders the 27 UFs in SVG — clickable (`onSelect`), highlightable (`selected`) and choropleth (`values`). No external tiles; bundled, lazy geometry.
- **State submap**: `BrazilStateMap` draws every municipality of a UF — clickable, choropleth, per-state geometry loaded lazily. `loadStateMunicipalities(uf)` exposes the raw geometry.
- **Import** always from the `tempest-react-sdk/br` subpath.

## See also

- [Geolocation](./geo.md) — lat/lon capture, trajectory and tile-free `TrajectoryMap`
- [Forms BR](./forms-br.md) — CPF/CNPJ/CEP and `useViaCEP`
- [Components: Data entry](./components/inputs.md) — `Select`, `Combobox`
