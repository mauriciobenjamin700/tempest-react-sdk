/**
 * Cut the token sheet down to the tokens a set of stylesheets can reach.
 *
 * Once every component loads its own stylesheet, `tokens.css` stops being a rounding
 * error and becomes the biggest single thing an app downloads: measured on a probe
 * app mounting `Button`, `Card` and `Badge`, the sheet is 2516 B brotli of a 4927 B
 * total. The components read 105 of its 223 tokens, so the other 118 are bytes
 * nothing on the page can consult.
 *
 * The cut is a reachability closure, not a filter: a token's value routinely names
 * another token (`--tempest-primary: var(--tempest-primary-500)`), so keeping only
 * the names a stylesheet mentions literally would keep aliases whose targets were
 * dropped — `var()` would resolve to nothing and the component would render with the
 * property unset, which is worse than shipping the whole sheet.
 */

/** A token block: one selector and the custom properties it declares, in order. */
interface TokenBlock {
    /** The block's selector text, e.g. `:root` or `[data-tempest-theme=dark]`. */
    selector: string;
    /** Declaration name → value, in source order. */
    declarations: Map<string, string>;
}

/**
 * Any custom property being read, not only the `--tempest-*` ones.
 *
 * Deliberately wider than the tokens this cut is about. `tokens.css` also carries
 * the `--lightningcss-light`/`--lightningcss-dark` pair the compiler emits, which
 * nothing reads today — measured: two declarations, zero reads — and which a
 * `--tempest-`-only scan would therefore always drop. That is the right answer right
 * up until one rule uses `light-dark()`, at which point the compiler emits the read
 * and a narrow scan would drop the pair it depends on. Matching every custom
 * property costs nothing (a name the sheet does not declare is discarded) and makes
 * the closure correct for names this file does not know about.
 */
const TOKEN_REFERENCE = /var\(\s*(--[A-Za-z0-9-]+)/g;

/**
 * A token name being assembled at runtime rather than written out.
 *
 * `style={{ color: `var(--tempest-${tone})` }}` names a token no static scan can
 * know, so a cut made without it would drop the one the app is about to read. The
 * caller falls back to the whole sheet when this matches — the same shape as the
 * plugin's own namespace-import fallback, and for the same reason: serve more than
 * asked for rather than less than needed.
 */
const DYNAMIC_TOKEN = /--tempest-[A-Za-z0-9-]*(?:\$\{|["'`]\s*\+|\s*\+\s*["'`])/;

/**
 * Parse a token stylesheet into its blocks.
 *
 * Written against the compiler's own output, which is already valid and flat — every
 * block in `tokens.css` is either a bare selector or one nested inside a single
 * at-rule — so a brace-depth reader is enough and a full parser would not be more
 * correct here.
 *
 * @param css - Contents of `tokens.css`.
 * @returns One entry per block that declares anything.
 */
export function parseTokenBlocks(css: string): TokenBlock[] {
    const blocks: TokenBlock[] = [];
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const declarations = new Map<string, string>();
        for (const declaration of (match[2] ?? "").split(";")) {
            const colon = declaration.indexOf(":");
            if (colon < 0) continue;
            const name = declaration.slice(0, colon).trim();
            if (name) declarations.set(name, declaration.slice(colon + 1).trim());
        }
        if (declarations.size === 0) continue;
        blocks.push({ selector: (match[1] ?? "").trim(), declarations });
    }
    return blocks;
}

/**
 * Every token a body of CSS reaches, following token-to-token references.
 *
 * @param blocks - The parsed token sheet.
 * @param usage - CSS and source text to scan for `var(--tempest-*)`.
 * @returns The reachable token names.
 */
export function reachableTokens(blocks: readonly TokenBlock[], usage: string): Set<string> {
    const declared = new Set<string>();
    for (const block of blocks) for (const name of block.declarations.keys()) declared.add(name);

    const reached = new Set<string>();
    const queue = [...usage.matchAll(TOKEN_REFERENCE)].map((match) => match[1] ?? "");
    while (queue.length > 0) {
        const token = queue.pop() ?? "";
        if (reached.has(token) || !declared.has(token)) continue;
        reached.add(token);
        for (const block of blocks) {
            const value = block.declarations.get(token);
            if (value === undefined) continue;
            for (const match of value.matchAll(TOKEN_REFERENCE)) queue.push(match[1] ?? "");
        }
    }
    return reached;
}

/**
 * Rebuild the token sheet with only the tokens a set of stylesheets reaches.
 *
 * Companion declarations that are not custom properties travel with the block that
 * survives — `color-scheme` is the one, and dropping it would leave the browser
 * painting its own surfaces (scrollbar, `<select>` popup, autofill) in the wrong
 * theme while every `.tempest_*` rule was correct.
 *
 * @param tokensCss - Contents of `tokens.css`.
 * @param usage - The CSS the app will load, plus its own source, scanned for reads.
 * @returns The narrowed sheet, or `null` when a token name is built at runtime and
 *   no static answer is safe.
 */
export function narrowTokens(tokensCss: string, usage: string): string | null {
    if (DYNAMIC_TOKEN.test(usage)) return null;

    const blocks = parseTokenBlocks(tokensCss);
    const reached = reachableTokens(blocks, usage);
    if (reached.size === 0) return null;

    const out: string[] = [];
    for (const block of blocks) {
        const kept = [...block.declarations].filter(
            ([name]) => name.startsWith("--") === false || reached.has(name),
        );
        if (kept.every(([name]) => name.startsWith("--") === false)) continue;
        out.push(`${block.selector}{${kept.map(([name, value]) => `${name}:${value}`).join(";")}}`);
    }
    return out.join("\n");
}
