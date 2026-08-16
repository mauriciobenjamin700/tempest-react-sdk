/**
 * Guard against dead heading anchors in the documentation.
 *
 * This exists because `mkdocs build --strict` does **not** catch them. A link to
 * a heading that no longer exists is reported at `INFO` level:
 *
 * ```text
 * INFO - Doc file 'http.md' contains a link '#retry--backoff-exponencial',
 *        but there is no such anchor on this page.
 * ```
 *
 * `--strict` promotes `WARNING` to an error, not `INFO`, so the docs build stays
 * green while the link silently goes nowhere. Two of those had been shipping in
 * `http.md` / `http.en.md`. The only other way to see them is to read the build
 * log line by line, which is exactly the kind of check a test should own.
 *
 * What it verifies, over **both** languages (unlike `docs-guard.test.ts`, which
 * compiles PT code blocks only — anchors are language-specific because the
 * headings they point at are translated):
 *
 * 1. Same-page links (`](#anchor)`) resolve to a heading on that page.
 * 2. Cross-page links (`](other.md#anchor)`) resolve to a heading on the page
 *    they name — and that the page itself exists.
 *
 * Fenced code blocks are stripped before anything is parsed. Otherwise a `#`
 * comment inside a `bash` block registers as a heading, and a URL fragment in a
 * sample would register as a link to check.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const DOCS = join(ROOT, "docs");

/**
 * Slug for a heading, matching Python-Markdown's `toc` extension.
 *
 * Ported from Python-Markdown's `markdown.extensions.toc.slugify` (the default
 * used when `mkdocs.yml` sets no `toc.slugify`, which is this repo's case):
 *
 * ```python
 * value = unicodedata.normalize('NFKD', value)
 * value = value.encode('ascii', 'ignore').decode('ascii')
 * value = re.sub(r'[^\w\s-]', '', value).strip().lower()
 * return re.sub(r'[{}\s]+'.format(separator), separator, value)
 * ```
 *
 * The steps map one-to-one: NFKD-normalise and drop non-ASCII (so `três` →
 * `tres` and an em dash vanishes), delete everything that is not a word
 * character / whitespace / hyphen (which is what removes the backticks around
 * an inline-code heading), lowercase, then collapse every run of whitespace and
 * hyphens into a single `-`.
 *
 * Verified against the built HTML: `` ## `retry` — backoff exponencial ``
 * yields `retry-backoff-exponencial`, and its EN mirror
 * `retry-exponential-backoff`.
 *
 * @param text - Heading text with inline markdown already reduced to plain text.
 * @returns The anchor id MkDocs will emit for that heading.
 */
function slugify(text: string): string {
    const ascii = [...text.normalize("NFKD")].filter((char) => char.charCodeAt(0) < 128).join("");
    const cleaned = ascii
        .replace(/[^\w\s-]/g, "")
        .trim()
        .toLowerCase();
    return cleaned.replace(/[-\s]+/g, "-");
}

/**
 * Reduce a heading's inline markdown to the plain text the renderer produces,
 * so the slug is computed over what the reader sees.
 *
 * Only link syntax needs real handling: `[Foo](bar.md)` renders as `Foo`, but
 * slugifying the raw form would fold the URL into the anchor. Backticks,
 * asterisks and underscores need no step of their own — `slugify` drops them as
 * non-word characters.
 *
 * @param heading - Raw heading text, without the leading `#`s.
 * @returns The rendered text of the heading.
 */
function headingText(heading: string): string {
    return heading.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
}

/**
 * Markdown source with fenced code blocks blanked out.
 *
 * The fence is replaced by the same **number of blank lines** rather than
 * deleted, so line numbers still match the file on disk — a report that points
 * at the wrong line is worse than no line at all.
 *
 * @param source - Raw markdown of the page.
 * @returns The same text with every fenced block emptied.
 */
function stripFences(source: string): string {
    return source.replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[ \t]*$/gm, (block) =>
        "\n".repeat(block.split("\n").length - 1),
    );
}

/**
 * Every anchor id a page exposes, in document order.
 *
 * Handles both id sources: an explicit `attr_list` id (`## Title {#custom}`)
 * wins over the derived slug, and a slug that repeats gets the `_1`, `_2`, …
 * suffix Python-Markdown appends to keep ids unique.
 *
 * @param source - Raw markdown of the page.
 * @returns The set of ids reachable as `#fragment` on that page.
 */
