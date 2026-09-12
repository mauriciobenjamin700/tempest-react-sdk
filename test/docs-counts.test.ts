import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { iconAliases } from "@/icons/generated/aliases";
import { iconNames } from "@/icons/generated/icon-names";

/**
 * The guard for numbers written in prose.
 *
 * Every other doc guard here checks structure — a mirror page, a nav entry, a
 * live anchor, an example that compiles. None of them reads a sentence, so a
 * count that goes stale stays green forever, and four of them did: measured on
 * 2026-09-12, `theme` claimed 104 components, `styles` claimed ~150, the README
 * claimed lucide had 2024 icons behind 25 letter-chunks, and the repo had 129
 * components, 2065 slugs and 46 range-shards. Those numbers survived 84
 * releases because nothing could contradict them.
 *
 * A number in the docs is a claim about this repo, and a claim about this repo
 * is testable. Each entry below pairs one measurement with the sentences that
 * are allowed to state it; a page that states a different number fails, naming
 * the page, the line and both values.
 *
 * What it deliberately does **not** do is ban numbers. Prose with the real
 * figure in it is the point — "129 components pick up the new brand" tells a
 * reader more than "every component does". This keeps that sentence honest
 * instead of driving it out.
 */

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
const DOCS = join(ROOT, "docs");

/** One measurable fact about the repo, and how it is written in the docs. */
interface Claim {
    /** What it is, for the failure message. */
    id: string;
    /** Reads the repo. Returns the number the docs have to agree with. */
    measure: () => number;
    /** Shell-ish description of the measurement, printed when it fails. */
    how: string;
    /**
     * Sentences that state this number. The first capture group is the figure,
     * read with `.`/thin-space thousands separators stripped — `5.571` in a
     * PT-BR page is five thousand, and `Number("5.571")` is 5.571.
     *
     * Written narrowly on purpose: `/(\d+) components/` would also match
     * "5 components + router" in a bundle-size line, which is a different claim
     * about a different thing.
     */
    patterns: RegExp[];
    /**
     * Substrings that opt a line out, each with the reason it is not a claim
     * about today's repo.
     */
    except?: { text: string; why: string }[];
}

