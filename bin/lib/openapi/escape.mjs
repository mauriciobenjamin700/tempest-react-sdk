/**
 * Context-aware escaping for text copied from an OpenAPI document into generated
 * TypeScript.
 *
 * The spec is input the developer does not control — a partner API, a shared
 * backend, a document fetched over the network — and the generated files are
 * imported by the app. Every spec string therefore reaches the output through one
 * of these functions, chosen by the syntactic position it lands in:
 *
 * - identifier position (schema names, path parameters) → {@link toIdentifier},
 *   which maps a name that is not a TypeScript identifier (`user-id`,
 *   `user.Response`) to one that is. The mapped name only ever appears in
 *   identifier position; wherever the name matters at runtime — the URL
 *   placeholder, an object key — the spec's original is used, escaped. Two
 *   names that map to the same identifier are refused by
 *   {@link assertNoCollision}, never silently merged;
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
 * Map a spec name to a valid, non-reserved TypeScript identifier.
 *
 * A name that already is one is returned unchanged, so a spec that generated
 * fine before keeps generating the same code. Otherwise the name is split into
 * its alphanumeric words and joined in `camel` case (parameters: `user-id` →
 * `userId`) or `pascal` case (schemas and types: `user.Response` →
 * `UserResponse`). A reserved word, or a rebuilt name that starts with a digit
 * or is reserved, gets a `_` prefix (`string` → `_string`, `2fa` → `_2fa`). Only `[A-Za-z0-9_$]`
 * survives, so no spec text can reach the output through this path.
 *
 * @param {unknown} name - The spec string about to land in identifier position.
 * @param {"camel"|"pascal"} style - Case for a name that has to be rebuilt.
 * @param {string} what - What the name is, for the error ("schema name").
 * @returns {string} The identifier.
 * @throws {Error} When the name has no alphanumeric character to build one from.
 */
export function toIdentifier(name, style, what) {
    if (typeof name === "string" && IDENTIFIER.test(name)) {
        return RESERVED_WORDS.has(name) ? `_${name}` : name;
    }
    const words = typeof name === "string" ? (name.match(/[A-Za-z0-9]+/g) ?? []) : [];
    if (words.length === 0) {
        throw new Error(
            `OpenAPI ${what} ${JSON.stringify(name)} has no letter or digit to build a TypeScript identifier from. Rename it in the spec.`,
        );
    }
    const joined = words
        .map((w, i) =>
            i === 0 && style === "camel"
                ? w.charAt(0).toLowerCase() + w.slice(1)
                : w.charAt(0).toUpperCase() + w.slice(1),
        )
        .join("");
    return /^[0-9]/.test(joined) || RESERVED_WORDS.has(joined) ? `_${joined}` : joined;
}

/**
 * Throw when two different spec names map to the same identifier.
 *
 * @param {Iterable<string>} names - Original spec names.
 * @param {(name: string) => string} map - The mapping applied to each.
 * @param {string} what - What the names are, for the error ("schema names").
 * @throws {Error} Listing both originals and the identifier they share.
 */
export function assertNoCollision(names, map, what) {
    const seen = new Map();
    for (const name of names) {
        const id = map(name);
        const other = seen.get(id);
        if (other !== undefined && other !== name) {
            throw new Error(
                `OpenAPI ${what} ${JSON.stringify(other)} and ${JSON.stringify(name)} both map to the TypeScript identifier "${id}". Rename one of them in the spec.`,
            );
        }
        seen.set(id, name);
    }
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
 * is matched by the spec's original name against the declared path parameters
 * and becomes `${identifier}`, the variable that parameter was mapped to
 * (`{user-id}` → `${userId}`). A path without placeholders is emitted as a JSON
 * string literal.
 *
 * @param {string} path - The OpenAPI path key ("/users/{user-id}").
 * @param {Map<string, string>} declared - Original name → identifier of each of
 *   the operation's `in: "path"` params.
 * @returns {string} A TypeScript expression evaluating to the URL.
 * @throws {Error} When a placeholder is not a declared path parameter — there is
 *   no variable it could safely map to.
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
        out += templateText(path.slice(last, match.index)) + "${" + declared.get(name) + "}";
        last = match.index + match[0].length;
    }
    out += templateText(path.slice(last));
    return "`" + out + "`";
}
