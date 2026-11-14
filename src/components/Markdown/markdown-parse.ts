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
 * The tail of a link or image, read from the label's closing `]`: the
 * destination and an optional quoted title. Sticky, so it runs at a position of
 * the whole source instead of on a slice.
 */
const LINK_TAIL = /\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/y;

/** An autolink, `<https://…>` or `<mailto:…>`. Sticky, like {@link LINK_TAIL}. */
const AUTOLINK = /<((?:https?:\/\/|mailto:)[^>\s]+)>/y;

/** Characters an atom can start with: code span, link, image, autolink. */
const ATOM_FIRST = new Set(["`", "[", "!", "<"]);

/** Characters an emphasis run is made of. */
const EMPHASIS = new Set(["*", "_", "~"]);

/** A parsed inline construct and the index right after it. */
interface InlineSpan {
    /** The node, or `null` when the source up to `end` is plain text. */
    node: MarkdownInline | null;
    end: number;
}

/** Where an emphasis closer search ended: the closer, or `-1` and where it gave up. */
interface CloserScan {
    close: number;
    stop: number;
}

/**
 * For every index of `source`, the first index at or after it holding a
 * character `matches` accepts, or `source.length` when none does.
 *
 * One backward pass, so every later lookup is O(1) wherever it starts — a cursor
 * that only moves forward would go stale as soon as the emphasis scan looked
 * ahead of the main loop.
 *
 * @param source - The text being parsed.
 * @param matches - Which characters to index.
 * @returns The lookup table, `source.length + 1` long.
 */
function nextIndexTable(source: string, matches: (char: string) => boolean): Int32Array {
    const table = new Int32Array(source.length + 1);
    table[source.length] = source.length;
    for (let index = source.length - 1; index >= 0; index -= 1) {
        table[index] = matches(source[index]) ? index : table[index + 1];
    }
    return table;
}

/**
 * Wrap emphasis content in the node its marker run means.
 *
 * @param marker - `*`, `_` or `~`.
 * @param length - The run length: 1 is italic, 2 bold (strikethrough for `~`),
 *   3 italic around bold.
 * @param children - The parsed content.
 * @returns The emphasis node.
 */
function emphasisNode(marker: string, length: number, children: MarkdownInline[]): MarkdownInline {
    if (marker === "~") return { type: "del", children };
    if (length === 1) return { type: "em", children };
    if (length === 2) return { type: "strong", children };
    return { type: "em", children: [{ type: "strong", children }] };
}

/**
 * Parse inline Markdown.
 *
 * A backslash escapes the next character, so `\*not italic\*` renders with the
 * asterisks. Anything that matches no construct is text — an unclosed `**` is two
 * asterisks, not a bold run to the end of the paragraph.
 *
 * Code spans, links, images and autolinks are **atoms**: read whole wherever they
 * start, and stepped over whole by the search for an emphasis closer. So the
 * content of `**…**`, `*…*`, `_…_` and `~~…~~` goes through this same parser —
 * `**[texto](url)**` is bold around a link — and a marker inside an atom never
 * closes the emphasis around it: the `_` in `_veja [doc](https://x.com/a_b)_` is
 * part of the URL (#599).
 *
 * Emphasis is a run of one marker character. A run of 1 is italic, of 2 bold
 * (strikethrough for `~~`), of 3 italic around bold. The closer is the next run
 * of the same character and the same length, or a run of 3, which closes the
 * outer emphasis and leaves the rest of its markers to the content: `*a **b***`
 * is italic around `a` and bold `b`. A run of another length is stepped over,
 * which is what lets `*a **b** c*` keep its bold inside the italic. Italic does
 * not cross a line break; bold and strikethrough do. A run that finds no closer
 * gives up one marker as text and the rest is tried again, so `**a*` is a literal
 * `*` before italic `a`.
 *
 * The parse is linear in the text, which matters because the text is somebody
 * else's (#437):
 *
 * - A run of spaces is consumed whole: it is a hard break when two or more of them
 *   end at a newline, and text otherwise.
 * - A link or image label ends at the first `]` after the opener, read from a
 *   table built once per call, and the `](…)` tail after a given `]` is matched
 *   once and remembered: every opener before that `]` shares it.
 * - An autolink ends at the first `>` or whitespace, also from a table; when that
 *   stop is not `>` the pattern does not run.
 * - An atom is read once per position and remembered, so the closer search and
 *   the main loop never parse the same link label twice.
 * - A closer search for one marker and length that fails proves no later opener
 *   of the same kind closes either, since that opener would itself have been the
 *   closer; so each kind fails at most once per line. A matched emphasis cannot
 *   nest its own kind (the inner one's closer would have closed the outer), so
 *   the content is re-read at most once per kind — a constant factor.
 *
 * @param source - One block's text.
 * @returns Inline nodes.
 */
