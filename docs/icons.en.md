# Icons by slug

Every SDK component that takes an icon takes a `ReactNode`:

```tsx
import { Button } from "tempest-react-sdk";
import { Save } from "lucide-react";

<Button leftIcon={<Save size={18} />}>Save</Button>;
```

That covers the case where **you know the icon while writing the code**. But
sometimes the icon name arrives ready-made: a menu the API returns, a CMS field, a
config table. There is nothing to import then — all you have is the string
`"layout-dashboard"`.

That is what the `tempest-react-sdk/icons` subpath is for. 🚀

## The shortest path

```tsx
import { Icon } from "tempest-react-sdk/icons";

export function Toolbar() {
    return (
        <div>
            <Icon name="save" size={18} />
            <Icon name="trash-2" size={18} />
        </div>
    );
}
```

That's it — no provider, no configuration. All **1997 lucide slugs** work this way,
including a name that only exists at runtime:

```tsx
<Icon name={row.iconSlug} />
```

!!! info "Slugs are kebab-case, not PascalCase"
    The name is lucide's, in kebab-case: `"circle-alert"`, not `"CircleAlert"`.
    `"trash-2"`, not `"Trash2"`. In dev, a wrong name logs that hint to the console.

## Why not lucide's `DynamicIcon`

`lucide-react` ships a `DynamicIcon` that looks like it solves the same problem. It
carries a cost that makes it unusable:

!!! danger "`DynamicIcon` creates ~2000 chunk boundaries"
    The map it uses (`dynamicIconImports`) is a **116 KB** module holding one
    `import()` call for **each** of the 1997 icons. Any bundler that sees that
    module must create a chunk per icon: in a production build that becomes ~1997
    tiny files, and in development it becomes a flood of browser requests.

    It also resolves the icon **after** render (in a `useEffect`), so the first frame
    never has an icon and the layout shifts. And an unknown name **throws**, taking
    down the React tree — precisely in the case where the name comes from outside.

The SDK's `<Icon>` trades that for **one chunk per initial letter**. Rendering 130
different icons asks for 9 requests, not 130:

```console
GET .../icons/generated/shard-s.js   200
GET .../icons/generated/shard-t.js   200
GET .../icons/generated/shard-c.js   200
… one per letter used, 25 at most
```

The largest shard (`s`, 247 icons) weighs **19 KB brotli**; the median sits around
2.4 KB. And `{ Icon }` alone costs **2.95 KB brotli** in the initial bundle.

## Zero extra requests for the slugs you wrote

An `<Icon name="save" />` written in your code needs no shard at all: the slug is
known at build time. The `tempestIcons()` plugin scans your source, finds those
names, and generates a registry of ordinary static imports.

### 1. Enable the plugin

If you use `createViteConfig`, it is **already on** — the plugin is included by
default:

```ts
// vite.config.ts
import { createViteConfig } from "tempest-react-sdk/vite";

export default createViteConfig();
```

Hand-rolled config? Add the plugin:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tempestIcons } from "tempest-react-sdk/vite";

export default defineConfig({
    plugins: [react(), tempestIcons()],
});
```

### 2. Pass the registry to the provider

```tsx
// src/main.tsx
import { createRoot } from "react-dom/client";
import { IconProvider } from "tempest-react-sdk/icons";
import { staticIcons } from "virtual:tempest-icons";
import { App } from "@/App";

createRoot(document.getElementById("root")!).render(
    <IconProvider registry={staticIcons} size={18}>
        <App />
    </IconProvider>,
);
```

### 3. Declare the virtual module's types

```ts
// src/vite-env.d.ts
/// <reference types="tempest-react-sdk/icons/virtual" />
```

With that in place, every literal slug in your code resolves **on the first frame,
with no extra request**. A runtime slug still goes through the shard path — the
behavior does not change, it just gets cheaper where it can.

!!! tip "The provider also holds the defaults"
    `size` and `strokeWidth` on `IconProvider` apply to the whole subtree, so you
    stop repeating `size={18}` at every call site. An explicit prop on `<Icon>`
    always wins over the default.

## A name that does not exist

Never throws. Without `fallback`, it renders nothing:

```tsx
<Icon name="does-not-exist" />
```

With `fallback`, it renders whatever you pass — including a same-sized placeholder,
so the layout does not shift while the shard is in flight:

```tsx
<Icon
    name={row.iconSlug}
    size={20}
    fallback={<span style={{ width: 20, height: 20 }} />}
