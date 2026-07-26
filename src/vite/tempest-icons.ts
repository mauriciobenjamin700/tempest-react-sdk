import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { iconAliases } from "@/icons/generated/aliases";
import { iconNames } from "@/icons/generated/icon-names";

import type { TempestVitePlugin } from "./tempest-pwa-manifest";

/** The module id an app imports to get its static registry. */
export const TEMPEST_ICONS_ID = "virtual:tempest-icons";

const RESOLVED_ID = `\0${TEMPEST_ICONS_ID}`;

/**
 * Slugs written as a literal `name` prop or a literal `name:` field.
 *
 * Matching the *attribute* rather than any kebab-case string is what keeps the
 * scan from sweeping in unrelated text — a CSS class, a translation key and a
 * route segment all look like slugs otherwise. Everything matched is still
 * validated against lucide's real slug list before it reaches the module.
 */
const NAME_PATTERNS = [
    /\bname\s*=\s*["']([a-z0-9-]+)["']/g,
    /\bname\s*=\s*\{\s*["']([a-z0-9-]+)["']\s*\}/g,
    /\bname\s*:\s*["']([a-z0-9-]+)["']/g,
];

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage"]);

export interface TempestIconsOptions {
    /**
     * Directory to scan, relative to the Vite root. Default: `"src"`.
     */
    dir?: string;
    /**
     * Extra slugs to include even when the scan cannot see them — a name built by
     * concatenation, or one that only ever arrives from the API but is worth
     * paying for statically because it is on the first screen.
     */
    include?: readonly string[];
    /** Directory names to skip. Default: `node_modules`, `dist`, `build`, `coverage`. */
    skipDirs?: readonly string[];
}

/**
 * Collect the icon slugs a source file references literally.
 *
 * @param code - File contents.
 * @param known - The set of real lucide slugs, aliases included.
 * @returns The slugs found, validated against `known`.
 */
export function scanIconSlugs(code: string, known: ReadonlySet<string>): string[] {
    const found = new Set<string>();
    for (const pattern of NAME_PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(code)) !== null) {
            if (known.has(match[1])) found.add(match[1]);
        }
    }
    return [...found];
}

/**
 * Build the virtual module source for a set of slugs.
 *
 * Aliases resolve to their canonical slug before importing, because only the
 * canonical name is a real lucide export — but the alias key still points at the
 * component, so `<Icon name="alert-circle" />` stays a zero-request lookup.
 *
 * @param slugs - Validated slugs to include.
 * @param aliases - Alias slug → canonical slug.
 * @returns ES module source.
 */
export function buildIconsModule(
    slugs: readonly string[],
    aliases: Record<string, string>,
): string {
    const sorted = [...new Set(slugs)].sort();
    if (!sorted.length) return "export const staticIcons = {};\n";

    const componentOf = new Map<string, string>();
    for (const slug of sorted) componentOf.set(slug, pascalCase(aliases[slug] ?? slug));

    const named = [...new Set(componentOf.values())]
        .sort()
        .map((name) => (localName(name) === name ? name : `${name} as ${localName(name)}`))
        .join(", ");
    const entries = sorted
        .map((slug) => `    "${slug}": ${localName(componentOf.get(slug) as string)},`)
        .join("\n");
    return `import { ${named} } from "lucide-react";

export const staticIcons = {
${entries}
};
`;
}

/** `circle-alert` → `CircleAlert`; `a-arrow-down` → `AArrowDown`. */
function pascalCase(slug: string): string {
    return slug
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");
}

/**
 * Export names that would shadow a restricted global if bound directly.
 *
 * Lucide ships an icon literally called `infinity`, whose export is `Infinity`.
 * Binding that at module scope shadows the global, so the import is aliased.
 */
const RESERVED_NAMES = new Set(["Infinity", "NaN", "undefined", "eval", "arguments"]);

/** The local binding to use for a lucide export name. */
function localName(name: string): string {
    return RESERVED_NAMES.has(name) ? `${name}Icon` : name;
}

/**
 * Walk a directory and collect every source file path.
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
        } else if (entry.isFile() && SOURCE_FILE.test(entry.name)) {
            out.push(join(dir, entry.name));
        }
    }
    return out;
}

/**
 * Generate a static icon registry from the slugs your source mentions.
 *
 * Removes the reason to reach for `lucide-react`'s `DynamicIcon`: the slugs an app
 * writes as literals become ordinary static imports, so the bundler keeps exactly
 * those icons and the browser makes **no** extra request for them. A slug that only
 * exists at runtime still works — `<Icon>` falls back to fetching one shard per
 * initial letter.
 *
 * The scan reads the source tree directly at `buildStart` rather than harvesting
 * modules as they pass through `transform`: relying on transform order would let
 * the virtual module load before every consumer had been seen, and the registry
 * would come out short on a cold dev start — silently, since the missing slugs
 * would still render via the lazy path.
 *
 * @example
 * // vite.config.ts
 * import { createViteConfig, tempestIcons } from "tempest-react-sdk/vite";
 *
 * export default createViteConfig({ plugins: [tempestIcons()] });
 *
 * @example
 * // src/main.tsx
 * import { IconProvider } from "tempest-react-sdk/icons";
 * import { staticIcons } from "virtual:tempest-icons";
 *
 * <IconProvider registry={staticIcons}>
 *     <App />
 * </IconProvider>
 */
export function tempestIcons(options: TempestIconsOptions = {}): TempestVitePlugin {
    const { dir = "src", include = [], skipDirs } = options;
    const known = new Set<string>(iconNames);
    const skip = new Set<string>(skipDirs ?? SKIP_DIRS);
    const slugs = new Set<string>(include.filter((slug) => known.has(slug)));
    let root = process.cwd();

    /** Rescan the source tree, keeping the explicitly included slugs. */
    const rescan = async (): Promise<void> => {
        const files = await collectSourceFiles(resolve(root, dir), skip);
        for (const file of files) {
            try {
                const code = await readFile(file, "utf8");
                for (const slug of scanIconSlugs(code, known)) slugs.add(slug);
            } catch {
                /* an unreadable file just contributes nothing */
            }
        }
    };

    return {
        name: "tempest-icons",
        enforce: "pre",

        configResolved(config: { root?: string }) {
            root = config.root ?? root;
        },

        async buildStart() {
            await rescan();
        },

        resolveId(id: string) {
            return id === TEMPEST_ICONS_ID ? RESOLVED_ID : null;
        },

        load(id: string) {
            return id === RESOLVED_ID ? buildIconsModule([...slugs], iconAliases) : null;
        },

        /**
         * Pick up a slug added while the dev server is running.
         *
         * A newly written `<Icon name="save" />` would otherwise only render via
         * the lazy path until the next restart. Rescanning the changed file and
         * invalidating the virtual module keeps dev and build agreeing on what the
         * static registry contains.
         */
        async handleHotUpdate(ctx: {
            file: string;
            read: () => Promise<string>;
            server: { moduleGraph: { getModuleById: (id: string) => unknown } };
        }) {
            if (!SOURCE_FILE.test(ctx.file)) return;
            const before = slugs.size;
            for (const slug of scanIconSlugs(await ctx.read(), known)) slugs.add(slug);
            if (slugs.size === before) return;
            const mod = ctx.server.moduleGraph.getModuleById(RESOLVED_ID);
            if (mod) return [mod];
        },
    } as TempestVitePlugin;
}
