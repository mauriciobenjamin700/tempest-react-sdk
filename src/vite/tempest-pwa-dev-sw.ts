import { resolve } from "node:path";
import type { Plugin } from "vite";
import { basePrefix } from "./base-url";
import type { TempestVitePlugin } from "./tempest-pwa-manifest";

/** Options for {@link tempestPwaDevSw}. */
export interface TempestPwaDevSwOptions {
    /** Service-worker entry, relative to the project root. Default `src/sw.ts`. */
    swSrc?: string;
    /**
     * URL the worker is served at (must match `registerServiceWorker`).
     * Default `/sw.js`.
     *
     * Write it relative to the site root; requests are matched against both the
     * bare path and the path prefixed with the resolved Vite `base`, so a
     * project served from a subpath is handled without extra configuration.
     */
    swUrl?: string;
    /**
     * Dev URL of the precache manifest. Default `/precache-manifest.json`.
     * Matched the same way as {@link TempestPwaDevSwOptions.swUrl}.
     */
    manifestUrl?: string;
    /** Serve the worker in dev. Default `true`; set `false` to opt out. */
    enabled?: boolean;
}

/**
 * Dev-server plugin that makes the service worker available under `npm run dev`.
 *
 * The production worker is bundled at build time (`vite.sw.config.ts`), so in
 * dev there is no `/sw.js` to register. This plugin compiles `swSrc` on the fly
 * with esbuild and serves it as a classic worker, plus an empty
 * `precache-manifest.json` (there are no hashed build assets to precache in
 * dev — push and runtime caching still work). It closes the "SW in dev" gap
 * that otherwise only `vite-plugin-pwa`'s `devOptions` covered.
 *
 * @example
 * // vite.config.ts
 * import { createViteConfig, tempestPwaDevSw } from "tempest-react-sdk/vite";
 *
 * export default createViteConfig({ plugins: [tempestPwaDevSw()] });
 */
export function tempestPwaDevSw(options: TempestPwaDevSwOptions = {}): TempestVitePlugin {
    const {
        swSrc = "src/sw.ts",
        swUrl = "/sw.js",
        manifestUrl = "/precache-manifest.json",
        enabled = true,
    } = options;

    let root = process.cwd();
    let base = "/";

    /**
     * Whether a request path addresses `target`.
     *
     * Both the bare path and the base-prefixed one are accepted. Which of the
     * two arrives depends on where this middleware lands relative to Vite's own
     * base handling, and a project served from a subpath would otherwise never
     * match — the browser asks for `/app/sw.js` while the option says `/sw.js`.
     */
    function matches(url: string, target: string): boolean {
        if (url === target) return true;
        const prefix = basePrefix(base);
        if (prefix === "/") return false;
        return url === `${prefix}${target.replace(/^\//, "")}`;
    }

    const plugin: Plugin = {
        name: "tempest-pwa-dev-sw",
        apply: "serve",
        configResolved(config) {
            root = config.root ?? process.cwd();
            base = config.base ?? "/";
        },
        configureServer(server) {
            if (!enabled) return;
            server.middlewares.use(async (req, res, next) => {
                const url = (req.url ?? "").split("?")[0];

                if (matches(url, swUrl)) {
                    try {
                        const esbuild = await import("esbuild");
                        const result = await esbuild.build({
                            entryPoints: [resolve(root, swSrc)],
                            bundle: true,
                            format: "iife",
                            platform: "browser",
                            target: "es2020",
                            write: false,
                            absWorkingDir: root,
                            logLevel: "silent",
                        });
                        res.setHeader("Content-Type", "application/javascript");
                        res.setHeader("Service-Worker-Allowed", "/");
                        res.setHeader("Cache-Control", "no-cache");
                        res.end(result.outputFiles[0].text);
                    } catch (error) {
                        res.statusCode = 500;
                        res.end(`// SW dev build failed:\n// ${String(error)}`);
                    }
                    return;
                }

                if (matches(url, manifestUrl)) {
                    res.setHeader("Content-Type", "application/json");
                    res.setHeader("Cache-Control", "no-cache");
                    res.end(JSON.stringify({ version: "dev", urls: [] }));
                    return;
                }

                next();
            });
        },
    };

    return plugin as TempestVitePlugin;
}