/>
```

In **development** a `console.warn` fires once per slug, and only when the name is
genuinely unknown — never while a valid icon is still loading.

!!! warning "Validate at the edge, not in the component"
    If the name comes from outside, decide the fallback **once**, where the data
    enters:

    ```tsx
    import { isIconName } from "tempest-react-sdk/icons";

    const slug = isIconName(row.icon) ? row.icon : "circle-help";
    ```

    `isIconName` imports the full slug list (~6 KB brotli). `<Icon>` does **not**
    import that list — only pay for it where you need to validate or enumerate.

## Old slugs keep working

Lucide renamed several icons (`alert-circle` → `circle-alert`, `alert-triangle` →
`triangle-alert`) and keeps the 248 old names as aliases. The SDK carries that map,
so a slug stored in a database two years ago still renders:

```tsx
<Icon name="alert-circle" />  {/* renders circle-alert */}
```

The alias resolves to its canonical name **before** the shard is chosen, so
`alert-circle` pulls shard `c`, not `a`.

## Warming the shards

Before opening a large menu or an icon picker, you can load the shards while the
user's cursor is still on its way:

```tsx
import { preloadIcons } from "tempest-react-sdk/icons";

<button onMouseEnter={() => void preloadIcons(MENU.map((i) => i.name))}>Menu</button>;
```

After that the icons appear on the first frame, never passing through `fallback`.

## No Vite? Use the CLI

The plugin is the most comfortable route, not the only one. The CLI generates the
same registry as a real file you commit:

```bash
npx tempest gen icons --out src/icons.generated.ts
```

```console
→ scanning src

✓ 37 icon(s) from 42 file(s) → src/icons.generated.ts

Wire it up:
  import { IconProvider } from "tempest-react-sdk/icons";
  import { icons } from "@/icons.generated";
  <IconProvider registry={icons}>…</IconProvider>
```

Re-run it after adding new icons. A slug the scan cannot see (a name built by
concatenation, say) still works through the shard path — it just does not get the
static route.

## Building an icon picker

`iconNames` is the full, sorted list:

```tsx
import { useMemo, useState } from "react";
import { Icon, iconNames } from "tempest-react-sdk/icons";

export function IconPicker({ onPick }: { onPick: (slug: string) => void }) {
    const [query, setQuery] = useState("");
    const matches = useMemo(
        () => iconNames.filter((name) => name.includes(query.trim().toLowerCase())),
        [query],
    );

    return (
        <div>
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
            <p>
                {matches.length} of {iconNames.length}
            </p>
            {matches.slice(0, 120).map((name) => (
                <button key={name} onClick={() => onPick(name)} title={name}>
                    <Icon name={name} size={20} />
                </button>
            ))}
        </div>
    );
}
```

See it running in the [gallery](./gallery.md), section **Ícones por slug**.

## Reference

| Export               | What it does                                                              |
| -------------------- | ------------------------------------------------------------------------- |
| `Icon`               | Renders by slug. Props: `name`, `size`, `strokeWidth`, `fallback` + SVG    |
| `IconProvider`       | Static registry + `size`/`strokeWidth` defaults                           |
| `createIconRegistry` | Builds a registry from imported lucide components                         |
| `useIcon`            | Resolves a slug to its component (what `Icon` uses internally)             |
| `preloadIcons`       | Warms the shards for a list of slugs                                      |
| `iconStatus`         | `"ready"` / `"loading"` / `"missing"` for a slug                           |
| `peekIcon`           | Reads the cache without triggering a load                                 |
| `loadIcon`           | Loads the shard owning a slug                                             |
| `resolveIconAlias`   | Deprecated slug → canonical slug                                          |
| `isIconName`         | Type guard against the real list (imports the list)                       |
| `iconNames`          | The 1997 slugs, sorted (~6 KB brotli)                                     |
| `iconAliases`        | The 248 alias → canonical pairs                                           |
| `IconName`           | Type union of every slug (types only, zero cost)                          |

### Measured costs

| What                                        | Brotli    |
| ------------------------------------------- | --------- |
| `{ Icon }` in the initial bundle            | 2.95 KB   |
| `+ { iconNames }`                           | +5.7 KB   |
| Largest shard (`s`, 247 icons), on demand   | 19.2 KB   |
| Median shard (`w`, 40 icons), on demand     | ~2.4 KB   |
| All 25 shards summed (absolute ceiling)     | ~124.5 KB |

## Recap

- `<Icon name="save" />` resolves any of lucide's **1997 slugs**, with no setup.
- A **literal** slug becomes a static import via `tempestIcons()` (on by default in
  `createViteConfig`) → **zero extra requests**.
- A **runtime** slug loads **one shard per initial letter** — 25 requests at most,
  never one per icon.
- An unknown name renders `fallback` (nothing, by default) and **never throws**;
  `console.warn` in dev only.
- Lucide's 248 old **aliases** keep resolving.
- `iconNames` stays **outside** what `<Icon>` costs — import it only to enumerate or
  validate.
- See also: [Vite & alias](./vite-config.md) · [tempest CLI](./cli.md) ·
  [Components](./components.md)
