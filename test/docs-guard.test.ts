/**
 * Guards that keep the documentation honest about the code it documents.
 *
 * Three checks, all cheap enough for the gating suite:
 *
 * 1. **Every page exists in both languages** (`<page>.md` + `<page>.en.md`) and
 *    is reachable from the `nav`. A missing mirror silently falls back to the
 *    other language on the built site, and a page outside the nav is a page
 *    nobody finds.
 * 2. **Every documented example compiles.** Each fenced `tsx`/`ts` block that
 *    carries an `import` is handed to the TypeScript compiler with the SDK's
 *    subpaths mapped to `src/`. This is what catches the defects `mkdocs build`
 *    cannot see: an import of a symbol that was renamed or never shipped, a
 *    prop the component does not accept, an option key that does not exist on
 *    the options interface. Every one of those was found in the docs the first
 *    time this ran.
 *
 *    The `import` is the line between a program and a fragment, which is why it
 *    is the filter: a block importing anything — the SDK, `react`, `vite` — is
 *    something a reader saves to a file and runs. A block without one is an
 *    excerpt in the middle of the prose or a type shown for reading, and
 *    compiling those reports only the names the surrounding page established.
 * 3. Both run over the PT pages only. The EN mirrors carry the same code
 *    blocks, and checking them twice doubles the runtime to re-prove the same
 *    thing — the parity check above is what keeps the mirror in step.
 *
 * The blocks are compiled from memory through a custom `CompilerHost`: they get
 * paths inside the repository so Node module resolution finds `react` and the
 * SDK's own dependencies, but nothing is ever written to disk.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const DOCS = join(ROOT, "docs");

/**
 * Subpath → entry module, mirroring the `exports` map in `package.json`. The
 * vision entry is `public.ts` (the vendored `index.ts` plus this SDK's own
 * camera hooks), which is what the published subpath resolves to.
 */
const ENTRIES: Record<string, string> = {
    ".": "src/index.ts",
    "/testing": "src/testing/index.ts",
    "/vite": "src/vite/index.ts",
    "/sw": "src/sw/index.ts",
    "/charts": "src/charts/index.ts",
    "/editor": "src/editor/index.ts",
    "/vision": "src/vision/public.ts",
    "/br": "src/br/index.ts",
    "/icons": "src/icons/index.ts",
    "/imaging": "src/imaging/index.ts",
    "/tabular": "src/tabular/index.ts",
};

/**
 * Diagnostics a deliberately partial example is expected to raise, and which
 * therefore say nothing about the SDK.
 *
 * A doc block is a slice of an app, not a whole one: it imports from
 * `@/lib/api`, uses a `user` defined three sections up, and renders inside a
 * component the page described earlier. Those raise "cannot find module" /
 * "cannot find name" and the parse errors that follow from them. Anything else
 * — a wrong prop, a renamed export, an option key that does not exist — is a
 * defect in the page and fails this suite.
 */
const FRAGMENT_CODES: ReadonlySet<number> = new Set([
    2307, 2304, 2300, 2395, 2440, 2503, 2552, 2593, 2657, 2695, 1108, 1109, 7006, 7031, 18004,
    18046,
]);

/**
 * Diagnostics caused by ambient types an app has and this harness does not:
 * `vite/client` (`import.meta.env`) and the service-worker lib
 * (`ExtendableEvent.waitUntil`). Matched on message because the same codes
 * carry real defects in other situations.
 */
const AMBIENT_PATTERNS: readonly RegExp[] = [/ImportMeta/, /waitUntil/];

/** CSS side-effect imports (`tempest-react-sdk/styles.css`), which carry no types. */
const CSS_IMPORT_CODE = 2882;

function listMarkdown(dir: string = DOCS, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) listMarkdown(full, out);
        else if (entry.name.endsWith(".md")) out.push(relative(DOCS, full));
    }
    return out;
}

const allPages = listMarkdown().sort();
const ptPages = allPages.filter((page) => !page.endsWith(".en.md"));

describe("docs structure", () => {
    it("every PT page has its EN mirror, and vice versa", () => {
        const missingEn = ptPages.filter(
            (page) => !allPages.includes(page.replace(/\.md$/, ".en.md")),
        );
        const missingPt = allPages
            .filter((page) => page.endsWith(".en.md"))
            .filter((page) => !allPages.includes(page.replace(/\.en\.md$/, ".md")));

        expect({ missingEn, missingPt }).toEqual({ missingEn: [], missingPt: [] });
    });

    it("every page is reachable from the nav, and every nav entry exists", () => {
        const mkdocs = readFileSync(join(ROOT, "mkdocs.yml"), "utf8");
        const navBlock = mkdocs.slice(mkdocs.indexOf("\nnav:"));
        const navPages = [...navBlock.matchAll(/([A-Za-z0-9._/-]+\.md)\s*$/gm)].map((m) => m[1]);

        const orphanPages = ptPages.filter((page) => !navPages.includes(page));
        const danglingNav = navPages.filter((page) => !existsSync(join(DOCS, page)));

        expect({ orphanPages, danglingNav }).toEqual({ orphanPages: [], danglingNav: [] });
    });
});

