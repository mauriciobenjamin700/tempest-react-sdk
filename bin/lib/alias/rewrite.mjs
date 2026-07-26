// Rewrite relative module specifiers to the project alias, driven by the
// TypeScript AST so only real specifier positions are touched.
import { extname } from "node:path";

import { isInsideBase, toAlias } from "./specifier.mjs";

const SCRIPT_KIND_BY_EXT = {
    ".ts": "TS",
    ".mts": "TS",
    ".cts": "TS",
    ".tsx": "TSX",
    ".js": "JS",
    ".mjs": "JS",
    ".cjs": "JS",
    ".jsx": "JSX",
};

const MOCK_METHODS = new Set(["mock", "doMock", "unmock", "doUnmock"]);

/**
 * Pick the `ts.ScriptKind` for a file so JSX parses as JSX.
 *
 * Getting this wrong is silent: parsed with `ScriptKind.TS`, a `.tsx` file's
 * `<Foo />` becomes a type assertion and the specifiers after it are never
 * visited.
 *
 * @param {string} filePath
 * @param {object} ts - The `typescript` module.
 * @returns {number} A `ts.ScriptKind` value.
 */
function scriptKindFor(filePath, ts) {
    return ts.ScriptKind[SCRIPT_KIND_BY_EXT[extname(filePath)] ?? "TSX"];
}

/**
 * True for a `vi.mock(...)`-family call expression.
 *
 * The mock path has to travel with the import it shadows: Vitest matches mocks
 * by resolved id, so converting the import while leaving the mock relative keeps
 * working, but a half-converted *pair* in a file someone later moves is exactly
 * the silent-mock failure this avoids.
 *
 * @param {object} node - A `ts.CallExpression`.
 * @param {object} ts - The `typescript` module.
 * @returns {boolean}
 */
function isViMockCall(node, ts) {
    const target = node.expression;
    return (
        ts.isPropertyAccessExpression(target) &&
        ts.isIdentifier(target.expression) &&
        target.expression.text === "vi" &&
        ts.isIdentifier(target.name) &&
        MOCK_METHODS.has(target.name.text)
    );
}

/**
 * Collect every string literal that sits in a module-specifier position.
 *
 * This is the whole reason the codemod parses instead of running a regex: a path
 * inside a comment, a template literal, a plain variable or a `vi.mock` call with
 * a computed argument never reaches this list.
 *
 * @param {object} sourceFile - A `ts.SourceFile`.
 * @param {object} ts - The `typescript` module.
 * @returns {object[]} The `ts.StringLiteral` nodes, in source order.
 */
function collectSpecifiers(sourceFile, ts) {
    const found = [];
    const push = (node) => {
        if (node && ts.isStringLiteral(node)) found.push(node);
    };
    const visit = (node) => {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
            push(node.moduleSpecifier);
        } else if (ts.isImportTypeNode(node)) {
            if (ts.isLiteralTypeNode(node.argument)) push(node.argument.literal);
        } else if (ts.isCallExpression(node)) {
            const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
            if (isDynamicImport || isViMockCall(node, ts)) push(node.arguments[0]);
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return found;
}

/**
 * Rewrite the relative specifiers of one source file to the alias form.
 *
 * Pure: takes text, returns text. Nothing is read from or written to disk, which
 * is what makes the rule itself testable without a fixture tree.
 *
 * Edits are applied back-to-front so that earlier offsets stay valid, and the
 * original quote character is reused so the pass never fights Prettier over
 * quote style. Formatting and import order are deliberately left alone — the
 * `eslint --fix` and Prettier passes that follow own those.
 *
 * Files outside `baseDir` are returned untouched: see `isInsideBase`.
 *
 * @param {object} params
 * @param {string} params.text - File contents.
 * @param {string} params.filePath - Absolute path of the file.
 * @param {string} params.prefix - Alias prefix, e.g. `"@"`.
 * @param {string} params.baseDir - Absolute alias base directory.
 * @param {object} params.ts - The `typescript` module.
 * @returns {{ text: string, changes: Array<{ from: string, to: string, line: number }> }}
 */
export function rewriteSource({ text, filePath, prefix, baseDir, ts }) {
    if (!isInsideBase(filePath, baseDir)) return { text, changes: [] };

    const sourceFile = ts.createSourceFile(
        filePath,
        text,
        ts.ScriptTarget.Latest,
        true,
        scriptKindFor(filePath, ts),
    );

    const edits = [];
    const changes = [];
    for (const literal of collectSpecifiers(sourceFile, ts)) {
        const to = toAlias({ spec: literal.text, filePath, prefix, baseDir });
        if (!to) continue;
        const start = literal.getStart(sourceFile);
        const end = literal.getEnd();
        edits.push({ start, end, quote: text[start], to });
        changes.push({
            from: literal.text,
            to,
            line: sourceFile.getLineAndCharacterOfPosition(start).line + 1,
        });
    }

    let out = text;
    for (const { start, end, quote, to } of edits.reverse()) {
        out = `${out.slice(0, start)}${quote}${to}${quote}${out.slice(end)}`;
    }
    return { text: out, changes };
}
