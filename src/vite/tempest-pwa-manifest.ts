import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { basePrefix, toOutputFile } from "./base-url";
import { PWA_WORKER_PLUGIN_NAME } from "./tempest-pwa-dev-sw";
import type { TempestPwaWorkerApi } from "./tempest-pwa-dev-sw";

/**
 * A Vite plugin object. Typed loosely so the SDK's published declarations stay
 * free of `vite`'s internal types (which the `.d.ts` rollup can't analyze);
 * assign the result straight into a `plugins: [...]` array.
 */
export type TempestVitePlugin = { name: string } & Record<string, unknown>;

/** Options for {@link tempestPwaManifest}. */
export interface TempestPwaManifestOptions {
    /** Output file name (under the build root). Default `precache-manifest.json`. */
    fileName?: string;
    /**
     * Extra URLs to precache that Vite doesn't emit into the bundle — typically
     * `public/` assets like the web manifest and icons. Default `[]`.
     *
     * Write these relative to the site root (`/icon.svg`); the resolved Vite
     * `base` is prefixed for you. An entry that already carries the base is
     * left alone, so spelling it out by hand is still correct.
     *
     * Every same-origin entry must be a file in `public/` or in the bundle, or
     * the build fails. A URL that resolves to nothing is answered in production
     * by the SPA fallback (`index.html`) or a 404, so the precache would store
     * the app shell under that name, or fail the worker's install outright. The
     * usual culprit is a web manifest linked from `index.html` but kept outside
     * `public/`: Vite hashes it into `assets/`, where it is already precached.
     * Absolute `http(s):` URLs are not checked.
     */
    additionalUrls?: string[];
    /** Emitted files matching this are skipped. Default `/\.map$/` (source maps). */
    exclude?: RegExp;
    /** Include emitted `.html` documents (the app shell). Default `true`. */
    includeHtml?: boolean;
    /**
     * App-shell document always added to the manifest, even if Vite emits it
     * after this plugin runs. Must match `installPrecache`'s `navigateFallback`
     * so offline navigations resolve. Pass `false` to disable. Default `/index.html`.
     *
     * Like {@link TempestPwaManifestOptions.additionalUrls}, this is prefixed
     * with the resolved Vite `base`.
     */
    appShell?: string | false;
    /**
     * URL of the service worker that reads this manifest. The build fails when
     * no file is emitted at that URL. Default: the `swUrl` of
     * {@link tempestPwaDevSw} when it is in the plugin list, `/sw.js` otherwise.
     *
     * A precache manifest is only read by a worker, and a build that ships the
     * manifest without the worker exits 0 while registration 404s in
     * production — `navigator.serviceWorker.ready` never resolves and push,
     * updates and offline all hang without a message. Pass `false` when the
     * worker is bundled by a separate step after this build (a second
     * `vite build --config vite.sw.config.ts`); `tempestPwaDevSw({ build: false })`
     * already says the same and needs nothing here.
     */
    serviceWorker?: string | false;
}

/**
 * Whether `url` names something the build can serve: a bundle entry or a file
 * in the public directory.
 *
 * @param url - The URL as written in `additionalUrls`.
 * @param base - Vite's resolved `base`.
 * @param bundle - The final output bundle.
 * @param publicDir - The resolved public directory, or `""` when disabled.
 * @returns `true` when the URL resolves to a real file.
 */
function resolvesToFile(
    url: string,
    base: string,
    bundle: Record<string, unknown>,
    publicDir: string,
): boolean {
    const file = toOutputFile(base, url);
    if (file in bundle) return true;
    if (!publicDir) return false;
    const path = join(publicDir, file);
    return existsSync(path) && statSync(path).isFile();
}

function joinBase(base: string, file: string): string {
    return `${basePrefix(base)}${file}`.replace(/([^:]\/)\/+/g, "$1");
}

/**
 * Prefix a caller-supplied, root-absolute URL with the resolved Vite `base`.
 *
 * Idempotent: a URL that already starts with the base is returned untouched,
 * so configs written before this was applied — spelling the base out by hand —
 * keep producing the same manifest instead of gaining a doubled prefix.
 */
function withBase(base: string, url: string): string {
    const prefix = basePrefix(base);
    if (prefix === "/") return url.startsWith("/") ? url : `/${url}`;
    if (url.startsWith(prefix)) return url;
    return `${prefix}${url.replace(/^\//, "")}`;
}