interface DocBlock {
    page: string;
    index: number;
    fileName: string;
    code: string;
}

/**
 * Every fenced TS/TSX block, across the PT pages, that carries an `import`.
 *
 * The import is what separates a program from a fragment. A block importing
 * anything — the SDK, `react`, `vite`, `zod` — is something a reader saves to a
 * file and runs, so it has to compile. A block without one is the three-line
 * excerpt in the middle of the prose, or a type shown for reading; compiling
 * those would only ever report the names the surrounding page established, which
 * is noise dressed as a finding.
 */
function collectBlocks(): DocBlock[] {
    const fence = /```(tsx|ts|typescript)\n([\s\S]*?)```/g;
    const blocks: DocBlock[] = [];

    for (const page of ptPages) {
        const text = readFileSync(join(DOCS, page), "utf8");
        let index = 0;
        for (const match of text.matchAll(fence)) {
            index += 1;
            const code = match[2];
            if (!/^\s*import\s/m.test(code)) continue;
            blocks.push({
                page,
                index,
                code,
                fileName: join(ROOT, ".docs-blocks", `${page.replace(/[/.]/g, "_")}__${index}.tsx`),
            });
        }
    }
    return blocks;
}

/**
 * Compile the blocks and return the diagnostics that indicate a broken example.
 *
 * The blocks never touch the disk: a `CompilerHost` serves them from memory at
 * paths under the repository root, so `react`, `zod` and the rest resolve from
 * the project's own `node_modules` exactly as they would for a reader's app.
 */
function compileBlocks(blocks: DocBlock[]): string[] {
    const sources = new Map(blocks.map((block) => [block.fileName, block.code]));
    const options: ts.CompilerOptions = {
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        baseUrl: ROOT,
        paths: Object.fromEntries(
            Object.entries(ENTRIES).map(([subpath, file]) => [
                subpath === "." ? "tempest-react-sdk" : `tempest-react-sdk${subpath}`,
                [join(ROOT, file)],
            ]),
        ),
        lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    };

    const host = ts.createCompilerHost(options, true);
    const readFile = host.readFile.bind(host);
    const fileExists = host.fileExists.bind(host);
    const getSourceFile = host.getSourceFile.bind(host);

    host.readFile = (fileName) => sources.get(fileName) ?? readFile(fileName);
    host.fileExists = (fileName) => sources.has(fileName) || fileExists(fileName);
    host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
        const code = sources.get(fileName);
        if (code === undefined)
            return getSourceFile(fileName, languageVersion, onError, shouldCreate);
        return ts.createSourceFile(fileName, code, languageVersion, true, ts.ScriptKind.TSX);
    };

    const program = ts.createProgram(
        blocks.map((block) => block.fileName),
        options,
        host,
    );
    const byFile = new Map(blocks.map((block) => [block.fileName, block]));
    const failures: string[] = [];

    for (const diagnostic of [
        ...program.getSemanticDiagnostics(),
        ...program.getSyntacticDiagnostics(),
    ]) {
        const block = diagnostic.file && byFile.get(diagnostic.file.fileName);
        if (!block || diagnostic.file === undefined) continue;

        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
        if (FRAGMENT_CODES.has(diagnostic.code)) continue;
        if (diagnostic.code === CSS_IMPORT_CODE) continue;
        if (AMBIENT_PATTERNS.some((pattern) => pattern.test(message))) continue;

        const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
        failures.push(
            `${block.page} (block ${block.index}, line ${line + 1}): TS${diagnostic.code} ${message}`,
        );
    }
    return failures;
}

describe("docs examples", () => {
    const blocks = collectBlocks();

    /**
     * A floor, not a count: it fails when a refactor silently stops collecting
     * examples — a broken fence regex would otherwise turn this whole suite
     * green by having nothing to check.
     */
    it("collects the runnable examples across the documentation", () => {
        expect(blocks.length).toBeGreaterThan(400);
    });

    it("every example compiles against the SDK", { timeout: 120_000 }, () => {
        expect(compileBlocks(blocks)).toEqual([]);
    });
});
