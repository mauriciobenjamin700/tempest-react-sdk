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
 * The dev middleware: serve the compiled worker, and a placeholder manifest.
 *
 * Extracted from the plugin so the request handling reads on its own — the
 * plugin body is then only wiring. The manifest is deliberately empty in dev:
 * precaching a set of URLs Vite rewrites on every change would serve stale
 * modules, and the worker's runtime routes still work without it.
 *
 * @param deps - The two URLs, the path matcher and the incremental build.
 * @returns A connect-style middleware.
 */
function createDevSwMiddleware(deps: {
    swUrl: string;
    manifestUrl: string;
    matches: (url: string, target: string) => boolean;
    buildWorker: () => Promise<string>;
}): (
    req: { url?: string },
    res: {
        statusCode?: number;
        setHeader: (name: string, value: string) => void;
        end: (body: string) => void;
    },
    next: () => void,
) => Promise<void> {
    return async (req, res, next) => {
        const url = (req.url ?? "").split("?")[0];

        if (deps.matches(url, deps.swUrl)) {
            try {
                const source = await deps.buildWorker();
                res.setHeader("Content-Type", "application/javascript");
                res.setHeader("Service-Worker-Allowed", "/");
                res.setHeader("Cache-Control", "no-cache");
                res.end(source);
            } catch (error) {
                res.statusCode = 500;
                res.end(`// SW dev build failed:\n// ${String(error)}`);
            }
            return;
        }

        if (deps.matches(url, deps.manifestUrl)) {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-cache");
            res.end(JSON.stringify({ version: "dev", urls: [] }));
            return;
        }

        next();
    };
}

/**
 * Dev-server plugin that makes the service worker available under `npm run dev`.
 *
 * The production worker is bundled at build time (`vite.sw.config.ts`), so in
 * dev there is no `/sw.js` to register. This plugin compiles `swSrc` on the fly
 * with esbuild — through one incremental context, not a cold build per request —
 * and serves it as a classic worker, plus an empty `precache-manifest.json` (there are no hashed build assets to precache in
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

    /**
     * The slice of esbuild's incremental API this plugin uses.
     *
     * Typed structurally rather than imported: `esbuild` is not a dependency of
     * this package. It is resolved at runtime from the app's own tree, where Vite
     * already brings it, so importing its types would add a build-time dependency
     * the runtime does not have.
     */
    interface BuildContext {
        rebuild(): Promise<{ outputFiles?: readonly { text: string }[] }>;
        dispose(): Promise<void>;
    }

    let context: BuildContext | null = null;
    let pending: Promise<string> | null = null;

    /**
     * The incremental build context, created on the first request that needs it.
     *
     * Lazy because a project that never registers a worker should not pay for an
     * esbuild child process, and because `apply: "serve"` still loads this module
     * in a build.
     *
     * @returns The context, reused across requests.
     */
    async function ensureContext(): Promise<BuildContext> {
        if (context) return context;
        const esbuild = (await import("esbuild")) as unknown as {
            context(options: Record<string, unknown>): Promise<BuildContext>;
        };
        context = await esbuild.context({
            entryPoints: [resolve(root, swSrc)],
            bundle: true,
            format: "iife",
            platform: "browser",
            target: "es2020",
            write: false,
            absWorkingDir: root,
            logLevel: "silent",
        });
        return context;
    }

    /**
     * Bundle the worker, reusing the previous graph.
     *
     * `esbuild.build()` per request was a cold bundle every time, and the request
     * count is not one per session: `Cache-Control: no-cache` guarantees one per
     * page load, and Chrome re-fetches the worker script on every navigation and
     * on its own update checks. `rebuild()` reuses the graph and only redoes what
     * changed on disk.
     *
     * Single-flight, because those requests arrive in bursts and esbuild does not
     * promise anything about concurrent `rebuild()` calls on one context. Callers
     * that land while a bundle is in flight share its result, which is the right
     * answer anyway — they asked for the same file at the same moment.
     *
     * @returns The bundled worker source.
     */
    function buildWorker(): Promise<string> {
        if (pending) return pending;

        const run = (async (): Promise<string> => {
            const ctx = await ensureContext();
            const result = await ctx.rebuild();
            const text = result.outputFiles?.[0]?.text;
            if (text === undefined) throw new Error("esbuild produced no service-worker output");
            return text;
        })();

        pending = run;
        const clear = (): void => {
            pending = null;
        };
        run.then(clear, clear);
        return run;
    }

    /**
     * Tear the context down, releasing esbuild's child process.
     *
     * Idempotent, because it is wired to both the dev server closing and the
     * plugin's `buildEnd`. Without it, restarting the dev server leaks one esbuild
     * process per restart.
     */
    async function disposeContext(): Promise<void> {
        const current = context;
        context = null;
        pending = null;
        await current?.dispose();
    }

    const plugin: Plugin = {
        name: "tempest-pwa-dev-sw",
        apply: "serve",
        async buildEnd() {
            await disposeContext();
        },
        configResolved(config) {
            root = config.root ?? process.cwd();
            base = config.base ?? "/";
        },
        configureServer(server) {
            if (!enabled) return;

            server.httpServer?.once("close", () => void disposeContext());

            server.middlewares.use(
                createDevSwMiddleware({ swUrl, manifestUrl, matches, buildWorker }),
            );
        },
    };

    return plugin as TempestVitePlugin;
}
