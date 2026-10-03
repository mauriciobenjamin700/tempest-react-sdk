import { resolve } from "node:path";
import { defineConfig } from "vite";
import type { PluginOption, ProxyOptions, UserConfig } from "vite";

import { tempestIcons, type TempestIconsOptions } from "./tempest-icons";
import { tempestVitest } from "./tempest-vitest";

/**
 * A Vite proxy entry: either a target URL string (expanded to
 * `{ target, changeOrigin: true }`) or a raw Vite `ProxyOptions` object.
 */
export type ProxyEntry = string | Record<string, unknown>;

export interface CreateViteConfigOptions {
    /**
     * Source directory aliased to `@`, relative to the project root.
     * Default: `"src"` (so `@/components/Button` → `<root>/src/components/Button`).
     */
    srcDir?: string;
    /** Dev server port. Default: `5173`. */
    port?: number;
    /** Dev server host. Default: `"127.0.0.1"`. */
    host?: string | boolean;
    /** Open the browser on `dev` start. Default: `false`. */
    open?: boolean;
    /**
     * Dev proxy table. String values are expanded to
     * `{ target, changeOrigin: true }`; objects are passed through untouched.
     *
     * @example { "/api": "http://127.0.0.1:8000" }
     */
    proxy?: Record<string, ProxyEntry>;
    /** Extra path aliases merged on top of the default `@` → src alias. */
    alias?: Record<string, string>;
    /** Vite plugins appended after `@vitejs/plugin-react`. */
    plugins?: unknown[];
    /**
     * The `tempestIcons()` plugin, which generates `virtual:tempest-icons` from the
     * icon slugs your source mentions. On by default — it only ever removes
     * requests. Pass `false` to leave it out, or an options object to configure the
     * scan.
     */
    icons?: boolean | TempestIconsOptions;
    /**
     * Arbitrary Vite config (a `UserConfig` object) deep-merged last, for
     * escape-hatch overrides (build target, define, extra `server` keys, …).
     */
    overrides?: Record<string, unknown>;
}

/**
 * The resulting Vite config object. Typed loosely so the SDK's published
 * declarations stay free of `vite`'s internal types; assign it straight to a
 * `vite.config.ts` default export.
 */
export type TempestViteConfig = Record<string, unknown>;

function normalizeProxy(proxy: Record<string, ProxyEntry>): Record<string, ProxyOptions> {
    const out: Record<string, ProxyOptions> = {};
    for (const [path, value] of Object.entries(proxy)) {
        out[path] =
            typeof value === "string"
                ? { target: value, changeOrigin: true }
                : (value as ProxyOptions);
    }
    return out;
}

/**
 * Load `@vitejs/plugin-react` when a config is built, not when this module loads.
 *
 * The plugin is an optional peer, and every helper of `tempest-react-sdk/vite`
 * ships through one barrel. A top-level import made the whole barrel require it:
 * a project without the React plugin could not load a config importing only
 * `tempestVitest` or `tempestCsp` (`ERR_MODULE_NOT_FOUND`, #401). Vite resolves a
 * promise in `plugins` before using it, so {@link createViteConfig} stays
 * synchronous and only it needs the peer.
 *
 * @returns The React plugin, once its module has loaded.
 */
function reactPlugin(): Promise<PluginOption> {
    return import("@vitejs/plugin-react").then((module) => module.default());
}

/**
 * Build a Tempest-flavored Vite config for a React app: the `@vitejs/plugin-react`
 * plugin, the `@` → `src` import alias, sane dev-server defaults and
 * {@link tempestVitest}, which lets a Vitest suite import the SDK — so a
 * consuming app's `vite.config.ts` is a single call instead of repeated
 * boilerplate. Everything is overridable.
 *
 * Import it from the dedicated Node entry point:
 *
 * @example
 * // vite.config.ts
 * import { createViteConfig } from "tempest-react-sdk/vite";
 *
 * export default createViteConfig({
 *     proxy: { "/api": "http://127.0.0.1:8000" },
 * });
 */
export function createViteConfig(options: CreateViteConfigOptions = {}): TempestViteConfig {
    const {
        srcDir = "src",
        port = 5173,
        host = "127.0.0.1",
        open = false,
        proxy,
        alias = {},
        plugins = [],
        icons = true,
        overrides = {},
    } = options;

    const overridesConfig = overrides as UserConfig;
    const iconsPlugin = icons
        ? [tempestIcons({ dir: srcDir, ...(typeof icons === "object" ? icons : {}) })]
        : [];

    const base: UserConfig = {
        plugins: [
            reactPlugin(),
            ...iconsPlugin,
            tempestVitest(),
            ...plugins,
        ] as UserConfig["plugins"],
        resolve: {
            alias: {
                "@": resolve(process.cwd(), srcDir),
                ...alias,
            },
        },
        server: {
            port,
            host,
            open,
            ...(proxy ? { proxy: normalizeProxy(proxy) } : {}),
        },
    };

    const merged: UserConfig = {
        ...base,
        ...overridesConfig,
        plugins: [...(base.plugins ?? []), ...(overridesConfig.plugins ?? [])],
        resolve: { ...base.resolve, ...overridesConfig.resolve },
        server: { ...base.server, ...overridesConfig.server },
    };

    return defineConfig(merged) as TempestViteConfig;
}
