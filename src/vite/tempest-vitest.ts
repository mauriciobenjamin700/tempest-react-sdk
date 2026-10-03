import type { TempestVitePlugin } from "./tempest-pwa-manifest";

/**
 * The `server.deps.inline` entry that makes Vitest transform the SDK instead of
 * handing it to Node.
 *
 * Vitest matches a string entry as `/node_modules/tempest-react-sdk` anywhere in
 * the module id, which covers npm, Yarn and pnpm's
 * `.pnpm/<name>@<version>/node_modules/` layout alike, without catching an app
 * that merely lives in a folder of the same name — which a bare regex would.
 */
const TEMPEST_VITEST_INLINE = "tempest-react-sdk";

/** The slice of a user config this plugin reads to stay out of the way. */
interface VitestUserConfig {
    test?: { server?: { deps?: { inline?: unknown } } };
}

/**
 * Make Vitest load the SDK the way the app's bundler does.
 *
 * Every component module imports its own stylesheet. Vitest externalizes an ESM
 * package from `node_modules` to plain Node, and Node has no loader for `.css`, so
 * any test that imports the real barrel dies before running with
 * `TypeError: Unknown file extension ".css"`. Inlining the package sends it through
 * Vite's pipeline, where the stylesheet import is processed like in the app.
 *
 * Measured with `tempest-react-sdk@0.70.0` and a one-line test importing `Button`:
 * Vitest 2.1.9, 3.2.7 and 4.1.11 all fail under the default config and pass with
 * this plugin.
 *
 * The entry is contributed through the `config` hook, so Vite concatenates it onto
 * whatever `test.server.deps.inline` list the app declares. The one value it must
 * not merge into is `true` (inline everything): Vite's merge would turn it into
 * `[true, "tempest-react-sdk"]`, and Vitest 4 then crashes with
 * `ex.test is not a function` matching ids against it. That config already inlines
 * the SDK, so the plugin contributes nothing.
 *
 * Outside Vitest the `test` key is ignored by Vite, so the plugin is inert in
 * `vite dev` and `vite build` — which is why `createViteConfig` always includes it.
 *
 * @returns A Vite plugin; add it to `plugins` in `vite.config.ts` or
 *   `vitest.config.ts`.
 *
 * @example
 * // vitest.config.ts
 * import { defineConfig } from "vitest/config";
 * import { tempestVitest } from "tempest-react-sdk/vite";
 *
 * export default defineConfig({
 *     plugins: [tempestVitest()],
 *     test: { environment: "jsdom" },
 * });
 */
export function tempestVitest(): TempestVitePlugin {
    return {
        name: "tempest-vitest",
        config(userConfig: VitestUserConfig): VitestUserConfig | undefined {
            if (userConfig.test?.server?.deps?.inline === true) return undefined;
            return { test: { server: { deps: { inline: [TEMPEST_VITEST_INLINE] } } } };
        },
    };
}
