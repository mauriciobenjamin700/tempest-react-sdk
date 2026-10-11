/**
 * Context-aware escaping for text copied from an OpenAPI document into generated
 * TypeScript.
 *
 * The spec is input the developer does not control — a partner API, a shared
 * backend, a document fetched over the network — and the generated files are
 * imported by the app. Every spec string therefore reaches the output through one
 * of these functions, chosen by the syntactic position it lands in:
 *
 * - identifier position (schema names, path parameters, class names) →
 *   {@link assertIdentifier}, which refuses instead of rewriting, because a
 *   renamed type would silently stop matching the API it describes;
 * - string position → `JSON.stringify` at the call site;
 * - doc comment → {@link commentText};
 * - URL template literal → {@link urlTemplate}.
 */

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * Words that parse as an identifier but cannot name a type alias, a `const` or a
 * parameter in a generated module. Ported from the ECMAScript reserved words plus
 * the TypeScript predefined type names that `type X = ...` rejects.
 */
export const RESERVED_WORDS = new Set([
    "any",
    "await",
    "bigint",
    "boolean",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "export",
    "extends",
    "false",
    "finally",
    "for",
    "function",
    "if",
    "implements",
    "import",
    "in",
    "instanceof",
    "interface",
    "let",
    "never",
    "new",
    "null",
    "number",
    "object",
    "package",
    "private",
    "protected",
    "public",
    "return",
    "static",
    "string",
    "super",
    "switch",
    "symbol",
    "this",
    "throw",
    "true",
    "try",
    "typeof",
    "undefined",
    "unknown",
    "var",
    "void",
    "while",
    "with",
    "yield",
]);

/**
 * Return `name` when it is a valid, non-reserved TypeScript identifier, or throw.
 *
 * @param {unknown} name - The spec string about to land in identifier position.
 * @param {string} what - What the name is, for the error ("schema name").
 * @returns {string} The same name.
 * @throws {Error} When the name would not parse as a single identifier.
 */
export function assertIdentifier(name, what) {
    if (typeof name !== "string" || !IDENTIFIER.test(name)) {
        throw new Error(
            `OpenAPI ${what} ${JSON.stringify(name)} is not a valid TypeScript identifier (expected ${IDENTIFIER}). Rename it in the spec; the generator does not rewrite names it would have to match at runtime.`,
        );
    }
    if (RESERVED_WORDS.has(name)) {
        throw new Error(
            `OpenAPI ${what} ${JSON.stringify(name)} is a reserved word in TypeScript. Rename it in the spec.`,
        );
    }
    return name;
}

/**
 * Make spec text safe inside a `/** ... *\/` block comment.
 *
 * Line terminators collapse to a space, so the text cannot start a new line of
 * the comment, and every `*\/` is broken as `*\\/` so it cannot close it.
 *
 * @param {unknown} text - The spec text (tag, summary, path).
 * @returns {string} The neutralized single-line text.
 */
export function commentText(text) {
    return String(text)
        .replace(/[\r\n\u2028\u2029]+/g, " ")
        .replace(/\*\//g, "*\\/");
}

/**
 * Escape a static fragment for the inside of a template literal.
 *
 * @param {string} text - Literal text from the path.
 * @returns {string} The text with `\`, `` ` `` and `${` escaped.
 */
function templateText(text) {
    return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

/**
 * Build the URL expression for an operation path.
 *
 * Static segments are escaped for the template literal; each `{name}` placeholder
 * must be a declared path parameter and a valid identifier, and becomes `${name}`.
 * A path without placeholders is emitted as a JSON string literal.
 *
 * @param {string} path - The OpenAPI path key ("/users/{id}").
 * @param {Set<string>} declared - Names of the operation's `in: "path"` params.
 * @returns {string} A TypeScript expression evaluating to the URL.
 * @throws {Error} When a placeholder is undeclared or not an identifier.
 */
export function urlTemplate(path, declared) {
    if (declared.size === 0) return JSON.stringify(path);
    let out = "";
    let last = 0;
    for (const match of path.matchAll(/\{([^}]*)\}/g)) {
        const name = match[1];
        if (!declared.has(name)) {
            throw new Error(
                `OpenAPI path ${JSON.stringify(path)}: placeholder ${JSON.stringify(name)} is not a declared path parameter.`,
            );
        }
        out += templateText(path.slice(last, match.index)) + "${" + name + "}";
        last = match.index + match[0].length;
    }
    out += templateText(path.slice(last));
    return "`" + out + "`";
}
