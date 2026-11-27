import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import type { Plugin } from "vite";

import { ORT_WASM_ASSETS } from "../tabular/assets";
import type { TempestVitePlugin } from "./tempest-pwa-manifest";

/** Options for {@link tempestOrtAssets}. */
export interface TempestOrtAssetsOptions {
    /**
     * Public path the binaries are served under, the value to hand to
     * `loadWhisper({ ortAssetsUrl })` or `configureOrtAssets()`. Default
     * `"/ort/"`. Relative to the Vite `base`.
     */
    path?: string;
    /** Files to serve, from `onnxruntime-web/dist/`. Default: the four the WASM backend loads. */
    assets?: readonly string[];
}

const CONTENT_TYPES: Record<string, string> = {
    wasm: "application/wasm",
    mjs: "text/javascript",
    js: "text/javascript",
};

/**
 * Directory of the installed `onnxruntime-web` build.
 *
 * Resolved from the app's root, not from this package, so the app's own copy
 * (the peer it installed) is the one served.
 *
 * @param root The Vite project root.
 * @returns `node_modules/onnxruntime-web/dist`.
 * @throws Error naming the package when it is not installed.
 */
function ortDist(root: string): string {
    try {
        const entry = createRequire(join(root, "package.json")).resolve("onnxruntime-web");
        let dir = dirname(entry);
        while (!existsSync(join(dir, "package.json")) && dirname(dir) !== dir) dir = dirname(dir);
        return join(dir, "dist");
    } catch (error) {
        throw new Error(
            "tempestOrtAssets: onnxruntime-web is not installed in this app. npm install onnxruntime-web.",
            { cause: error },
        );
    }
}

/**
 * Serve ONNX Runtime Web's WebAssembly binaries from the app's own origin, in
 * `vite dev` and in the build.
 *
 * ONNX Runtime Web does not embed its `.wasm` files — not even in the
 * `.bundle` builds — and fetches them at session creation. In a bundled app
 * nothing puts them anywhere, and the session fails with `Aborted(both async
 * and sync fetching of the wasm failed)`, a message that names no file. The
 * `/tabular` and `/vision` docs used to tell every app to copy them by hand;
 * this plugin does it: a dev middleware answers `<base><path><file>` from
 * `node_modules/onnxruntime-web/dist/`, and the build emits the same files
 * into the output. Point the runtime at `path` with `loadWhisper({
 * ortAssetsUrl })` or `configureOrtAssets()`.
 *
 * The files are not added to the PWA precache: they are ~25 MB, and an app
 * that runs a model only for some users should not make every install
 * download them. Add `ortAssetUrls(path)` to `tempestPwaManifest`'s
 * `additionalUrls` when offline inference must work from the first launch.
 *
 * @param options Path and file list.
 * @returns The Vite plugin.
 *
 * @example
 * ```ts
 * import { defineConfig } from "vite";
 * import { tempestOrtAssets } from "tempest-react-sdk/vite";
 *
 * export default defineConfig({ plugins: [tempestOrtAssets()] });
 * ```
 */
export function tempestOrtAssets(options: TempestOrtAssetsOptions = {}): TempestVitePlugin {
    const path = `/${(options.path ?? "/ort/").replace(/^\/+|\/+$/g, "")}/`;
    const assets = options.assets ?? ORT_WASM_ASSETS;
    let dist = "";
    let base = "/";

    const plugin: Plugin = {
        name: "tempest-ort-assets",
        configResolved(config) {
            base = config.base.endsWith("/") ? config.base : `${config.base}/`;
            dist = ortDist(config.root);
            const missing = assets.filter((asset) => !existsSync(join(dist, asset)));
            if (missing.length > 0) {
                throw new Error(
                    `tempestOrtAssets: ${missing.join(", ")} not found in ${dist}. ` +
                        "Check the onnxruntime-web version, or pass the file names as `assets`.",
                );
            }
        },
        configureServer(server) {
            const prefix = `${base.replace(/\/$/, "")}${path}`;
            server.middlewares.use((request, response, next) => {
                const url = (request.url ?? "").split("?")[0] ?? "";
                if (!url.startsWith(prefix)) return next();
                const name = url.slice(prefix.length);
                if (!assets.includes(name)) return next();
                response.setHeader(
                    "content-type",
                    CONTENT_TYPES[name.split(".").pop() ?? ""] ?? "application/octet-stream",
                );
                response.end(readFileSync(join(dist, name)));
            });
        },
        generateBundle() {
            for (const asset of assets) {
                this.emitFile({
                    type: "asset",
                    fileName: `${path.slice(1)}${asset}`,
                    source: readFileSync(join(dist, asset)),
                });
            }
        },
    };
    return plugin as TempestVitePlugin;
}
