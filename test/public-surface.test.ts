/**
 * Guard: everything the package exports has to be documented somewhere.
 *
 * The barrels use `export *`, which is convenient and indiscriminate: whatever a
 * module exposes to its neighbour becomes public API of the package. That is how
 * 57 internals — `groupMessages`, `tokenize`, a dozen `DEFAULT_*` constants —
 * ended up shipped as contract without anyone deciding to ship them. Renaming
 * any of them was, technically, a breaking change.
 *
 * The rule this pins is the one that cleaned them out: **if it is exported, it
 * is documented**. A symbol nobody wants to write a line about is a symbol that
 * should not be leaving the module. The fix for a failure here is therefore one
 * of two things, and both are deliberate:
 *
 *   - document it, if it is API; or
 *   - drop it from the barrel, keeping it importable inside `src/` by its
 *     relative path.
 *
 * Only runtime exports are checked. Types and interfaces are inferred at the
 * call site far more often than they are named, so requiring prose for each one
 * would push toward documenting `FooProps` instead of `Foo`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const DOCS = join(ROOT, "docs");

/** Subpath → entry module, mirroring the `exports` map in `package.json`. */
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

function listMarkdown(dir: string = DOCS, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) listMarkdown(full, out);
        else if (entry.name.endsWith(".md")) out.push(relative(DOCS, full));
    }
    return out;
}

/**
 * Every word the documentation says, in Portuguese plus the README.
 *
 * The EN mirrors are skipped: they carry the same symbols, and the docs guard
 * already fails when a page exists in one language only.
 */
function documentedText(): string {
    const pages = listMarkdown()
        .filter((page) => !page.endsWith(".en.md"))
        .map((page) => readFileSync(join(DOCS, page), "utf8"));
    return [...pages, readFileSync(join(ROOT, "README.md"), "utf8")].join("\n");
}

const program = ts.createProgram(
    Object.values(ENTRIES).map((file) => join(ROOT, file)),
    {
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        noEmit: true,
        skipLibCheck: true,
    },
);
const checker = program.getTypeChecker();

/**
 * Runtime exports of an entry module — functions, classes, constants,
 * components. A symbol that is only a type or an interface is skipped.
 */
function runtimeExports(file: string): string[] {
    const source = program.getSourceFile(join(ROOT, file));
    if (!source) throw new Error(`entry not found: ${file}`);
    const moduleSymbol = checker.getSymbolAtLocation(source);
    if (!moduleSymbol) throw new Error(`entry exports nothing: ${file}`);

    const TYPE_ONLY = ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface;
    return checker
        .getExportsOfModule(moduleSymbol)
        .filter((symbol) => {
            const target =
                symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
            const flags = target.getFlags();
            return (flags & TYPE_ONLY) === 0 || (flags & ~TYPE_ONLY) !== 0;
        })
        .map((symbol) => symbol.getName())
        .sort();
}

const prose = documentedText();

describe.each(Object.entries(ENTRIES))("public surface — %s", (subpath, file) => {
    it("exports something", () => {
        expect(runtimeExports(file).length).toBeGreaterThan(0);
    });

    it("documents every runtime export", () => {
        const undocumented = runtimeExports(file).filter(
            (name) => !new RegExp(`\\b${name.replace(/\$/g, "\\$")}\\b`).test(prose),
        );

        expect(undocumented).toEqual([]);
    });
});