/** Deterministic djb2 hash → hex. Stable across rebuilds with the same assets. */
function hash(input: string): string {
    let h = 5381;
    for (let i = 0; i < input.length; i++) {
        h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
    }
    return h.toString(16);
}

/**
 * Vite build plugin that emits a `precache-manifest.json` listing every built
 * asset (plus any `additionalUrls`) as root-absolute URLs, with a content-based
 * `version`. It is the dependency-free counterpart to Workbox's `__WB_MANIFEST`:
 * `installPrecache` (from `tempest-react-sdk/sw`) reads this file at the service
 * worker's `install` event to cache the app shell for offline use.
 *
 * Two mistakes that used to ship in silence now fail the build, after the bundle
 * is written: no service worker emitted at
 * {@link TempestPwaManifestOptions.serviceWorker}, and an `additionalUrls`
 * entry that is neither in `public/` nor in the bundle. Pair it with
 * {@link tempestPwaDevSw}, which bundles `src/sw.ts` into the same build.
 *
 * @example
 * // vite.config.ts
 * import { createViteConfig, tempestPwaDevSw, tempestPwaManifest } from "tempest-react-sdk/vite";
 *
 * export default createViteConfig({
 *   plugins: [
 *     tempestPwaManifest({ additionalUrls: ["/manifest.webmanifest", "/icon.svg"] }),
 *     tempestPwaDevSw(),
 *   ],
 * });
 */
export function tempestPwaManifest(options: TempestPwaManifestOptions = {}): TempestVitePlugin {
    const {
        fileName = "precache-manifest.json",
        additionalUrls = [],
        exclude = /\.map$/,
        includeHtml = true,
        appShell = "/index.html",
        serviceWorker,
    } = options;

    let base = "/";
    let publicDir = "";
    let expectedWorker: string | false = "/sw.js";

    const plugin: Plugin = {
        name: "tempest-pwa-manifest",
        apply: "build",
        configResolved(config) {
            base = config.base ?? "/";
            publicDir = config.publicDir ?? "";
            const worker = (config.plugins ?? []).find(
                (item) => item.name === PWA_WORKER_PLUGIN_NAME,
            )?.api as TempestPwaWorkerApi | undefined;
            if (serviceWorker !== undefined) expectedWorker = serviceWorker;
            else if (worker) expectedWorker = worker.build ? worker.swUrl : false;
            else expectedWorker = "/sw.js";
        },
        generateBundle(_outputOptions, bundle) {
            const urls = new Set<string>(additionalUrls.map((url) => withBase(base, url)));
            // Vite may emit index.html after this hook, so guarantee the shell.
            if (appShell) urls.add(withBase(base, appShell));
            for (const file of Object.keys(bundle)) {
                if (file === fileName) continue;
                if (exclude.test(file)) continue;
                if (!includeHtml && file.endsWith(".html")) continue;
                urls.add(joinBase(base, file));
            }

            const list = [...urls].sort();
            const version = hash(list.join("\n"));
            this.emitFile({
                type: "asset",
                fileName,
                source: JSON.stringify({ version, urls: list }),
            });
        },
        writeBundle(_outputOptions, bundle) {
            const missing = additionalUrls.filter(
                (url) =>
                    !/^[a-z][a-z\d+.-]*:/i.test(url) &&
                    !resolvesToFile(url, base, bundle, publicDir),
            );
            if (missing.length > 0) {
                this.error(
                    `[tempest-pwa-manifest] additionalUrls lists ${missing.join(", ")}, which is ` +
                        "neither in public/ nor in the build output. In production that URL " +
                        "answers with the SPA fallback or a 404, so the precache would store " +
                        "index.html under its name or fail the worker install. Move the file " +
                        "into public/, or drop the entry — a file Vite hashes into assets/ " +
                        "(a web manifest linked from index.html) is already precached.",
                );
            }

            if (expectedWorker === false) return;
            if (toOutputFile(base, expectedWorker) in bundle) return;
            this.error(
                `[tempest-pwa-manifest] the build emitted ${fileName} but no service worker ` +
                    `at ${expectedWorker}. In production the registration 404s and ` +
                    "navigator.serviceWorker.ready never resolves (push, updates and offline " +
                    "hang without an error). Add tempestPwaDevSw() — it bundles src/sw.ts into " +
                    "this build — or, if a separate step bundles the worker after this one, " +
                    "pass tempestPwaManifest({ serviceWorker: false }) or " +
                    "tempestPwaDevSw({ build: false }).",
            );
        },
    };

    return plugin as TempestVitePlugin;
}