/** Directories directly under a path, ignoring files. */
function directories(path: string): string[] {
    return readdirSync(path, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
}

const CLAIMS: Claim[] = [
    {
        id: "components",
        how: "ls -d src/components/*/ | wc -l",
        measure: () => directories(join(ROOT, "src", "components")).length,
        patterns: [
            /(?:os |todos os |all )?(\d{2,4}) (?:componentes|components) (?:passam|pick|and nothing|e nada)/g,
            /├── components\/\s+(\d{2,4}) componentes/g,
        ],
    },
    {
        id: "src modules",
        how: "ls -d src/*/ | wc -l",
        measure: () => directories(join(ROOT, "src")).length,
        patterns: [/^(\d{2,3}) módulos, um por domínio/gm, /src\/\s+(\d{2,3}) módulos de domínio/g],
    },
    {
        id: "icon slugs",
        how: "iconNames.length — the generated registry itself",
        /*
         * Imported rather than scraped. The first version of this counted string
         * literals with a regex and got the aliases wrong by 29, which is the
         * failure mode this whole file exists to catch: a measurement that looks
         * like a measurement. `npm run gen:icons` prints the same three numbers.
         */
        measure: () => iconNames.length,
        patterns: [
            /lucide's \*\*(\d{3,5}) icons by kebab-case slug\*\*/g,
            /(\d{3,5}) (?:slugs|ícones|icons) (?:do lucide|of lucide|no total|in total)/g,
        ],
    },
    {
        id: "icon aliases",
        how: "Object.keys(iconAliases).length — the generated registry itself",
        measure: () => Object.keys(iconAliases).length,
        patterns: [/lucide's (\d{2,4}) deprecated aliases/g, /(\d{2,4}) aliases depreciados/g],
    },
    {
        id: "canonical icon slugs",
        how: "iconNames.length - Object.keys(iconAliases).length, and the lines of docs/assets/icon-slugs.txt",
        measure: () => iconNames.length - Object.keys(iconAliases).length,
        patterns: [
            /(?:Os |The )(\d{3,5}) slugs \*\*canônicos\*\*/g,
            /(?:The )?(\d{3,5}) \*\*canonical\*\* slugs/g,
        ],
    },
    {
        id: "icon shards",
        how: "ls src/icons/generated/shard-*.ts | wc -l",
        measure: () =>
            readdirSync(join(ROOT, "src", "icons", "generated")).filter((file) =>
                file.startsWith("shard-"),
            ).length,
        patterns: [/(\d{2,3}) shards/g],
    },
    {
        id: "gallery sections",
        how: "grep -c 'className=\"gallery-section\"' examples/gallery/src/sections/*.tsx",
        measure: () => {
            const dir = join(ROOT, "examples", "gallery", "src", "sections");
            return readdirSync(dir)
                .filter((file) => file.endsWith(".tsx"))
                .reduce(
                    (total, file) =>
                        total +
                        [
                            ...readFileSync(join(dir, file), "utf8").matchAll(
                                /className="gallery-section"/g,
                            ),
                        ].length,
                    0,
                );
        },
        patterns: [
            /(\d{2,3}) (?:seções|sections)(?: da gallery| of the gallery)?/g,
            /(\d{2,3}) (?:demo sections|seções de demo)/g,
        ],
    },
    {
        id: "IBGE municipalities",
        how: "sum of `municipalities` across `states` in src/br/data/br-locations.json",
        measure: () => {
            const data = JSON.parse(
                readFileSync(join(ROOT, "src", "br", "data", "br-locations.json"), "utf8"),
            ) as { states: Record<string, { cities: unknown[] }> };
            return Object.values(data.states).reduce((total, uf) => total + uf.cities.length, 0);
        },
        patterns: [/(\d[\d.]{3,6}) (?:municípios|municipalities)/g],
    },
    {
        id: "DF administrative regions",
        how: "length of administrativeRegions['5300108'] in src/br/data/br-locations.json",
        measure: () => {
            const data = JSON.parse(
                readFileSync(join(ROOT, "src", "br", "data", "br-locations.json"), "utf8"),
            ) as { administrativeRegions: Record<string, unknown[]> };
            return data.administrativeRegions["5300108"]?.length ?? 0;
        },
        patterns: [
            /(\d{2,3}) (?:RAs do DF|regiões administrativas|administrative regions)/g,
            /administrativeRegionsByUf\("DF"\)\.length; \/\/ (\d{2,3})/g,
        ],
    },
    {
        id: "published doc pages",
        how: "find docs -name '*.md' -not -name '*.en.md' -not -path 'docs/internal/*' | wc -l",
        measure: () => {
            let count = 0;
            const walk = (dir: string): void => {
                for (const entry of readdirSync(dir, { withFileTypes: true })) {
                    if (entry.isDirectory()) {
                        if (entry.name === "internal") continue;
                        walk(join(dir, entry.name));
                    } else if (entry.name.endsWith(".md") && !entry.name.endsWith(".en.md")) {
                        count += 1;
                    }
                }
            };
            walk(DOCS);
            return count;
        },
        patterns: [/(\d{2,4}) páginas base/g, /(\d{2,4}) base pages/g],
    },
    {
        id: "published tags",
        /*
         * Counted from `RELEASES.md`, not from `git tag`.
         *
         * The first version asked git, and CI checks out shallow without tags, so
         * the measurement returned 0 there and the guard failed on a correct page.
         * `RELEASES.md` is generated from the tags by `make releases-md` and
         * audited against npm and the GitHub Releases by `make releases-check`, so
         * it is the same fact in a file every checkout has.
         */
        how: "rows of RELEASES.md (generated from git tags by `make releases-md`)",
        measure: () =>
            [
                ...readFileSync(join(ROOT, "RELEASES.md"), "utf8").matchAll(
                    /^\| v\d+\.\d+\.\d+\s*\|/gm,
                ),
            ].length,
        patterns: [/(\d{2,4}) tags publicadas/g, /(\d{2,4}) published tags/g],
    },
    {
        id: "published subpaths",
        how: "count the keys of `exports` in package.json",
        measure: () => {
            const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
                exports: Record<string, unknown>;
            };
            return Object.keys(pkg.exports).length;
        },
        patterns: [/\*\*Subpaths\*\* \((\d{1,3}),/g, /(\d{1,3}) subpaths/g],
    },
];

/** Every markdown file that is prose about this repo: the site plus the README. */
function pages(): string[] {
    const out: string[] = [join(ROOT, "README.md"), join(ROOT, "CLAUDE.md")];
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith(".md")) out.push(full);
        }
    };
    walk(DOCS);
    return out.filter((page) => !page.endsWith("llms.txt") && !page.includes("llms-full"));
}

