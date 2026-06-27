import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import type { TempestVitePlugin } from "./tempest-pwa-manifest";

/** Options for {@link tempestPwaIcons}. */
export interface TempestPwaIconsOptions {
    /** Source image (SVG or large PNG), relative to the project root. Default `public/icon.svg`. */
    source?: string;
    /** Square "any"-purpose icon sizes to emit. Default `[192, 512]`. */
    sizes?: number[];
    /** Square "maskable" icon sizes to emit (with safe-zone padding). Default `[512]`. */
    maskableSizes?: number[];
    /** Apple touch icon size, or `false` to skip. Default `180`. */
    appleTouchIcon?: number | false;
    /** Output directory for the icon set, under the build root. Default `icons`. */
    outDir?: string;
    /** Opaque background for maskable + apple icons (no transparency allowed). Default `#ffffff`. */
    background?: string;
    /** Maskable safe-zone padding as a fraction of the icon. Default `0.1` (10% each side). */
    maskablePadding?: number;
}

interface Rgb {
    r: number;
    g: number;
    b: number;
}

function hexToRgb(hex: string): Rgb {
    const value = hex.replace("#", "");
    const full =
        value.length === 3
            ? value
                  .split("")
                  .map((c) => c + c)
                  .join("")
            : value;
    return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16),
    };
}

/**
 * Build plugin that rasterizes a single source image into a full PWA icon set
 * (regular + maskable + apple-touch-icon), the dependency-free counterpart to
 * `@vite-pwa/assets-generator`. Rendering uses **`sharp`**, imported lazily and
 * treated as optional: if it isn't installed the plugin logs a warning and skips
 * generation (your build still succeeds; the icons just aren't produced).
 *
 * Point your `manifest.webmanifest` icon entries at the emitted files
 * (`/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/maskable-512.png`) and
 * the apple touch icon at `/apple-touch-icon.png`.
 *
 * @example
 * // vite.config.ts
 * import { createViteConfig, tempestPwaIcons } from "tempest-react-sdk/vite";
 *
 * export default createViteConfig({
 *   plugins: [tempestPwaIcons({ source: "public/icon.svg" })],
 * });
 */
export function tempestPwaIcons(options: TempestPwaIconsOptions = {}): TempestVitePlugin {
    const {
        source = "public/icon.svg",
        sizes = [192, 512],
        maskableSizes = [512],
        appleTouchIcon = 180,
        outDir = "icons",
        background = "#ffffff",
        maskablePadding = 0.1,
    } = options;

    let root = process.cwd();

    const plugin: Plugin = {
        name: "tempest-pwa-icons",
        apply: "build",
        configResolved(config) {
            root = config.root ?? process.cwd();
        },
        async generateBundle() {
            let sharp: SharpFactory;
            try {
                // Non-literal specifier so TS doesn't require `sharp`'s types
                // (it is an optional, lazily-loaded dependency).
                const specifier = "sharp";
                const mod = (await import(specifier)) as { default?: SharpFactory } & SharpFactory;
                sharp = (mod.default ?? mod) as SharpFactory;
            } catch {
                this.warn(
                    "tempestPwaIcons: `sharp` is not installed — skipping icon generation. " +
                        "Run `npm i -D sharp` to enable it.",
                );
                return;
            }

            const input = await readFile(resolve(root, source));
            const bg = hexToRgb(background);
            const emit = (fileName: string, data: Buffer): void => {
                this.emitFile({ type: "asset", fileName, source: data });
            };

            // Regular "any" icons — transparent background, full bleed.
            for (const size of sizes) {
                const png = await sharp(input, { density: Math.max(size, 512) })
                    .resize(size, size, {
                        fit: "contain",
                        background: { r: 0, g: 0, b: 0, alpha: 0 },
                    })
                    .png()
                    .toBuffer();
                emit(`${outDir}/icon-${size}.png`, png);
            }

            // Maskable icons — content shrunk into the safe zone over a solid bg.
            for (const size of maskableSizes) {
                const content = Math.round(size * (1 - maskablePadding * 2));
                const png = await sharp(input, { density: Math.max(size, 512) })
                    .resize(content, content, {
                        fit: "contain",
                        background: { r: 0, g: 0, b: 0, alpha: 0 },
                    })
                    .extend({
                        top: Math.round((size - content) / 2),
                        bottom: Math.round((size - content) / 2),
                        left: Math.round((size - content) / 2),
                        right: Math.round((size - content) / 2),
                        background: { ...bg, alpha: 1 },
                    })
                    .resize(size, size)
                    .png()
                    .toBuffer();
                emit(`${outDir}/maskable-${size}.png`, png);
            }

            // Apple touch icon — opaque, no alpha.
            if (appleTouchIcon) {
                const png = await sharp(input, { density: Math.max(appleTouchIcon, 512) })
                    .resize(appleTouchIcon, appleTouchIcon, {
                        fit: "contain",
                        background: { ...bg, alpha: 1 },
                    })
                    .flatten({ background: bg })
                    .png()
                    .toBuffer();
                emit("apple-touch-icon.png", png);
            }
        },
    };

    return plugin as TempestVitePlugin;
}

/** The sharp factory function (minimal typing — sharp is an optional dep). */
type SharpFactory = (input: Buffer, opts?: { density?: number }) => SharpInstance;

/** Minimal subset of the sharp chainable API this plugin uses. */
interface SharpInstance {
    resize(
        width: number,
        height: number,
        opts?: { fit?: string; background?: { r: number; g: number; b: number; alpha: number } },
    ): SharpInstance;
    extend(opts: {
        top: number;
        bottom: number;
        left: number;
        right: number;
        background: { r: number; g: number; b: number; alpha: number };
    }): SharpInstance;
    flatten(opts: { background: Rgb }): SharpInstance;
    png(): SharpInstance;
    toBuffer(): Promise<Buffer>;
}
