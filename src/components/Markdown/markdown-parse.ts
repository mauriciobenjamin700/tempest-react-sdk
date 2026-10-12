/**
 * @tempest-limits file-lines, function-lines — a Markdown block parser is a state
 * machine over line kinds: paragraph, heading, fence, list, quote, table and
 * thematic break each need to see the lines around them to know where they end.
 * parseBlocks is that loop, and cutting it into per-kind functions would hand each
 * one the same lookahead cursor.
 */
// A small Markdown parser for the subset an app actually renders from untrusted
// text: comments, ticket bodies, release notes, a product description.
//
// It produces a node tree, never an HTML string, and the renderer turns that into
// React elements. No `dangerouslySetInnerHTML` exists anywhere in this component —
// which is the property that makes rendering somebody else's Markdown safe, and it
// is structural rather than a promise about escaping.
//
// Raw HTML in the input is therefore not "sanitized", it is **text**: `<script>` in
// a comment renders as the four characters somebody typed. That is the whole point,
// and it is also the documented limit — this is not a CommonMark implementation and
// does not try to be.

import { safeImageUrl, safeLinkUrl } from "@/utils/safe-url";

/** Inline content. */
export type MarkdownInline =
    | { type: "text"; value: string }
    | { type: "strong"; children: MarkdownInline[] }
    | { type: "em"; children: MarkdownInline[] }
    | { type: "del"; children: MarkdownInline[] }
    | { type: "code"; value: string }
    | { type: "link"; href: string; children: MarkdownInline[] }
    | { type: "image"; src: string; alt: string }
    | { type: "break" };

/** Column alignment of a table, from the delimiter row. */
export type MarkdownAlign = "left" | "center" | "right" | null;

/** Block content. */
export type MarkdownBlock =
    | { type: "heading"; level: number; children: MarkdownInline[] }
    | { type: "paragraph"; children: MarkdownInline[] }
    | { type: "code"; language: string | null; value: string }
    | { type: "quote"; children: MarkdownBlock[] }
    | { type: "list"; ordered: boolean; start: number; items: MarkdownBlock[][] }
    | {
          type: "table";
          align: MarkdownAlign[];
          head: MarkdownInline[][];
          rows: MarkdownInline[][][];
      }
    | { type: "rule" };

/**
 * A fence opener, matched against the line **after** `trimEnd()`.
 *
 * The trailing `\s*` lives in the `trimEnd()` rather than in the pattern: with it,
 * `\s*([\w+-]*)\s*$` is two whitespace quantifiers separated by one that may be
 * empty, and a fence followed by 20 000 spaces and a stray `!` took 0.36 s (#437).
 */
const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+-]*)$/;
/**
 * The opening marker of an ATX heading. The text and the optional closing `#` run
 * are cut by {@link matchHeading} with string operations, not by this pattern.
 */
const HEADING_OPEN = /^\s{0,3}(#{1,6})\s+/;
const RULE = /^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
/**
 * The opener of a list item: indentation, marker and the whitespace that
 * separates the marker from the content.
 *
 * The content is sliced off with a string operation rather than captured,
 * because it may not hold U+2028/U+2029. Those are line terminators the old
 * `(.*)$` could not cross, so a line with one after the marker was a paragraph
 * and has to stay one. Capturing the content with a regex that stops at them (a
 * `[^\u2028\u2029]*`) would put the separator and the content back to racing for
 * a run of spaces — quadratic, 3.6 s for a bullet padded with 80 000 spaces
 * (#478). Matching only the opener and slicing sidesteps that entirely.
 *
 * The separator is `[^\S\n\r]`: every whitespace character except CR and LF,
 * which a line never contains. That keeps a separator a person pastes from Word
 * or Docs — NBSP, a form feed, a leading BOM — reading as a list, exactly as the
 * old `\s+` did, instead of silently turning the line into a paragraph.
 */
const BULLET_OPENER = /^([^\S\n\r]*)([-*+])[^\S\n\r]+/;
const ORDERED_OPENER = /^([^\S\n\r]*)(\d{1,9})[.)][^\S\n\r]+/;

/** A list item's opener: how far it is indented, its marker and its content. */
interface ListOpener {
    indent: string;
    marker: string;
    content: string;
}

/**
 * Read a list item's opener, or `null` when the line is not one.
 *
 * A line whose content holds U+2028/U+2029 is not a list item: the old `(.*)$`
 * stopped at the separator, never reached `$`, and left the line a paragraph,
 * and {@link parseMarkdown} still splits only on `\n` and `\r`. Keeping that
 * here is what lets the opener stay a plain pattern with no `.*` to race.
 *
 * @param pattern - {@link BULLET_OPENER} or {@link ORDERED_OPENER}.
 * @param line - One source line.
 * @returns The opener, or `null` when the line is not a list item.
 */
