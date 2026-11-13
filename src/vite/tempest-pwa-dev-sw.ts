import { resolve } from "node:path";
import type { Plugin } from "vite";
import { basePrefix, toOutputFile } from "./base-url";
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
    /**
     * Bundle `swSrc` into the production build as `swUrl`. Default `true`.
     *
     * Set `false` only when another step bundles the worker (a second
     * `vite build --config vite.sw.config.ts`, `vite-plugin-pwa`). That is also
     * what tells {@link tempestPwaManifest} the worker is external, so its
     * missing-worker check stands down.
     */
    build?: boolean;
}

/** Name of the plugin {@link tempestPwaDevSw} returns, looked up by the manifest plugin. */
export const PWA_WORKER_PLUGIN_NAME = "tempest-pwa-dev-sw";

/**
 * What {@link tempestPwaDevSw} publishes on its plugin `api`, for sibling plugins.
 *
 * {@link tempestPwaManifest} reads it to know which file the worker lands at and
 * whether this build emits it at all.
 */
export interface TempestPwaWorkerApi {
    /** URL the worker is served and emitted at. */
    swUrl: string;
    /** Whether this plugin bundles the worker into the production build. */
    build: boolean;
}

/**
 * The comment prepended to the production worker, carrying the precache version.
 *
 * The browser installs a new service worker only when the bytes of `sw.js`
 * change. A deploy that touches the app but not `src/sw.ts` would otherwise ship
 * a byte-identical worker: it never reinstalls, `installPrecache` never re-runs,
 * and the offline shell keeps serving the previous deploy. The manifest
 * `version` is a hash of every precached URL, so it changes exactly when the
 * precache does.
 *
 * @param version - The `version` of the emitted precache manifest.
 * @returns A one-line block comment.
 */
export function precacheVersionBanner(version: string): string {
    return `/* tempest-precache-version: ${version} */\n`;
}

/**
 * The `version` of the precache manifest this build emitted, when there is one.
 *
 * @param bundle - The output bundle, as Rollup/Rolldown hands it to `generateBundle`.
 * @param fileName - Where the manifest was emitted, relative to `outDir`.
 * @returns The version, or `undefined` when the manifest is absent or unreadable.
 */
function readManifestVersion(
    bundle: Record<string, { type?: string; source?: unknown }>,
    fileName: string,
): string | undefined {
    const asset = bundle[fileName];
    if (asset?.type !== "asset") return undefined;
    const source =
        typeof asset.source === "string"
            ? asset.source
            : new TextDecoder().decode(asset.source as Uint8Array);
    try {
        const parsed = JSON.parse(source) as { version?: unknown };
        return typeof parsed.version === "string" ? parsed.version : undefined;
    } catch {
        return undefined;
    }
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
 * Service-worker plugin: serves `swSrc` under `npm run dev` and bundles it into
 * the production build.
 *
 * In dev there is no `/sw.js` to register. This plugin compiles `swSrc` on the
 * fly with esbuild — through one incremental context, not a cold build per
 * request — and serves it as a classic worker, plus an empty
 * `precache-manifest.json` (there are no hashed build assets to precache in
 * dev — push and runtime caching still work).
 *
 * In `vite build` it bundles the same entry with Vite's own `build()` (IIFE, so
 * it registers as a classic worker, exactly what the old `vite.sw.config.ts`
 * produced) and emits it at `swUrl`. Before 0.83.0 it was serve-only: an app
 * with this plugin and {@link tempestPwaManifest} worked in dev and shipped a
 * production build with no `sw.js` and a zero exit code, so registration
 * 404'd and `navigator.serviceWorker.ready` never resolved. The emitted worker
 * starts with the precache `version` (see {@link precacheVersionBanner}), so
 * every deploy that changes the precache changes the worker bytes and the
 * browser installs it. Pass `build: false` when another step bundles the
 * worker.
 *
 * @example
 * // vite.config.ts
 * import { createViteConfig, tempestPwaDevSw, tempestPwaManifest } from "tempest-react-sdk/vite";
 *
 * export default createViteConfig({ plugins: [tempestPwaManifest(), tempestPwaDevSw()] });
 */