describe("numbers the docs state about this repo", () => {
    const files = pages().map((path) => ({
        path: relative(ROOT, path),
        lines: readFileSync(path, "utf8").split("\n"),
    }));

    it.each(CLAIMS)("$id matches what the repo measures", (claim) => {
        const actual = claim.measure();
        const wrong: string[] = [];

        for (const file of files) {
            file.lines.forEach((line, index) => {
                if (claim.except?.some((entry) => line.includes(entry.text))) return;
                for (const pattern of claim.patterns) {
                    for (const match of line.matchAll(new RegExp(pattern.source, pattern.flags))) {
                        const stated = Number((match[1] as string).replace(/[.\u202f ]/g, ""));
                        if (stated !== actual) {
                            wrong.push(
                                `${file.path}:${index + 1} says ${stated}, repo has ${actual}` +
                                    ` (${claim.how})`,
                            );
                        }
                    }
                }
            });
        }

        expect(wrong).toEqual([]);
    });

    /**
     * A claim whose measurement stops finding anything is worse than a wrong
     * number: it passes, silently, about a file that moved.
     */
    it.each(CLAIMS)("$id is actually measurable", (claim) => {
        expect(claim.measure()).toBeGreaterThan(0);
    });

    /**
     * And a pattern nobody matches is a guard that guards nothing — the docs
     * were rewritten and the regex was left behind.
     */
    it.each(CLAIMS)("$id is stated somewhere in the docs", (claim) => {
        const hits = files.flatMap((file) =>
            file.lines.filter((line) =>
                claim.patterns.some((pattern) =>
                    new RegExp(pattern.source, pattern.flags).test(line),
                ),
            ),
        );
        expect(hits.length, `no page states the ${claim.id} count any more`).toBeGreaterThan(0);
    });
});

describe("the per-component stylesheets the build emits", () => {
    /**
     * Measured from `dist/`, so it is skipped when nothing is built — the suite
     * runs before the build in CI, and a test that needs `dist/` would only ever
     * be skipped there.
     */
    it("matches the count the docs state, when dist is present", () => {
        const dir = join(ROOT, "dist", "styles", "component");
        if (!existsSync(dir)) return;
        const sheets = readdirSync(dir).filter((file) => file.endsWith(".css")).length;
        const wrong: string[] = [];
        for (const file of pages()) {
            readFileSync(file, "utf8")
                .split("\n")
                .forEach((line, index) => {
                    for (const match of line.matchAll(
                        /(\d{2,4}) (?:folhas por componente|per-component stylesheets)/g,
                    )) {
                        if (Number(match[1]) !== sheets) {
                            wrong.push(
                                `${relative(ROOT, file)}:${index + 1} says ${match[1]},` +
                                    ` dist has ${sheets}`,
                            );
                        }
                    }
                });
        }
        expect(wrong).toEqual([]);
    });
});

/**
 * Versions the CHANGELOG documents, against the ones that actually shipped.
 *
 * Found by accident while fixing the tag count: `0.6.0` and `0.6.1` had full
 * sections — a new module, a CLI — and no tag, and no npm version. The registry
 * goes from `0.5.1` straight to `0.7.0`, so anyone who read the changelog and ran
 * `npm i tempest-react-sdk@0.6.0` got nothing. The work shipped inside `0.7.0`.
 *
 * They are kept, annotated, because deleting them would delete the history. This
 * test is what stops the next one from being silent: a documented version either
 * shipped, or says on its own heading that it did not.
 */
describe("versions the CHANGELOG documents", () => {
    it("either shipped, or say on the heading that they did not", () => {
        const changelog = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
        const released = new Set(
            [
                ...readFileSync(join(ROOT, "RELEASES.md"), "utf8").matchAll(
                    /^\| v(\d+\.\d+\.\d+)\s*\|/gm,
                ),
            ].map((match) => match[1]),
        );

        const unshipped: string[] = [];
        for (const match of changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\](.*)$/gm)) {
            const [, version = "", rest = ""] = match;
            if (released.has(version)) continue;
            if (/nunca publicada|never published/i.test(rest)) continue;
            unshipped.push(version);
        }

        expect(unshipped).toEqual([]);
    });
});
