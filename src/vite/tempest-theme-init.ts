import type { HtmlTagDescriptor, Plugin } from "vite";

import { themeInitScript, type GetInitialThemeOptions } from "../theme/theme-init-script";
import type { TempestVitePlugin } from "./tempest-pwa-manifest";

/** Options for {@link tempestThemeInit}: the same two the `ThemeProvider` reads. */
export type TempestThemeInitOptions = GetInitialThemeOptions;

/**
 * Inline the anti-flash theme script ({@link themeInitScript}) at the top of
 * `index.html`'s `<head>`, in `vite dev` and in the build.
 *
 * `ThemeProvider` writes `data-tempest-theme` from an effect, which runs after the
 * first paint: a user who chose dark saw a light frame on every load. Measured on
 * the app `create-tempest-app` generated in 0.92.0 (`vite build` + `vite preview`,
 * Chromium, `localStorage["tempest-theme"] = "dark"`, 5 loads): at the first
 * `requestAnimationFrame` the attribute was absent and `body` painted
 * `rgb(255, 255, 255)` in 5 of 5. The script has to run before the stylesheet is
 * applied, which only an inline script in `<head>` does, and copying it by hand
 * was the step every app skipped.
 *
 * The script is injected as a tag, before any `post` HTML transform, so
 * {@link tempestCsp} sees it and allows it by SHA-256 hash: no `'unsafe-inline'`.
 * A page that already carries the exact snippet (a manual copy of the same
 * options) is left alone, so adopting the plugin does not run it twice.
 *
 * Pass the same `storageKey` and `defaultTheme` as the `ThemeProvider` (or the
 * `theme` prop of `AppProviders`); with different values the script and the
 * provider disagree for one frame, which is the flash this plugin removes.
 *
 * @param options - Storage key and default theme. Defaults match `ThemeProvider`.
 * @returns A Vite plugin, to be placed in `plugins`.
 *
 * @example
 * // vite.config.ts
 * import { createViteConfig, tempestCsp, tempestThemeInit } from "tempest-react-sdk/vite";
 *
 * export default createViteConfig({
 *     plugins: [tempestThemeInit(), tempestCsp()],
 * });
 */
export function tempestThemeInit(options: TempestThemeInitOptions = {}): TempestVitePlugin {
    const script = themeInitScript(options);
    const plugin: Plugin = {
        name: "tempest-theme-init",
        transformIndexHtml(html: string): HtmlTagDescriptor[] {
            if (html.includes(script)) return [];
            return [{ tag: "script", children: script, injectTo: "head-prepend" }];
        },
    };
    return plugin as TempestVitePlugin;
}