export function parseInline(source: string): MarkdownInline[] {
    const length = source.length;
    let brackets: Int32Array | null = null;
    let backticks: Int32Array | null = null;
    let autolinkStops: Int32Array | null = null;
    const tails = new Map<number, RegExpExecArray | null>();
    const atoms = new Map<number, InlineSpan | null>();

    const tailAt = (close: number): RegExpExecArray | null => {
        if (!tails.has(close)) {
            LINK_TAIL.lastIndex = close;
            tails.set(close, LINK_TAIL.exec(source));
        }
        return tails.get(close) ?? null;
    };

    const runLength = (from: number, end: number): number => {
        let to = from;
        while (to < end && source[to] === source[from]) to += 1;
        return to - from;
    };

    const readLink = (start: number): InlineSpan | null => {
        const image = source[start] === "!";
        if (image && source[start + 1] !== "[") return null;
        const labelStart = start + (image ? 2 : 1);
        brackets ??= nextIndexTable(source, (char) => char === "]");
        const close = brackets[labelStart];
        if (close >= length) return null;
        const tail = tailAt(close);
        if (!tail) return null;
        const label = source.slice(labelStart, close);
        const end = close + tail[0].length;
        if (image) {
            const src = safeImageUrl(tail[1]);
            return {
                node: src ? { type: "image", src, alt: label } : { type: "text", value: label },
                end,
            };
        }
        const href = safeLinkUrl(tail[1]);
        return {
            node: href
                ? { type: "link", href, children: parseRange(labelStart, close) }
                : { type: "text", value: label },
            end,
        };
    };

    const readAtom = (start: number): InlineSpan | null => {
        const char = source[start];
        if (char === "`") {
            backticks ??= nextIndexTable(source, (next) => next === "`");
            const close = backticks[start + 1];
            if (close >= length || close === start + 1) return null;
            return {
                node: { type: "code", value: source.slice(start + 1, close) },
                end: close + 1,
            };
        }
        if (char === "<") {
            autolinkStops ??= nextIndexTable(source, (next) => next === ">" || /\s/.test(next));
            if (source[autolinkStops[start + 1]] !== ">") return null;
            AUTOLINK.lastIndex = start;
            const match = AUTOLINK.exec(source);
            if (!match) return null;
            const href = safeLinkUrl(match[1]);
            const text: MarkdownInline = { type: "text", value: match[1] };
            return {
                node: href ? { type: "link", href, children: [text] } : text,
                end: start + match[0].length,
            };
        }
        return readLink(start);
    };

    const atomAt = (start: number, end: number): InlineSpan | null => {
        if (!ATOM_FIRST.has(source[start])) return null;
        if (!atoms.has(start)) atoms.set(start, readAtom(start));
        const atom = atoms.get(start) ?? null;
        return atom && atom.end <= end ? atom : null;
    };

    const findCloser = (marker: string, size: number, from: number, end: number): CloserScan => {
        let index = from;
        while (index < end) {
            const char = source[index];
            if (char === "\\") {
                index += 2;
                continue;
            }
            if (char === "\n" && size === 1) return { close: -1, stop: index };
            if (char === marker) {
                const run = runLength(index, end);
                if (run === size) return { close: index, stop: index };
                if (run === 3 && marker !== "~") {
                    return { close: index + 3 - size, stop: index };
                }
                index += run;
                continue;
            }
            const atom = atomAt(index, end);
            index = atom ? atom.end : index + 1;
        }
        return { close: -1, stop: end };
    };

    function parseRange(start: number, end: number): MarkdownInline[] {
        const nodes: MarkdownInline[] = [];
        const failed = new Map<string, number>();
        let text = "";
        let index = start;

        const push = (node: MarkdownInline): void => {
            if (node.type === "text") {
                text += node.value;
                return;
            }
            if (text) nodes.push({ type: "text", value: text });
            text = "";
            nodes.push(node);
        };

        const emphasisAt = (at: number): InlineSpan => {
            const marker = source[at];
            const size = runLength(at, end);
            const usable = marker === "~" ? size === 2 : size <= 3;
            if (!usable) return { node: null, end: at + size };
            const kind = `${marker}${size}`;
            const deadUntil = failed.get(kind) ?? -1;
            let close = -1;
            if (at >= deadUntil) {
                const scan = findCloser(marker, size, at + size, end);
                close = scan.close;
                if (close === -1) failed.set(kind, scan.stop);
            }
            if (close === -1) return { node: null, end: marker === "~" ? at + size : at + 1 };
            return {
                node: emphasisNode(marker, size, parseRange(at + size, close)),
                end: close + size,
            };
        };

        while (index < end) {
            const char = source[index];

            if (char === "\\" && index + 1 < end) {
                if (source[index + 1] === "\n") push({ type: "break" });
                else text += source[index + 1];
                index += 2;
                continue;
            }

            if (char === " ") {
                let stop = index;
                while (stop < end && source[stop] === " ") stop += 1;
                if (stop - index >= 2 && stop < end && source[stop] === "\n") {
                    push({ type: "break" });
                    index = stop + 1;
                } else {
                    text += source.slice(index, stop);
                    index = stop;
                }
                continue;
            }

            const span = EMPHASIS.has(char) ? emphasisAt(index) : atomAt(index, end);
            if (span?.node) {
                push(span.node);
                index = span.end;
                continue;
            }
            const next = span ? span.end : index + 1;
            text += source.slice(index, next);
            index = next;
        }

        if (text) nodes.push({ type: "text", value: text });
        return nodes;
    }

    return parseRange(0, length);
}