function matchListOpener(pattern: RegExp, line: string): ListOpener | null {
    const match = pattern.exec(line);
    if (!match) return null;
    const content = line.slice(match[0].length);
    if (content.includes("\u2028") || content.includes("\u2029")) return null;
    return { indent: match[1], marker: match[2], content };
}

/** {@link matchListOpener} for a bullet. */
function matchBullet(line: string): ListOpener | null {
    return matchListOpener(BULLET_OPENER, line);
}

/** {@link matchListOpener} for an ordered marker. */
function matchOrdered(line: string): ListOpener | null {
    return matchListOpener(ORDERED_OPENER, line);
}
/**
 * A table's delimiter row, matched against the line **after** `trimEnd()`.
 *
 * The `|` is required somewhere in the line, and that is what tells a one-column
 * table (`| --- |`) apart from a thematic break (`---`) — a single column is a
 * legitimate table, and the first version of this regex demanded two. The trailing
 * whitespace is trimmed before the test for the same reason as {@link FENCE}: a
 * `\s*\|?\s*$` tail backtracked quadratically on `- |` plus 50 000 spaces (#437).
 */
const TABLE_DELIMITER = /^\s{0,3}\|[\s|:-]*$|^\s{0,3}:?-+:?(\s*\|\s*:?-+:?)+\s*\|?$/;

/**
 * How deep quotes and lists may nest before the rest is read as a paragraph.
 *
 * Each level is one recursive {@link parseBlocks} call and one nested element in
 * the render, so `"- ".repeat(20000)` used to throw `RangeError: Maximum call stack
 * size exceeded` out of the component (#437). Real documents stop at a handful of
 * levels; past this cap the words are kept, only the nesting is dropped.
 */
const MAX_NESTING_DEPTH = 32;

/**
 * Match an ATX heading in linear time.
 *
 * The regex this replaces, `/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/`, let a lazy `.*?`
 * and two `\s*` race for the same run of spaces: `"# a" + " ".repeat(4000) + "b"`
 * took about 4.7 s, cubic in the run (#437). Only the opening marker is a regex
 * now. The text is the rest of the line minus the longest suffix shaped like
 * `\s*#*\s*` — exactly what the lazy group left behind, so `# título #`,
 * `# título#` and `# #` read as before.
 *
 * @param line - One source line.
 * @returns The level and raw text, or `null` when the line is not a heading.
 */
function matchHeading(line: string): { level: number; text: string } | null {
    const open = HEADING_OPEN.exec(line);
    if (!open) return null;
    let text = line.slice(open[0].length).trimEnd();
    let end = text.length;
    while (end > 0 && text[end - 1] === "#") end -= 1;
    text = text.slice(0, end).trimEnd();
    return { level: open[1].length, text };
}

/**
 * Whether a paragraph line ends in a hard break: two or more trailing spaces.
 *
 * `/ {2,}$/` was quadratic on a line with a long inner run of spaces — it retried
 * the run from every space and failed at the next word each time (0.57 s for
 * 50 000 spaces, #437).
 */
function endsWithHardBreak(line: string): boolean {
    return line.endsWith("  ");
}

/**
 * Parse a Markdown document into blocks.
 *
 * @param source - Raw Markdown.
 * @returns Block nodes in document order.
 */
export function parseMarkdown(source: string): MarkdownBlock[] {
    const lines = source.replace(/\r\n?/g, "\n").split("\n");
    return parseBlocks(lines, 0);
}

/**
 * Parse a run of lines into blocks.
 *
 * @param lines - The lines of this container.
 * @param depth - How many quotes and lists enclose them. At
 *   {@link MAX_NESTING_DEPTH} the lines become one paragraph instead of more
 *   containers, so a hostile document cannot exhaust the stack.
 * @returns The blocks.
 */
