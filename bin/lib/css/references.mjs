// Where a CSS Module class is used in TypeScript.
//
// Extraction cannot be a CSS-only edit: deleting `.row` from `Card.module.css`
// leaves `styles.row` in `Card.tsx` evaluating to `undefined`, which renders an
// element with `class="undefined"` and no styling — valid code, silent damage. So
// the codemod only touches a class it can see **every** use of.
//
// "Every use" is decided with the project's own TypeScript compiler rather than a
// regex: `styles.row` inside a comment, a template literal or a string is not a
// use, and a regex cannot tell. When anything about a module's usage is not
// statically decidable — `styles[key]`, `Object.keys(styles)`, the object handed
// to a child as a prop — the whole module is declared opaque and nothing in it is
// extracted.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const SOURCE_EXTS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set([
    "node_modules",
    "dist",
    "build",
    "out",
    "coverage",
    ".git",
    ".vite",
    ".next",
    ".turbo",
    ".cache",
]);

/** Every source file under `root` the codemod may read. */
export function collectSources({ root, maxFiles = 4000 }) {
    const out = [];
    const walk = (dir) => {
        if (out.length >= maxFiles) return;
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name)) continue;
            if (entry.name.startsWith(".") && entry.isDirectory()) continue;
            const full = join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile() && SOURCE_EXTS.has(extname(entry.name))) out.push(full);
        }
    };
    walk(root);
    return out.sort((a, b) => a.localeCompare(b));
}

/**
 * Resolve an import specifier to an absolute path, honoring the project alias.
 *
 * @param {object} params
 * @param {string} params.specifier - Raw module specifier.
 * @param {string} params.fromFile - File the import is written in.
 * @param {{ prefix: string, baseDir: string } | null} params.alias
 * @returns {string | null} Absolute path, or `null` when it is a bare package.
 */
export function resolveSpecifier({ specifier, fromFile, alias }) {
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
        return resolve(dirname(fromFile), specifier);
    }
    if (alias && specifier.startsWith(`${alias.prefix}/`)) {
        return resolve(alias.baseDir, specifier.slice(alias.prefix.length + 1));
    }
    return null;
}

/**
 * Find every static use of a CSS Module's classes in one source file.
 *
 * @param {object} params
 * @param {string} params.filePath
 * @param {string} params.text - File contents.
 * @param {object} params.ts - The project's `typescript` module.
 * @param {Set<string>} params.moduleFiles - Absolute paths of the CSS Modules of interest.
 * @param {{ prefix: string, baseDir: string } | null} params.alias
 * @returns {{
 *   uses: Array<{ module: string, className: string, start: number, end: number, line: number }>,
 *   opaque: Array<{ module: string, reason: string, line: number }>,
 * }}
 */
export function findClassUses({ filePath, text, ts, moduleFiles, alias }) {
    const uses = [];
    const opaque = [];
    const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);

    /** Local identifier → absolute CSS Module path, for the modules we care about. */
    const bindings = new Map();
    for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement)) continue;
        const specifier = statement.moduleSpecifier;
        if (!ts.isStringLiteral(specifier)) continue;
        const target = resolveSpecifier({ specifier: specifier.text, fromFile: filePath, alias });
        if (!target || !moduleFiles.has(target)) continue;
        const clause = statement.importClause;
        if (clause?.name) bindings.set(clause.name.text, target);
        // `import * as styles from "./x.module.css"` behaves the same for our purposes.
        if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
            bindings.set(clause.namedBindings.name.text, target);
        }
    }
    if (bindings.size === 0) return { uses, opaque };

    const lineOf = (pos) => source.getLineAndCharacterOfPosition(pos).line + 1;

    /**
     * Range to replace with the new class string.
     *
     * `className={styles.row}` widens to the whole `{…}` container so the result
     * is `className="u-row"` rather than `className={"u-row"}` — the braces are
     * only there because the value was an expression, and leaving them behind
     * would make every rewritten attribute read like generated code.
     */
    const replacementRange = (access) => {
        const parent = access.parent;
        if (
            parent &&
            ts.isJsxExpression(parent) &&
            parent.expression === access &&
            parent.parent &&
            ts.isJsxAttribute(parent.parent)
        ) {
            return { start: parent.getStart(source), end: parent.getEnd() };
        }
        return { start: access.getStart(source), end: access.getEnd() };
    };

    /**
     * Record a use, or mark the module opaque when the reference is not a plain
     * `styles.name` / `styles["name"]` read.
     */
    const visit = (node) => {
        if (ts.isIdentifier(node) && bindings.has(node.text)) {
            const module = bindings.get(node.text);
            const parent = node.parent;
            const isImportName =
                parent &&
                (ts.isImportClause(parent) || ts.isNamespaceImport(parent)) &&
                parent.name === node;
            if (isImportName) return;

            if (parent && ts.isPropertyAccessExpression(parent) && parent.expression === node) {
                uses.push({
                    module,
                    className: parent.name.text,
                    ...replacementRange(parent),
                    line: lineOf(parent.getStart(source)),
                });
                return;
            }
            if (
                parent &&
                ts.isElementAccessExpression(parent) &&
                parent.expression === node &&
                parent.argumentExpression &&
                ts.isStringLiteralLike(parent.argumentExpression)
            ) {
                uses.push({
                    module,
                    className: parent.argumentExpression.text,
                    ...replacementRange(parent),
                    line: lineOf(parent.getStart(source)),
                });
                return;
            }
            opaque.push({
                module,
                reason:
                    parent && ts.isElementAccessExpression(parent)
                        ? "acesso dinâmico (`styles[expr]`)"
                        : "o objeto de estilos é usado inteiro, não por classe",
                line: lineOf(node.getStart(source)),
            });
            return;
        }
        ts.forEachChild(node, visit);
    };

    ts.forEachChild(source, visit);
    return { uses, opaque };
}

/**
 * Index every static class use across the project.
 *
 * @param {object} params
 * @param {string} params.root
 * @param {object} params.ts
 * @param {Iterable<string>} params.modulePaths - Absolute paths of CSS Modules.
 * @param {{ prefix: string, baseDir: string } | null} params.alias
 * @returns {{
 *   byModule: Map<string, Map<string, Array<{ file: string, start: number, end: number, line: number }>>>,
 *   opaqueModules: Map<string, { file: string, reason: string, line: number }>,
 *   texts: Map<string, string>,
 * }}
 */
export function indexClassUses({ root, ts, modulePaths, alias }) {
    const moduleFiles = new Set(modulePaths);
    const byModule = new Map();
    const opaqueModules = new Map();
    const texts = new Map();

    for (const file of collectSources({ root })) {
        let text;
        try {
            text = readFileSync(file, "utf8");
        } catch {
            continue;
        }
        if (!text.includes(".module.css")) continue;
        const { uses, opaque } = findClassUses({ filePath: file, text, ts, moduleFiles, alias });
        if (uses.length === 0 && opaque.length === 0) continue;
        texts.set(file, text);
        for (const entry of opaque) {
            if (!opaqueModules.has(entry.module)) {
                opaqueModules.set(entry.module, {
                    file: relative(root, file),
                    reason: entry.reason,
                    line: entry.line,
                });
            }
        }
        for (const use of uses) {
            const classes = byModule.get(use.module) ?? new Map();
            const sites = classes.get(use.className) ?? [];
            sites.push({ file, start: use.start, end: use.end, line: use.line });
            classes.set(use.className, sites);
            byModule.set(use.module, classes);
        }
    }

    return { byModule, opaqueModules, texts };
}