function anchorsOf(source: string): Set<string> {
    const ids = new Set<string>();
    const seen = new Map<string, number>();

    for (const line of stripFences(source).split("\n")) {
        const match = /^#{1,6}\s+(.*)$/.exec(line);
        if (!match) continue;

        let text = match[1].trim();
        const explicit = /\{[ ]*#([^}\s]+)[^}]*\}\s*$/.exec(text);
        if (explicit) {
            ids.add(explicit[1]);
            continue;
        }

        text = text.replace(/\{[^}]*\}\s*$/, "");
        const base = slugify(headingText(text));
        if (!base) continue;

        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        ids.add(count === 0 ? base : `${base}_${count}`);
    }

    return ids;
}

/** Every markdown file under `docs/`, as repo-relative paths. */
function docPages(dir: string = DOCS): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...docPages(full));
        else if (entry.name.endsWith(".md")) out.push(full);
    }
    return out;
}

interface AnchorLink {
    page: string;
    target: string;
    anchor: string;
    line: number;
}

/**
 * Resolve a link target the way `mkdocs-static-i18n` does.
 *
 * An EN page links to its siblings by their **base** name — `[…](theme.md)` in
 * `styles.en.md` — and the plugin rewrites it to the EN mirror at build time.
 * Verified in the built HTML: `/en/styles/` emits `href="../theme/#…"`, which
 * resolves to `/en/theme/`, not the PT page. So an anchor written in English is
 * correct there, and comparing it against the PT headings would be a false
 * positive.
 *
 * @param from - Absolute path of the page holding the link.
 * @param target - Absolute path the link literally names.
 * @param known - Every page that exists, used to confirm a mirror is present.
 * @returns The page the link actually lands on.
 */
function resolveTarget(from: string, target: string, known: Set<string>): string {
    if (!from.endsWith(".en.md")) return target;
    if (!target.endsWith(".md") || target.endsWith(".en.md")) return target;

    const mirror = `${target.slice(0, -".md".length)}.en.md`;
    return known.has(mirror) ? mirror : target;
}

/**
 * Anchor-bearing links on a page, with the file each one points at resolved.
 *
 * External links are skipped: only in-repo `.md` targets and same-page
 * fragments are ours to keep alive.
 *
 * @param page - Absolute path of the page being read.
 * @param source - Raw markdown of that page.
 * @returns One entry per anchor link found.
 */
function anchorLinks(page: string, source: string): AnchorLink[] {
    const found: AnchorLink[] = [];
    const lines = stripFences(source).split("\n");

    lines.forEach((line, index) => {
        const pattern = /\]\(([^)\s]*)#([^)\s]+)\)/g;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(line)) !== null) {
            const [, target, anchor] = match;
            if (/^[a-z]+:/i.test(target)) continue;
            found.push({
                page,
                target: target === "" ? page : resolve(dirname(page), target),
                anchor,
                line: index + 1,
            });
        }
    });

    return found;
}

describe("docs anchors", () => {
    const pages = docPages();
    const known = new Set(pages);
    const anchorsByPage = new Map(pages.map((p) => [p, anchorsOf(readFileSync(p, "utf8"))]));

    it("resolves every in-repo heading anchor", () => {
        const broken: string[] = [];

        for (const page of pages) {
            for (const link of anchorLinks(page, readFileSync(page, "utf8"))) {
                if (!link.target.endsWith(".md")) continue;

                const where = `${relative(ROOT, page)}:${link.line}`;
                const resolved = resolveTarget(page, link.target, known);
                const targets = anchorsByPage.get(resolved);

                if (!targets) {
                    broken.push(`${where} → missing page ${relative(ROOT, resolved)}`);
                    continue;
                }
                if (!targets.has(link.anchor)) {
                    const near = [...targets]
                        .filter((id) => id.includes(link.anchor.split("-")[0]))
                        .slice(0, 3);
                    const hint = near.length ? ` (did you mean: ${near.join(", ")}?)` : "";
                    broken.push(
                        `${where} → #${link.anchor} not on ${relative(ROOT, resolved)}${hint}`,
                    );
                }
            }
        }

        expect(broken, `Dead documentation anchors:\n${broken.join("\n")}`).toEqual([]);
    });

    it("computes slugs the way Python-Markdown does", () => {
        expect(slugify("`retry` — backoff exponencial")).toBe("retry-backoff-exponencial");
        expect(slugify("`retry` — exponential backoff")).toBe("retry-exponential-backoff");
        expect(slugify("2. O service worker: três cenários")).toBe(
            "2-o-service-worker-tres-cenarios",
        );
        expect(slugify("`usePoll` — polling com guarda de overlap")).toBe(
            "usepoll-polling-com-guarda-de-overlap",
        );
    });
});