function parseBlocks(lines: string[], depth: number): MarkdownBlock[] {
    if (depth >= MAX_NESTING_DEPTH) {
        const source = lines
            .map((line) => line.trim())
            .filter(Boolean)
            .join("\n");
        return source ? [{ type: "paragraph", children: parseInline(source) }] : [];
    }
    const blocks: MarkdownBlock[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.trim() === "") {
            i += 1;
            continue;
        }

        const fence = FENCE.exec(line.trimEnd());
        if (fence) {
            const marker = fence[1][0];
            const body: string[] = [];
            i += 1;
            while (i < lines.length && !new RegExp(`^\\s{0,3}${marker}{3,}\\s*$`).test(lines[i])) {
                body.push(lines[i]);
                i += 1;
            }
            // An unterminated fence still yields a code block: the alternative is to
            // render the rest of the document as prose full of backticks.
            i += 1;
            blocks.push({ type: "code", language: fence[2] || null, value: body.join("\n") });
            continue;
        }

        const heading = matchHeading(line);
        if (heading) {
            blocks.push({
                type: "heading",
                level: heading.level,
                children: parseInline(heading.text),
            });
            i += 1;
            continue;
        }

        if (RULE.test(line)) {
            blocks.push({ type: "rule" });
            i += 1;
            continue;
        }

        if (QUOTE.test(line)) {
            const inner: string[] = [];
            while (i < lines.length) {
                const match = QUOTE.exec(lines[i]);
                if (match) {
                    inner.push(match[1]);
                    i += 1;
                    continue;
                }
                // A blank line ends the quote; a plain line continues it (lazy
                // continuation), which is how people actually write quotes.
                if (lines[i].trim() === "") break;
                inner.push(lines[i]);
                i += 1;
            }
            blocks.push({ type: "quote", children: parseBlocks(inner, depth + 1) });
            continue;
        }

        if (matchBullet(line) || matchOrdered(line)) {
            const [list, next] = parseList(lines, i, depth);
            blocks.push(list);
            i = next;
            continue;
        }

        if (
            i + 1 < lines.length &&
            line.includes("|") &&
            TABLE_DELIMITER.test(lines[i + 1].trimEnd())
        ) {
            const [table, next] = parseTable(lines, i);
            blocks.push(table);
            i = next;
            continue;
        }

        const paragraph: string[] = [];
        const hardBreaks: boolean[] = [];
        while (i < lines.length && lines[i].trim() !== "") {
            const current = lines[i];
            if (
                matchHeading(current) ||
                RULE.test(current) ||
                FENCE.test(current.trimEnd()) ||
                QUOTE.test(current) ||
                matchBullet(current) ||
                matchOrdered(current)
            ) {
                break;
            }
            paragraph.push(current.trim());
            hardBreaks.push(endsWithHardBreak(current));
            i += 1;
        }
        if (paragraph.length > 0) {
            blocks.push({
                type: "paragraph",
                children: parseInline(joinParagraph(paragraph, hardBreaks)),
            });
        }
    }

    return blocks;
}

/**
 * Re-join the lines of a paragraph, keeping the two-space hard break.
 *
 * Every line is trimmed before it is parsed, because leading indentation is not
 * content and a trailing space is invisible noise in almost every line. The one
 * exception is the CommonMark hard break: two or more trailing spaces mean
 * "break the line here", so trimming first would delete the only mark that says
 * so and the `  \n` inline rule could never match. The flag is recorded before
 * the trim and the marker put back here, on every line but the last — a break
 * after the final line of a paragraph would break into nothing.
 *
 * @param lines - The trimmed lines, in order.
 * @param hardBreaks - Whether each line ended in two or more spaces.
 * @returns The paragraph source the inline parser reads.
 */
function joinParagraph(lines: readonly string[], hardBreaks: readonly boolean[]): string {
    return lines
        .map((line, index) => (hardBreaks[index] && index < lines.length - 1 ? `${line}  ` : line))
        .join("\n");
}

/**
 * Parse a list, including nested lists and multi-line items.
 *
 * Nesting is decided by indentation relative to the **first** item's marker, so a
 * list indented inside a quote or another list still reads correctly.
 *
 * @param lines - The lines of the enclosing container.
 * @param start - Index of the first item's line.
 * @param depth - Nesting depth of the enclosing container.
 * @returns The list node and the index of the first line after it.
 */
