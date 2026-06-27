import type { Plugin } from "vite";

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
     */
    appShell?: string | false;
}

function joinBase(base: string, file: string): string {
    const prefix = base.endsWith("/") ? base : `${base}/`;
    return `${prefix}${file}`.replace(/([^:]\/)\/+/g, "$1");
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
 * @example
 * // vite.config.ts
 * import { createViteConfig, tempestPwaManifest } from "tempest-react-sdk/vite";
 *
 * export default createViteConfig({
 *   plugins: [tempestPwaManifest({ additionalUrls: ["/manifest.webmanifest", "/icon.svg"] })],
 * });
 */
export function tempestPwaManifest(options: TempestPwaManifestOptions = {}): TempestVitePlugin {
    const {
        fileName = "precache-manifest.json",
        additionalUrls = [],
        exclude = /\.map$/,
        includeHtml = true,
        appShell = "/index.html",
    } = options;

    let base = "/";

    const plugin: Plugin = {
        name: "tempest-pwa-manifest",
        apply: "build",
        configResolved(config) {
            base = config.base ?? "/";
        },
        generateBundle(_outputOptions, bundle) {
            const urls = new Set<string>(additionalUrls);
            // Vite may emit index.html after this hook, so guarantee the shell.
            if (appShell) urls.add(appShell);
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
    };

    return plugin as TempestVitePlugin;
}
