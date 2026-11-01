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
 * - URL template literal → {@link urlTemplate};
 * - the developer's terminal → {@link terminalText}.
 *
 * One more check covers the text that becomes a URL rather than being escaped
 * into one: {@link assertSafePath}.
 */

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * Words that parse as an identifier but cannot name a type alias, a `const` or a
 * parameter in a generated module. Ported from the ECMAScript reserved words,
 * `eval` and `arguments` (which strict mode — every class body — forbids as a
 * binding), and the TypeScript predefined type names that `type X = ...`
 * rejects.
 */
export const RESERVED_WORDS = new Set([
    "any",
    "arguments",
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
    "eval",
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
 * Throw when two entries map to the same identifier.
 *
 * Compared per entry, not per name: a path parameter literally called `body`
 * maps to itself and still collides with the `body` argument, which a
 * name-versus-mapped-name comparison would miss.
 *
 * @param {Iterable<[string, string]>} entries - `[label, identifier]` pairs; the
 *   label is the spec's original name, or a description of a generated name.
 * @param {string} what - What the names are, for the error ("schema names").
 * @throws {Error} Listing both labels and the identifier they share.
 */
export function assertNoCollision(entries, what) {
    const seen = new Map();
    for (const [label, id] of entries) {
        if (seen.has(id)) {
            throw new Error(
                `OpenAPI ${what} ${JSON.stringify(seen.get(id))} and ${JSON.stringify(label)} both map to the TypeScript identifier "${id}". Rename one of them in the spec.`,
            );
        }
        seen.set(id, label);
    }
}

/**
 * C0 and C1 control characters except tab and line feed: everything a terminal
 * may read as the start of an escape sequence (`ESC`, the 8-bit `CSI` and
 * `OSC`), plus `CR` and backspace, which rewrite what is already on the line.
 */
const TERMINAL_CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/**
 * Make spec text safe to print to the developer's terminal.
 *
 * `tempest gen api` echoes the spec's tag names, and its errors quote spec
 * names. `JSON.stringify` escapes the C0 range but leaves the C1 range raw, so
 * neither path was safe on its own: a tag carrying `ESC ] 0 ; ... BEL` retitled
 * the terminal window, and an OSC 8 sequence printed a clickable link whose
 * target the developer never saw (#533). Every control character a terminal
 * acts on is dropped; tab and line feed are kept so a multi-line error still
 * reads as one.
 *
 * @param {unknown} text - Text that may come from the spec.
 * @returns {string} The text without terminal control characters.
 */
export function terminalText(text) {
    return String(text).replace(TERMINAL_CONTROLS, "");
}

/**
 * Make spec text safe inside a `/** ... *\/` block comment.
 *
 * Line terminators collapse to a space, so the text cannot start a new line of
 * the comment, and every `*\/` is broken as `*\\/` so it cannot close it.
 * Terminal control characters are dropped too ({@link terminalText}): they are
 * not code, but printing the generated file with `cat` would replay them.
 *
 * @param {unknown} text - The spec text (tag, summary, path).
 * @returns {string} The neutralized single-line text.
 */
export function commentText(text) {
    return terminalText(String(text).replace(/[\r\n\u2028\u2029]+/g, " ")).replace(/\*\//g, "*\\/");
}

/**
 * Throw when an OpenAPI path key would not stay a path under the client's
 * `baseURL`.
 *
 * The key becomes the URL the generated method requests, and the client passes
 * an absolute URL through untouched: a key `"https://other.example/x"` made the
 * method call another origin \u2014 the Bearer is withheld there, but the body and,
 * with `credentials: "include"`, the cookies were not. A static `.` or `..`
 * segment (`"/../x"`) climbs out of the `baseURL`'s path prefix once the URL is
 * normalized. OpenAPI requires a path key to start with `/` and to be relative
 * to the server URL, so neither is a valid spec; both are refused before any
 * file is written instead of becoming a call the developer never reads. `\` is
 * a separator and `%2e` a dot here because the WHATWG URL parser normalizes them
 * that way.
 *
 * @param {unknown} path - The key from `paths`.
 * @throws {Error} When the key does not start with `/` or has a dot segment.
 */
export function assertSafePath(path) {
    if (typeof path !== "string" || !path.startsWith("/")) {
        throw new Error(
            `OpenAPI path ${JSON.stringify(path)} does not start with "/". A path key is relative to the server URL; an absolute URL here would send the request to another origin.`,
        );
    }
    const dotSegment = path
        .replace(/[?#][\s\S]*$/, "")
        .split(/[/\\]/)
        .some((segment) => /^(?:\.|%2e){1,2}$/i.test(segment));
    if (dotSegment) {
        throw new Error(
            `OpenAPI path ${JSON.stringify(path)} has a "." or ".." segment, which leaves the baseURL's path once the URL is normalized. Rename the path in the spec.`,
        );
    }
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
 * and becomes `${encodeIdSegment(identifier)}`, the variable that parameter was
 * mapped to passed through the SDK's segment encoder (`{user-id}` →
 * `${encodeIdSegment(userId)}`). A path without placeholders is emitted as a
 * JSON string literal.
 *
 * The encoder is what keeps a runtime value inside its own segment: interpolated
 * raw, `"../../account"` turned `DELETE /api/comments/{id}` into
 * `DELETE /account` carrying the Bearer, and `"7?role=admin"` injected a query
 * string (#499 — the class #438 closed for the data provider). Encoded, `/`, `?`,
 * `#` and `%` stay in the segment, and `null`, `undefined`, `""`, `"."` and
 * `".."` throw before the request is built.
 *
 * @param {string} path - The OpenAPI path key ("/users/{user-id}").
 * @param {Map<string, string>} declared - Original name → argument expression of
 *   each of the operation's `in: "path"` params: the identifier, or the
 *   identifier with a type assertion when its type is wider than
 *   `encodeIdSegment` accepts.
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
        out +=
            templateText(path.slice(last, match.index)) +
            "${encodeIdSegment(" +
            declared.get(name) +
            ")}";
        last = match.index + match[0].length;
    }
    out += templateText(path.slice(last));
    return "`" + out + "`";
}
