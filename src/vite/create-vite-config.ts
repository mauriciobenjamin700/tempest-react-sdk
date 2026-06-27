import { resolve } from "node:path";
import { defineConfig } from "vite";
import type { ProxyOptions, UserConfig } from "vite";
import react from "@vitejs/plugin-react";

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
 * Build a Tempest-flavored Vite config for a React app: the `@vitejs/plugin-react`
 * plugin, the `@` → `src` import alias, and sane dev-server defaults — so a
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
        overrides = {},
    } = options;

    const overridesConfig = overrides as UserConfig;

    const base: UserConfig = {
        plugins: [react(), ...plugins] as UserConfig["plugins"],
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
