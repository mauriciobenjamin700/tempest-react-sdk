# Charts (recharts)

Charts turn numbers into shape: a trend that climbs, a slice that dominates, an
axis where one series crosses another. The SDK wraps
[recharts](https://recharts.org) in five themed components — `AreaChart`,
`BarChart`, `LineChart`, `PieChart`, and `RadarChart` — that take **plain tabular
data** (an array of objects) and handle axes, grid, legend, tooltip, and colors
for you.

You don't assemble `<XAxis>`/`<YAxis>`/`<Tooltip>` by hand: you pass `data`, say
which key is the axis (`index`) and which keys become series (`categories`), and
the component does the rest.

## Why a separate subpath

The charts don't come from the main barrel. You import them from
`tempest-react-sdk/charts`:

```tsx
import { BarChart, LineChart, AreaChart } from "tempest-react-sdk/charts";
```

!!! info "Why isolate the charts in a subpath?"
    `recharts` is a **heavy** dependency (D3 under the hood). Most Tempest apps
    draw no charts at all — and it would be unfair to charge that weight to
    everyone. So the charts live in a dedicated subpath and `recharts` is
    **externalized** out of the SDK bundle. Apps that never import from
    `tempest-react-sdk/charts` **pay nothing**: the app bundler's tree-shaking
    strips it all.

This is the same **caller injects the heavy dependency** pattern the SDK already
uses in its telemetry adapters (Sentry/PostHog) and feature-flags adapters
(GrowthBook/LaunchDarkly): the SDK describes the integration, but the real
library is the app's responsibility. The difference here is that `recharts` is an
**optional peer dependency** — you install it once and all five components reuse
it.

### Install

```bash
npm i recharts
```

!!! warning "Without `recharts`, the charts won't render"
    Because `recharts` is an **optional** peer dep, `npm install
    tempest-react-sdk` does not pull it in. If you import from
    `tempest-react-sdk/charts` without having run `npm i recharts`, the build
    breaks with `Cannot find module 'recharts'`. Install it in the app that
    actually uses charts.

## The cartesian family: Area, Bar, Line

`AreaChart`, `BarChart`, and `LineChart` share the **same** props interface,
`CartesianChartProps`. Learn one and you know all three — you only swap the
component name.

The mental model is always the same:

- `data` — your rows (array of objects).
- `index` — the key that becomes the **X axis** (labels: months, days, names…).
- `categories` — the keys that become **series** (one area/bar/line each).

### BarChart

```tsx
import { BarChart } from "tempest-react-sdk/charts";

const revenue = [
  { month: "Jan", income: 12000, cost: 8000 },
  { month: "Feb", income: 15000, cost: 9000 },
  { month: "Mar", income: 18000, cost: 9500 },
  { month: "Apr", income: 21000, cost: 11000 },
];

export function MonthlyRevenue() {
  return (
    <BarChart
      data={revenue}
      index="month"
      categories={["income", "cost"]}
      valueFormatter={(v) => `$${v.toLocaleString("en-US")}`}
      height={320}
    />
  );
}
```

Two series (`income`, `cost`), grouped side by side per month. The
`valueFormatter` formats the numbers in the tooltip **and** on the Y axis.

### LineChart

Same data shape, same `index` and `categories` — only the component changes:

```tsx
import { LineChart } from "tempest-react-sdk/charts";

const visits = [
  { day: "Mon", organic: 320, paid: 120 },
  { day: "Tue", organic: 410, paid: 150 },
  { day: "Wed", organic: 380, paid: 90 },
  { day: "Thu", organic: 520, paid: 200 },
  { day: "Fri", organic: 610, paid: 240 },
];

export function WeeklyVisits() {
  return (
    <LineChart
      data={visits}
      index="day"
      categories={["organic", "paid"]}
      valueFormatter={(v) => v.toLocaleString("en-US")}
    />
  );
}
```

!!! note "`stack` does not stack lines"
    `CartesianChartProps` carries the `stack` prop for uniformity, but
    `LineChart` **ignores** it — stacked lines rarely make sense. Use `stack` on
    `AreaChart` or `BarChart`, where it actually stacks the series on a shared
    `stackId`.

### AreaChart (with `stack`)

```tsx
import { AreaChart } from "tempest-react-sdk/charts";

const traffic = [
  { hour: "08h", desktop: 120, mobile: 80, tablet: 20 },
  { hour: "12h", desktop: 200, mobile: 160, tablet: 30 },
  { hour: "18h", desktop: 90, mobile: 240, tablet: 25 },
  { hour: "22h", desktop: 60, mobile: 300, tablet: 40 },
];

export function TrafficByDevice() {
  return (
    <AreaChart
      data={traffic}
      index="hour"
      categories={["desktop", "mobile", "tablet"]}
      stack
      valueFormatter={(v) => `${v} sessions`}
    />
  );
}
```

With `stack`, the three areas stack and the top shows the total per hour.

### `CartesianChartProps` — reference

| Prop             | Type                        | Default                | What it does                                                                  |
| ---------------- | --------------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| `data`           | `ChartData`                 | —                      | Rows to plot (array of objects `key → string \| number`).                    |
| `index`          | `string`                    | —                      | Row key used for the X axis (cartesian) or angle axis (radar).               |
| `categories`     | `string[]`                  | —                      | Row keys to plot, one series each.                                           |
| `colors`         | `string[]`                  | `DEFAULT_CHART_COLORS` | Series colors, cycled per category.                                          |
| `height`         | `number`                    | `300`                  | Chart height in pixels.                                                      |
| `width`          | `number`                    | —                      | Fixed width in px. When set, bypasses the `ResponsiveContainer`.            |
| `stack`          | `boolean`                   | `false`                | Stacks the series on a shared `stackId` (ignored by `LineChart`).            |
| `showLegend`     | `boolean`                   | `true`                 | Renders the legend.                                                          |
| `showGrid`       | `boolean`                   | `true`                 | Renders the cartesian grid.                                                  |
| `showTooltip`    | `boolean`                   | `true`                 | Renders the tooltip.                                                         |
| `valueFormatter` | `(value: number) => string` | —                      | Formats numeric values in the tooltip and on the Y axis.                     |
| `className`      | `string`                    | —                      | Extra class name applied to the chart wrapper.                              |

`ChartData = Array<Record<string, string | number>>` — each row maps a column key
to a label (string) or value (number).

!!! tip "One series, or many"
    `categories` is an array, so you decide how many series you want. Just one
    (`categories={["income"]}`) draws a simple chart; several draw comparative
    series, each picking the next color in the palette.

## PieChart

`PieChart` has a different data shape: **one row per slice**. Instead of
`categories`, you say which key holds the **value** (`category`) and which holds
the **label** (`index`).

```tsx
import { PieChart } from "tempest-react-sdk/charts";

const plans = [
  { plan: "Free", users: 4200 },
  { plan: "Pro", users: 1800 },
  { plan: "Business", users: 600 },
  { plan: "Enterprise", users: 120 },
];

export function PlanDistribution() {
  return (
    <PieChart
      data={plans}
      category="users"
      index="plan"
      donut
      valueFormatter={(v) => `${v.toLocaleString("en-US")} users`}
    />
  );
}
```

Each row becomes a slice colored by the next palette color. With `donut`, the
center is hollow (60% inner radius) — great for putting a total in the middle.

### `PieChartProps` — reference

| Prop             | Type                        | Default                | What it does                                                       |
| ---------------- | --------------------------- | ---------------------- | ----------------------------------------------------------------- |
| `data`           | `ChartData`                 | —                      | Rows to plot, one slice each.                                     |
| `category`       | `string`                    | —                      | Row key holding the slice's numeric **value**.                   |
| `index`          | `string`                    | —                      | Row key holding the slice's **name/label**.                      |
| `colors`         | `string[]`                  | `DEFAULT_CHART_COLORS` | Slice colors, cycled per slice.                                  |
| `height`         | `number`                    | `300`                  | Chart height in pixels.                                          |
| `width`          | `number`                    | —                      | Fixed width in px. When set, bypasses the `ResponsiveContainer`. |
| `donut`          | `boolean`                   | `false`                | Renders as a donut (non-zero inner radius) instead of a full pie.|
| `showLegend`     | `boolean`                   | `true`                 | Renders the legend.                                              |
| `showTooltip`    | `boolean`                   | `true`                 | Renders the tooltip.                                             |
| `valueFormatter` | `(value: number) => string` | —                      | Formats numeric values in the tooltip.                          |
| `className`      | `string`                    | —                      | Extra class name applied to the wrapper.                        |

!!! note "`PieChart` has no `showGrid` or `stack`"
    A pie has no cartesian grid and no stacking — those cartesian-family props
    simply don't exist here.

## RadarChart

`RadarChart` reuses `CartesianChartProps` (same signature as Area/Bar/Line), but
plots polygons on a radial axis: `index` becomes the **angle axis** (the
vertices) and each `categories` entry becomes one polygon.

```tsx
import { RadarChart } from "tempest-react-sdk/charts";

const skills = [
  { attribute: "Speed", team_a: 80, team_b: 65 },
  { attribute: "Defense", team_a: 70, team_b: 90 },
  { attribute: "Attack", team_a: 95, team_b: 75 },
  { attribute: "Stamina", team_a: 60, team_b: 85 },
  { attribute: "Technique", team_a: 88, team_b: 80 },
];

export function TeamComparison() {
  return (
    <RadarChart
      data={skills}
      index="attribute"
      categories={["team_a", "team_b"]}
      valueFormatter={(v) => `${v} pts`}
    />
  );
}
```

Two overlaid polygons compare `team_a` and `team_b` on each attribute — perfect
for comparing multi-dimensional profiles.

!!! note "`RadarChart` ignores `showGrid` and `stack`"
    The radar always draws its own `PolarGrid` (there's no `showGrid`), and it
    doesn't stack series (`stack` is ignored). `showLegend`/`showTooltip`/
    `colors`/`valueFormatter` work as usual.

## Colors and theming

The whole family shares an exported default palette, `DEFAULT_CHART_COLORS` — six
visually distinct hex colors, applied to series in cycle order:

```tsx
import { DEFAULT_CHART_COLORS } from "tempest-react-sdk/charts";

// ["#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#ec4899", "#06b6d4"]
// blue       green      amber      violet     pink       cyan
```

To theme, pass your own array to `colors`. Colors are cycled by series (or slice)
index, so with more series than colors it wraps around from the start:

```tsx
import { BarChart, DEFAULT_CHART_COLORS } from "tempest-react-sdk/charts";

const brand = ["#0f766e", "#f97316", "#9333ea"];

export function SalesWithBrandColors() {
  return (
    <BarChart
      data={sales}
      index="month"
      categories={["store_a", "store_b", "store_c"]}
      colors={brand}
    />
  );
}

// Want to tweak just the first color and keep the rest of the palette?
const myPalette = ["#e11d48", ...DEFAULT_CHART_COLORS.slice(1)];
```

!!! tip "Combine with your CSS tokens"
    `colors` accepts any valid CSS color string — hex, `rgb()`, or even
    `var(--tempest-color-primary)` read from your theme. That way the charts
    follow the app's visual identity without hardcoding.

## Responsive by default, fixed when needed

By default, each chart **stretches to its parent's width** via a recharts
`ResponsiveContainer` — you only control the `height`. That's what you want in
almost any dashboard: the width follows the column.

```tsx
// Fluid width (fills the container), fixed 300px height (default).
<LineChart data={data} index="day" categories={["value"]} />
```

But there are cases where you need a **fixed, deterministic** width: snapshot
tests, server-side rendering (SSR), exporting an exact-size PNG. Then you pass
`width`:

```tsx
// Fixed 600px width — no ResponsiveContainer.
<LineChart data={data} index="day" categories={["value"]} width={600} height={300} />
```

!!! warning "`width` turns off the `ResponsiveContainer`"
    When you set `width`, the chart renders at **that exact width** and is **not**
    wrapped in a `ResponsiveContainer`. This is intentional: the
    `ResponsiveContainer` measures the parent on the client and doesn't work well
    in SSR/jsdom, where there's no computed layout. For a normal page in the
    browser, **omit** `width` and let it fill the parent.

## Recap

- Import the charts from **`tempest-react-sdk/charts`** — a dedicated subpath.
  `recharts` is an **optional** peer dep: run `npm i recharts` in the app that
  uses charts. Apps that don't import from there pay no weight (same "caller
  injects the heavy dep" pattern as the telemetry/flags adapters).
- `AreaChart`, `BarChart`, and `LineChart` share `CartesianChartProps`: `data` +
  `index` (X axis) + `categories` (series). `stack` stacks in Area/Bar;
  `LineChart` ignores it.
- `PieChart` uses `category` (value) + `index` (label), one row per slice, with
  optional `donut`.
- `RadarChart` reuses `CartesianChartProps` (`index` = angle axis); ignores
  `showGrid`/`stack`.
- `DEFAULT_CHART_COLORS` is the default palette (6 colors); override it via the
  `colors` prop, cycled per series/slice.
- Without `width`, the chart is **responsive** (stretches to the parent via
  `ResponsiveContainer`, you control `height`). With `width`, it renders at a
  **fixed** size without a `ResponsiveContainer` — handy for tests/SSR.
