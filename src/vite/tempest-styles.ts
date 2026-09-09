import { readdir, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { narrowTokens } from "./narrow-tokens";
import type { TempestVitePlugin } from "./tempest-pwa-manifest";

/** The stylesheet id an app imports to get exactly the CSS it uses. */
export const TEMPEST_STYLES_ID = "tempest-react-sdk/styles/auto.css";

const RESOLVED_ID = "\0tempest-styles/auto.css";

/** Package subpaths whose exports are components with stylesheets. */
const SDK_SPECIFIER = /^tempest-react-sdk(\/(charts|editor|br|icons))?$/;

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

/**
 * The app's own stylesheets, scanned for token reads rather than for imports.
 *
 * An app is documented as free to read `--tempest-*` in CSS of its own, so cutting
 * the token sheet to what the SDK's components reach would drop tokens the app is
 * still reading — and a dropped token is not a smaller sheet, it is an unset
 * property. These files contribute reads to the closure and nothing else.
 */
const STYLE_FILE = /\.(css|scss|sass|less)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage"]);

/**
 * How much of the reset an app takes.
 *
 * The components are written against the reset — `.tempest_button` assumes
 * `button { background: none; border: 0; padding: 0 }`, every width assumes
 * `box-sizing: border-box` — so `"none"` is not "unstyled document, styled
 * components": it is components missing their box model. It exists for the app
 * that already ships an equivalent reset of its own.
 */
export type ResetMode = "scoped" | "global" | "none";

/**
 * How much of the token sheet an app takes.
 *
 * `"used"` emits only the tokens the selected stylesheets — and the app's own CSS —
 * can reach, following token-to-token references. `"all"` emits `tokens.css` whole,
 * which is what to reach for when the app names tokens somewhere the scan cannot
 * see: a token read from a CSS-in-JS library, a sibling package's stylesheet, a
 * `<style>` block in `index.html`.
 */
export type TokenMode = "used" | "all";

/** Shape of `dist/styles/manifest.json`. */
export interface StyleManifest {
    /** The foundation sheet — tokens and reset together, the pre-split default. */
    core: string;
    /** Public export name → the stylesheets it needs, transitive closure included. */
    components: Record<string, readonly string[]>;
}

export interface TempestStylesOptions {
    /** Directory to scan, relative to the Vite root. Default: `"src"`. */
    dir?: string;
    /**
     * Which reset to emit alongside the tokens. Default: `"scoped"`.
     *
     * `"scoped"` confines the reset to `:where([class*="tempest_"])`, so components
     * keep the normalisation they are written against and the app keeps `html`,
     * `body` and `#root`. `"global"` is the pre-split behaviour, correct when the
     * SDK owns the whole page. `"none"` emits tokens only.
     */
    reset?: ResetMode;
    /**
     * Extra export names to style even when the scan cannot see them — a component
     * reached only through a namespace import, or rendered by a sibling package.
     */
    include?: readonly string[];
    /** Directory names to skip. Default: `node_modules`, `dist`, `build`, `coverage`. */
    skipDirs?: readonly string[];
    /**
     * How much of the token sheet to emit. Default: `"used"`.
     *
     * The default falls back to the whole sheet on its own whenever a token name is
     * assembled at runtime (`` `var(--tempest-${tone})` ``), so `"all"` is for the
     * case the scan cannot see at all — a token read from outside `dir`.
     */
    tokens?: TokenMode;
}

/**
 * Collect the SDK export names a source file imports.
 *
 * Reads the import specifier rather than the JSX, because a bare `<Button>` in the
 * markup says nothing about where it came from — the app may well define its own.
 * Type-only bindings are dropped: they are erased before any component renders, so
 * paying for their CSS would be paying for nothing.
 *
 * @param code - File contents.
 * @returns The imported names, or `null` when the file namespace-imports the SDK
 *   and the set therefore cannot be known.
 */
export function scanStyleImports(code: string): string[] | null {
    const names = new Set<string>();

    for (const match of code.matchAll(
        /\bimport\s+(type\s+)?([^;'"]*?)\s+from\s*["']([^"']+)["']/g,
    )) {
        const [, typeOnly, clause, specifier] = match;
        if (!SDK_SPECIFIER.test(specifier ?? "")) continue;
        if (typeOnly) continue;
        if (/^\s*\*\s+as\s/.test(clause ?? "")) return null;

        const braces = /\{([^}]*)\}/.exec(clause ?? "");
        if (!braces) continue;
        for (const part of (braces[1] ?? "").split(",")) {
            const binding = part.trim();
            if (!binding || binding.startsWith("type ")) continue;
            const name = binding.split(/\s+as\s+/)[0]?.trim();
            if (name) names.add(name);
        }
    }
    return [...names];
}

/**
 * Build the stylesheet for a set of export names.
 *
 * Emits `@import` statements rather than inlined rules so Vite's own CSS pipeline
 * resolves, deduplicates and minifies them — the same treatment a hand-written
 * list of imports gets, which is what this replaces.
 *
 * The narrowed token block is the exception, and it goes last for a reason the
 * cascade does not explain: `@import` is only valid before any rule, so a token
 * block written above the imports would make every one of them invalid and the
 * components would arrive with no CSS at all. Putting it last is safe because the
 * block declares custom properties and nothing else — resolving `var()` does not
 * depend on where in the document the declaration sits, only on which selector
 * wins, and no component sheet declares a token to compete with.
 *
 * @param names - Export names the app imports, or `null` to take everything.
 * @param manifest - The published style manifest.
 * @param reset - How much of the reset to emit.
 * @param tokenBlock - The narrowed token sheet, or `null` to `@import` it whole.
 * @returns CSS source.
 */
export function buildStyleEntry(
    names: readonly string[] | null,
    manifest: StyleManifest,
    reset: ResetMode = "scoped",
    tokenBlock: string | null = null,
): string {
    const banner = "/* Generated by tempestStyles() — the CSS this app actually uses. */\n";
    const tokenSheets = tokenBlock === null ? ["tokens.css"] : [];
    const foundation =
        reset === "global"
            ? tokenBlock === null
                ? [manifest.core]
                : [...tokenSheets, "base.css"]
            : reset === "scoped"
              ? [...tokenSheets, "scoped.css"]
              : tokenSheets;

    const trailer = tokenBlock === null ? "" : `${tokenBlock}\n`;

    if (names === null) {
        const whole =
            reset === "global"
                ? [manifest.core, "../styles.css"]
                : [...foundation, "../styles.css"];
        return `${banner}${whole.map((sheet) => `@import "tempest-react-sdk/styles/${sheet}";`).join("\n")}\n${trailer}`;
    }

    const sheets = new Set<string>();
    for (const name of names) {
        for (const sheet of manifest.components[name] ?? []) sheets.add(sheet);
    }
    const lines = [...foundation, ...[...sheets].sort()].map(
        (sheet) => `@import "tempest-react-sdk/styles/${sheet}";`,
    );
    return `${banner}${lines.join("\n")}\n${trailer}`;
}

/**
 * The stylesheets an entry will load, by name, for the token closure to read.
 *
 * @param names - Export names the app imports, or `null` when unknowable.
 * @param manifest - The published style manifest.
 * @param reset - How much of the reset to emit.
 * @returns Stylesheet file names under `dist/styles/`.
 */
export function selectedSheets(
    names: readonly string[] | null,
    manifest: StyleManifest,
    reset: ResetMode,
): string[] {
    if (names === null) return ["../styles.css"];
    const sheets = new Set<string>();
    if (reset === "scoped") sheets.add("scoped.css");
    if (reset === "global") sheets.add("base.css");
    for (const name of names) {
        for (const sheet of manifest.components[name] ?? []) sheets.add(sheet);
    }
    return [...sheets].sort();
}

/**
 * Walk a directory and collect every source and stylesheet path.
 *
 * @param dir - Absolute directory to walk.
 * @param skip - Directory names to skip.
 * @returns Absolute file paths.
 */
async function collectSourceFiles(dir: string, skip: ReadonlySet<string>): Promise<string[]> {
    const out: string[] = [];
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (skip.has(entry.name) || entry.name.startsWith(".")) continue;
            out.push(...(await collectSourceFiles(join(dir, entry.name), skip)));
        } else if (
            entry.isFile() &&
            (SOURCE_FILE.test(entry.name) || STYLE_FILE.test(entry.name))
        ) {
            out.push(join(dir, entry.name));
        }
    }
    return out;
}

/**
 * Read the style manifest the installed package ships.
 *
 * Resolved by walking the filesystem rather than through `createRequire`, which
 * does not survive the trip: Vite bundles `vite.config.ts` into a temporary module
 * before running it, and in that bundle the `node:module` namespace import comes
 * back without the function — `(0, a.createRequire) is not a function`, at load
 * time, inside the build. The same rewrite is why `import.meta.url` is only the
 * fallback here and the app's `node_modules` is tried first.
 *
 * @param root - The Vite root, where the walk for `node_modules` starts.
 * @returns The manifest and the directory it was read from, which is also where the
 *   stylesheets it names live.
 * @throws If no installed copy carries one — an SDK older than the manifest.
 */
function readManifest(root: string): { manifest: StyleManifest; dir: string } {
    const relative = join("tempest-react-sdk", "dist", "styles", "manifest.json");
    const candidates: string[] = [];

    let dir = resolve(root);
    for (;;) {
        candidates.push(join(dir, "node_modules", relative));
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    candidates.push(join(dirname(fileURLToPath(import.meta.url)), "..", "styles", "manifest.json"));

    for (const candidate of candidates) {
        try {
            const manifest = JSON.parse(readFileSync(candidate, "utf8")) as StyleManifest;
            return { manifest, dir: dirname(candidate) };
        } catch {
            continue;
        }
    }
    throw new Error(
        "tempestStyles(): tempest-react-sdk/dist/styles/manifest.json not found — " +
            "the installed SDK predates it. Upgrade, or drop the plugin and import " +
            "tempest-react-sdk/styles.css.",
    );
}

/**
 * Import only the SDK stylesheets your app can actually reach.
 *
 * `styles.css` carries every component the SDK ships — measured at 236.71 kB raw
 * against the 38.94 kB an app mounting twelve of them can reach. The per-component
 * sheets under `styles/` have always closed that gap, but by hand: the app lists
 * them and keeps the list honest as it grows. This plugin makes the list the build's
 * problem, resolving it from the imports the source already writes.
 *
 * The closure matters more than the scan. A component pays for the CSS of every SDK
 * component it renders internally, so `<DataTable>` alone needs six sheets and
 * `<AIChat>` seven — a hand-kept list of one sheet per component the app names is
 * wrong in a way that only shows up as an unstyled child.
 *
 * The reset is the other half, and the half that breaks apps. `styles.css` claims
 * `html`, `body` and `#root`; an app with its own layout that imports it loses its
 * document surface, and an app that drops the import loses the box model its
 * components are written against — components render unstyled, which is what the
 * "just remove the import" fix actually costs. The default `reset: "scoped"` is the
 * third option: the same normalisation, confined to
 * `:where([class*="tempest_"])`, so it reaches inside a Tempest component and
 * nowhere else.
 *
 * `tempest-react-sdk/styles/auto.css` is a real file, so it resolves without the
 * plugin too — to the complete sheet. Dropping the plugin costs bytes, never
 * correctness.
 *
 * @param options - Scan configuration.
 * @returns The Vite plugin.
 *
 * @example
 * // vite.config.ts
 * import { createViteConfig, tempestStyles } from "tempest-react-sdk/vite";
 *
 * export default createViteConfig({ plugins: [tempestStyles()] });
 *
 * @example
 * // src/main.tsx — the one import, instead of a maintained list
 * import "tempest-react-sdk/styles/auto.css";
 */
export function tempestStyles(options: TempestStylesOptions = {}): TempestVitePlugin {
    const { dir = "src", include = [], skipDirs, reset = "scoped", tokens = "used" } = options;
    const skip = new Set<string>(skipDirs ?? SKIP_DIRS);
    let root = process.cwd();
    let names: string[] | null = [...include];
    let appStyleUsage = "";

    /**
     * Rescan the source tree, keeping the explicitly included names.
     *
     * @tempest-limits empty-catch — the scan races the editor and the file system:
     * a file listed a moment ago can be renamed, deleted, or held by another process
     * by the time it is read. An unreadable file contributes no names and the build
     * continues; failing the whole scan would break `vite dev` over a temp file that
     * no longer exists.
     */
    const rescan = async (): Promise<void> => {
        const found = new Set<string>(include);
        const usage: string[] = [];
        let namespaced = false;
        for (const file of await collectSourceFiles(resolve(root, dir), skip)) {
            let code: string;
            try {
                code = await readFile(file, "utf8");
            } catch {
                continue;
            }
            if (code.includes("--tempest-")) usage.push(code);
            if (STYLE_FILE.test(file)) continue;
            const scanned = scanStyleImports(code);
            if (scanned === null) namespaced = true;
            else for (const name of scanned) found.add(name);
        }
        appStyleUsage = usage.join("\n");
        names = namespaced ? null : [...found];
    };

    /**
     * The token block for this build, or `null` to `@import` the whole sheet.
     *
     * Reads the stylesheets the entry is about to load and closes over the tokens
     * they consult, plus the ones the app's own CSS consults. Any read it cannot
     * resolve statically — a name assembled at runtime, an unreadable sheet, a
     * package too old to ship `tokens.css` — returns `null`, which costs bytes and
     * never correctness. Serving a token sheet with a hole in it would do the
     * opposite.
     *
     * @param manifest - The published style manifest.
     * @param styleDir - Directory the manifest and its stylesheets live in.
     * @returns The narrowed sheet, or `null`.
     */
    const narrowedTokens = (manifest: StyleManifest, styleDir: string): string | null => {
        if (tokens === "all" || names === null) return null;
        let tokensCss: string;
        try {
            tokensCss = readFileSync(join(styleDir, "tokens.css"), "utf8");
        } catch {
            return null;
        }
        const parts: string[] = [appStyleUsage];
        for (const sheet of selectedSheets(names, manifest, reset)) {
            try {
                parts.push(readFileSync(join(styleDir, sheet), "utf8"));
            } catch {
                return null;
            }
        }
        return narrowTokens(tokensCss, parts.join("\n"));
    };

    return {
        name: "tempest-styles",
        enforce: "pre",

        configResolved(config: { root?: string }) {
            root = config.root ?? root;
        },

        async buildStart() {
            await rescan();
        },

        resolveId(id: string) {
            return id === TEMPEST_STYLES_ID ? RESOLVED_ID : null;
        },

        load(id: string) {
            if (id !== RESOLVED_ID) return null;
            const { manifest, dir: styleDir } = readManifest(root);
            return buildStyleEntry(names, manifest, reset, narrowedTokens(manifest, styleDir));
        },
    };
}
