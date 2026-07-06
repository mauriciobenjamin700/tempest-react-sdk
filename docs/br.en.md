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
- Each state has a `<title>` (native tooltip) and an `aria-label` with the name — accessible by default.

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

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `selected` | `UF \| UF[] \| null` | — | Highlighted UF(s). |
| `onSelect` | `(uf: UF) => void` | — | Click/keyboard on a state. |
| `values` | `Partial<Record<UF, number>>` | — | Per-UF metric → choropleth. |
| `minColor` / `maxColor` | `string` | primary tints | Choropleth scale ends. |
| `height` | `number` | `440` | Viewport height in px. |
| `padding` | `number` | `12` | Inner padding in px. |
| `showLabels` | `boolean` | `true` | Acronym at each UF centroid. |
| `label` | `string` | `"Mapa do Brasil por estado"` | Accessible region label. |

---

## About the geometry

- Source: **IBGE** UF boundaries (public domain), simplified with Douglas-Peucker (~2 km tolerance) and rounded to 3 decimals.
- Size: **~119 KB raw / ~36 KB gzip**, in a separate chunk loaded **lazily** by `BrazilMap`.
- Accuracy: adequate for a **clickable overview map**, **not** for precise geographic analysis or area computation.

!!! warning "Municipality level on the map"
    The map draws **states**, not municipalities — the 5570 municipal polygons do not fit in a bundle. For city drill-down, use the **selector** (`BrazilStateCitySelect`) or draw it yourself with a municipality GeoJSON **you host** (via the [Geolocation](./geo.md) module's projection/`<TrajectoryMap>`, or Leaflet).

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
- **Map**: `BrazilMap` renders the 27 UFs in SVG — clickable (`onSelect`), highlightable (`selected`) and choropleth (`values`). No external tiles; bundled, lazy geometry.
- **Import** always from the `tempest-react-sdk/br` subpath.

## See also

- [Geolocation](./geo.md) — lat/lon capture, trajectory and tile-free `TrajectoryMap`
- [Forms BR](./forms-br.md) — CPF/CNPJ/CEP and `useViaCEP`
- [Components: Data entry](./components/inputs.md) — `Select`, `Combobox`