export function tempestPwaDevSw(options: TempestPwaDevSwOptions = {}): TempestVitePlugin {
    const {
        swSrc = "src/sw.ts",
        swUrl = "/sw.js",
        manifestUrl = "/precache-manifest.json",
        enabled = true,
        build = true,
    } = options;

    let root = process.cwd();
    let base = "/";
    let isBuild = false;
    let mode = "production";
    let envDir: string | false | undefined;
    let envPrefix: string | string[] | undefined;
    let minify: boolean | string = true;
    let logLevel: "silent" | "error" | "warn" = "warn";

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

    /**
     * Bundle `swSrc` for production with the host's own Vite.
     *
     * Vite's `build()` rather than esbuild: Vite 8 lists esbuild only as an
     * optional peer, so a fresh app may not have it, while the `vite` running
     * this plugin is always there. The config mirrors the `vite.sw.config.ts`
     * the PWA template used to ship — IIFE lib build, one entry, no app plugins —
     * plus the app's `mode`, `envDir` and `envPrefix`, so `import.meta.env`
     * inside the worker sees the same `VITE_*` values as the page. Its log level
     * is the app's, capped at `warn`, so the nested build adds no size table to
     * the output but a `silent` build stays silent.
     *
     * @returns The bundled worker source.
     */
    async function bundleWorkerForProduction(): Promise<string> {
        const vite = (await import("vite")) as unknown as {
            build(config: Record<string, unknown>): Promise<unknown>;
        };
        const result = await vite.build({
            configFile: false,
            root,
            mode,
            envDir,
            envPrefix,
            publicDir: false,
            logLevel,
            build: {
                write: false,
                emptyOutDir: false,
                copyPublicDir: false,
                sourcemap: false,
                minify,
                lib: {
                    entry: resolve(root, swSrc),
                    formats: ["iife"],
                    name: "sw",
                    fileName: () => "sw.js",
                },
            },
        });
        const outputs = (Array.isArray(result) ? result : [result]) as {
            output?: { type: string; isEntry?: boolean; code?: string }[];
        }[];
        for (const { output = [] } of outputs) {
            const entry = output.find((item) => item.type === "chunk" && item.isEntry);
            if (entry?.code !== undefined) return entry.code;
        }
        throw new Error("the build produced no service-worker chunk");
    }

    const api: TempestPwaWorkerApi = { swUrl, build };

    const plugin: Plugin = {
        name: PWA_WORKER_PLUGIN_NAME,
        api,
        async buildEnd() {
            await disposeContext();
        },
        configResolved(config) {
            root = config.root ?? process.cwd();
            base = config.base ?? "/";
            isBuild = config.command === "build" && !config.build?.ssr;
            mode = config.mode ?? "production";
            envDir = config.envDir;
            envPrefix = config.envPrefix;
            minify = config.build?.minify ?? true;
            logLevel =
                config.logLevel === "silent" || config.logLevel === "error"
                    ? config.logLevel
                    : "warn";
        },
        configureServer(server) {
            if (!enabled) return;

            server.httpServer?.once("close", () => void disposeContext());

            server.middlewares.use(
                createDevSwMiddleware({ swUrl, manifestUrl, matches, buildWorker }),
            );
        },
        generateBundle: {
            order: "post",
            async handler(_outputOptions, bundle) {
                if (!isBuild || !build) return;
                let source: string;
                try {
                    source = await bundleWorkerForProduction();
                } catch (error) {
                    this.error(
                        `[tempest-pwa-dev-sw] could not bundle the service worker "${swSrc}" ` +
                            `into ${swUrl}: ${error instanceof Error ? error.message : String(error)}. ` +
                            "Fix the entry, point `swSrc` at it, or pass `build: false` if another " +
                            "step bundles the worker.",
                    );
                }
                const version = readManifestVersion(
                    bundle as Record<string, { type?: string; source?: unknown }>,
                    toOutputFile(base, manifestUrl),
                );
                this.emitFile({
                    type: "asset",
                    fileName: toOutputFile(base, swUrl),
                    source:
                        version === undefined ? source : precacheVersionBanner(version) + source,
                });
            },
        },
    };

    return plugin as TempestVitePlugin;
}