function parseList(lines: string[], start: number, depth: number): [MarkdownBlock, number] {
    const bulletStart = matchBullet(lines[start]);
    const orderedStart = matchOrdered(lines[start]);
    // The two markers are mutually exclusive — `-*+` versus digits — so whichever
    // matched decides the list kind.
    const ordered = orderedStart !== null;
    const first = orderedStart ?? bulletStart;
    const baseIndent = first?.indent.length ?? 0;
    const startNumber = ordered ? Number(orderedStart?.marker ?? 1) : 1;

    const items: MarkdownBlock[][] = [];
    let buffer: string[] = [];
    let i = start;

    const flush = (): void => {
        if (buffer.length === 0) return;
        items.push(parseBlocks(buffer, depth + 1));
        buffer = [];
    };

    while (i < lines.length) {
        const line = lines[i];
        if (line.trim() === "") {
            // A single blank line inside a list is a loose item, not the end. Two in
            // a row end it, which is what a blank-then-paragraph document means.
            if (i + 1 < lines.length && lines[i + 1].trim() !== "") {
                buffer.push("");
                i += 1;
                continue;
            }
            break;
        }
        const bullet = matchBullet(line);
        const numbered = matchOrdered(line);
        const match = bullet ?? numbered;

        if (match && match.indent.length <= baseIndent) {
            const sameKind = ordered ? Boolean(numbered) : Boolean(bullet);
            if (!sameKind) break;
            flush();
            buffer.push(match.content);
            i += 1;
            continue;
        }
        if (match) {
            // Deeper marker: keep the indentation so the recursive call sees a list.
            buffer.push(line.slice(baseIndent));
            i += 1;
            continue;
        }
        if (line.search(/\S/) > baseIndent) {
            buffer.push(line.trim());
            i += 1;
            continue;
        }
        break;
    }
    flush();

    return [{ type: "list", ordered, start: startNumber, items }, i];
}

/** Split a table row on unescaped pipes. */
function splitRow(line: string): string[] {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    const cells: string[] = [];
    let current = "";
    for (let i = 0; i < trimmed.length; i += 1) {
        if (trimmed[i] === "\\" && trimmed[i + 1] === "|") {
            current += "|";
            i += 1;
            continue;
        }
        if (trimmed[i] === "|") {
            cells.push(current);
            current = "";
            continue;
        }
        current += trimmed[i];
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
}

/**
 * Parse a GFM pipe table.
 *
 * @returns The table node and the index of the first line after it.
 */
function parseTable(lines: string[], start: number): [MarkdownBlock, number] {
    const head = splitRow(lines[start]);
    const align: MarkdownAlign[] = splitRow(lines[start + 1]).map((cell) => {
        const left = cell.startsWith(":");
        const right = cell.endsWith(":");
        if (left && right) return "center";
        if (right) return "right";
        if (left) return "left";
        return null;
    });

    const rows: MarkdownInline[][][] = [];
    let i = start + 2;
    while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|")) {
        rows.push(splitRow(lines[i]).map(parseInline));
        i += 1;
    }

    return [{ type: "table", align, head: head.map(parseInline), rows }, i];
}

/**
 * The precheck a rule needs before its pattern may run, keyed by the opener the
 * pattern starts with.
 *
 * `link` covers links and images, whose label ends at the first `]`; `autolink`
 * covers `<scheme:...>`, which ends at the first `>` or whitespace. Without the
 * precheck each pattern scanned to the end of the text from every opener, and
 * `"[".repeat(50000)` took 0.6 s (#437).
 */
type InlineGuard = { kind: "link"; opener: "[" | "![" } | { kind: "autolink"; opener: "<" };

/** Inline delimiters, longest marker first so `**` wins over `*`. */
const INLINE_RULES: Array<{
    first: string;
    pattern: RegExp;
    guard?: InlineGuard;
    build: (match: RegExpExecArray) => MarkdownInline | null;
}> = [
    {
        guard: { kind: "link", opener: "![" },
        first: "!",
        pattern: /^!\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/,
        build: (match) => {
            const src = safeImageUrl(match[2]);
            return src ? { type: "image", src, alt: match[1] } : { type: "text", value: match[1] };
        },
    },
    {
        guard: { kind: "link", opener: "[" },
        first: "[",
        pattern: /^\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/,
        build: (match) => {
            const href = safeLinkUrl(match[2]);
            const children = parseInline(match[1]);
            // A rejected URL keeps the label as plain text: dropping the text too
            // would silently delete words somebody wrote.
            return href ? { type: "link", href, children } : { type: "text", value: match[1] };
        },
    },
    { first: "`", pattern: /^`([^`]+)`/, build: (match) => ({ type: "code", value: match[1] }) },
    {
        first: "*",
        pattern: /^\*\*([\s\S]+?)\*\*/,
        build: (match) => ({ type: "strong", children: parseInline(match[1]) }),
    },
    {
        first: "_",
        pattern: /^__([\s\S]+?)__/,
        build: (match) => ({ type: "strong", children: parseInline(match[1]) }),
    },
    {
        first: "~",
        pattern: /^~~([\s\S]+?)~~/,
        build: (match) => ({ type: "del", children: parseInline(match[1]) }),
    },
    {
        first: "*",
        pattern: /^\*([^*\n]+)\*/,
        build: (match) => ({ type: "em", children: parseInline(match[1]) }),
    },
    {
        first: "_",
        pattern: /^_([^_\n]+)_/,
        build: (match) => ({ type: "em", children: parseInline(match[1]) }),
    },
    {
        guard: { kind: "autolink", opener: "<" },
        first: "<",
        pattern: /^<((?:https?:\/\/|mailto:)[^>\s]+)>/,
        build: (match) => {
            const href = safeLinkUrl(match[1]);
            return href
                ? { type: "link", href, children: [{ type: "text", value: match[1] }] }
                : { type: "text", value: match[1] };
        },
    },
    { first: "\\", pattern: /^\\\n/, build: () => ({ type: "break" }) },
];

/** Characters some inline rule can start with; any other character is text. */
const INLINE_FIRST = new Set(INLINE_RULES.map((rule) => rule.first));

/**
 * Parse inline Markdown.
 *
 * A backslash escapes the next character, so `\*not italic\*` renders with the
 * asterisks. Anything that matches no rule is text — an unclosed `**` is two
 * asterisks, not a bold run to the end of the paragraph.
 *
 * The parse is linear in the text, which matters because the text is somebody
 * else's (#437):
 *
 * - A run of spaces is consumed whole: it is a hard break when two or more of them
 *   end at a newline, and text otherwise. Matching `^ {2,}\n` from every space
 *   rescanned the run each time.
 * - A link or image label ends at the first `]` after the opener, so every opener
 *   before the same `]` shares the same `](...)` tail. The position of that `]` is
 *   cached, an opener whose `]` is not followed by `(` is skipped without running
 *   the pattern, and once a tail has failed no later opener retries it.
 * - An autolink ends at the first `>` or whitespace, also cached; when that stop
 *   is not `>` the pattern cannot match and is not run.
 * - A rule runs only at its own first character, so a run of `[` costs one set
 *   lookup per character instead of every pattern in the table.
 *
 * @param source - One block's text.
 * @returns Inline nodes.
 */
export function parseInline(source: string): MarkdownInline[] {
    const nodes: MarkdownInline[] = [];
    let text = "";
    let i = 0;

    let bracketAt = -1;
    let deadTailAt = -1;
    let stopAt = -1;
    const stops = /[>\s]/g;

    const flush = (): void => {
        if (text) nodes.push({ type: "text", value: text });
        text = "";
    };

    const closingBracket = (from: number): number => {
        if (bracketAt < from) {
            const found = source.indexOf("]", from);
            bracketAt = found === -1 ? source.length : found;
        }
        return bracketAt;
    };

    const autolinkStop = (from: number): number => {
        if (stopAt < from) {
            stops.lastIndex = from;
            stopAt = stops.exec(source)?.index ?? source.length;
        }
        return stopAt;
    };

    const allowed = (guard: InlineGuard | undefined): boolean => {
        if (!guard) return true;
        if (!source.startsWith(guard.opener, i)) return false;
        if (guard.kind === "autolink") return source[autolinkStop(i + 1)] === ">";
        const close = closingBracket(i + guard.opener.length);
        return source[close + 1] === "(" && close !== deadTailAt;
    };

    while (i < source.length) {
        if (source[i] === "\\" && i + 1 < source.length && source[i + 1] !== "\n") {
            text += source[i + 1];
            i += 2;
            continue;
        }

        if (source[i] === " ") {
            let end = i;
            while (source[end] === " ") end += 1;
            if (end - i >= 2 && source[end] === "\n") {
                flush();
                nodes.push({ type: "break" });
                i = end + 1;
            } else {
                text += source.slice(i, end);
                i = end;
            }
            continue;
        }

        if (!INLINE_FIRST.has(source[i])) {
            text += source[i];
            i += 1;
            continue;
        }

        const rest = source.slice(i);
        let matched = false;
        for (const rule of INLINE_RULES) {
            if (rule.first !== source[i] || !allowed(rule.guard)) continue;
            const match = rule.pattern.exec(rest);
            if (!match) {
                if (rule.guard?.kind === "link") {
                    deadTailAt = closingBracket(i + rule.guard.opener.length);
                }
                continue;
            }
            const node = rule.build(match);
            if (!node) continue;
            flush();
            nodes.push(node);
            i += match[0].length;
            matched = true;
            break;
        }
        if (matched) continue;

        text += source[i];
        i += 1;
    }

    flush();
    return nodes;
}
