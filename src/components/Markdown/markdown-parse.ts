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

import { safeImageUrl, safeLinkUrl } from "./markdown-url";

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

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
/**
 * A table's delimiter row.
 *
 * The `|` is required somewhere in the line, and that is what tells a one-column
 * table (`| --- |`) apart from a thematic break (`---`) — a single column is a
 * legitimate table, and the first version of this regex demanded two.
 */
const TABLE_DELIMITER = /^\s{0,3}\|[\s|:-]*$|^\s{0,3}:?-+:?(\s*\|\s*:?-+:?)+\s*\|?\s*$/;

/**
 * Parse a Markdown document into blocks.
 *
 * @param source - Raw Markdown.
 * @returns Block nodes in document order.
 */
export function parseMarkdown(source: string): MarkdownBlock[] {
    const lines = source.replace(/\r\n?/g, "\n").split("\n");
    return parseBlocks(lines);
}

/** Parse a run of lines into blocks. */
function parseBlocks(lines: string[]): MarkdownBlock[] {
    const blocks: MarkdownBlock[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.trim() === "") {
            i += 1;
            continue;
        }

        const fence = FENCE.exec(line);
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

        const heading = HEADING.exec(line);
        if (heading) {
            blocks.push({
                type: "heading",
                level: heading[1].length,
                children: parseInline(heading[2]),
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
            blocks.push({ type: "quote", children: parseBlocks(inner) });
            continue;
        }

        if (BULLET.test(line) || ORDERED.test(line)) {
            const [list, next] = parseList(lines, i);
            blocks.push(list);
            i = next;
            continue;
        }

        if (i + 1 < lines.length && line.includes("|") && TABLE_DELIMITER.test(lines[i + 1])) {
            const [table, next] = parseTable(lines, i);
            blocks.push(table);
            i = next;
            continue;
        }

        const paragraph: string[] = [];
        while (i < lines.length && lines[i].trim() !== "") {
            const current = lines[i];
            if (
                HEADING.test(current) ||
                RULE.test(current) ||
                FENCE.test(current) ||
                QUOTE.test(current) ||
                BULLET.test(current) ||
                ORDERED.test(current)
            ) {
                break;
            }
            paragraph.push(current.trim());
            i += 1;
        }
        if (paragraph.length > 0) {
            blocks.push({ type: "paragraph", children: parseInline(paragraph.join("\n")) });
        }
    }

    return blocks;
}

/**
 * Parse a list, including nested lists and multi-line items.
 *
 * Nesting is decided by indentation relative to the **first** item's marker, so a
 * list indented inside a quote or another list still reads correctly.
 *
 * @returns The list node and the index of the first line after it.
 */
function parseList(lines: string[], start: number): [MarkdownBlock, number] {
    const bulletStart = BULLET.exec(lines[start]);
    const orderedStart = ORDERED.exec(lines[start]);
    // The two markers are mutually exclusive — `-*+` versus digits — so whichever
    // matched decides the list kind.
    const ordered = orderedStart !== null;
    const first = orderedStart ?? bulletStart;
    const baseIndent = (first?.[1] ?? "").length;
    const startNumber = ordered ? Number(orderedStart?.[2] ?? 1) : 1;

    const items: MarkdownBlock[][] = [];
    let buffer: string[] = [];
    let i = start;

    const flush = (): void => {
        if (buffer.length === 0) return;
        items.push(parseBlocks(buffer));
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
        const bullet = BULLET.exec(line);
        const numbered = ORDERED.exec(line);
        const match = bullet ?? numbered;

        if (match && match[1].length <= baseIndent) {
            const sameKind = ordered ? Boolean(numbered) : Boolean(bullet);
            if (!sameKind) break;
            flush();
            buffer.push(match[3]);
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

/** Inline delimiters, longest marker first so `**` wins over `*`. */
const INLINE_RULES: Array<{
    pattern: RegExp;
    build: (match: RegExpExecArray) => MarkdownInline | null;
}> = [
    {
        pattern: /^!\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/,
        build: (match) => {
            const src = safeImageUrl(match[2]);
            return src ? { type: "image", src, alt: match[1] } : { type: "text", value: match[1] };
        },
    },
    {
        pattern: /^\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/,
        build: (match) => {
            const href = safeLinkUrl(match[2]);
            const children = parseInline(match[1]);
            // A rejected URL keeps the label as plain text: dropping the text too
            // would silently delete words somebody wrote.
            return href ? { type: "link", href, children } : { type: "text", value: match[1] };
        },
    },
    { pattern: /^`([^`]+)`/, build: (match) => ({ type: "code", value: match[1] }) },
    {
        pattern: /^\*\*([\s\S]+?)\*\*/,
        build: (match) => ({ type: "strong", children: parseInline(match[1]) }),
    },
    {
        pattern: /^__([\s\S]+?)__/,
        build: (match) => ({ type: "strong", children: parseInline(match[1]) }),
    },
    {
        pattern: /^~~([\s\S]+?)~~/,
        build: (match) => ({ type: "del", children: parseInline(match[1]) }),
    },
    {
        pattern: /^\*([^*\n]+)\*/,
        build: (match) => ({ type: "em", children: parseInline(match[1]) }),
    },
    {
        pattern: /^_([^_\n]+)_/,
        build: (match) => ({ type: "em", children: parseInline(match[1]) }),
    },
    {
        pattern: /^<((?:https?:\/\/|mailto:)[^>\s]+)>/,
        build: (match) => {
            const href = safeLinkUrl(match[1]);
            return href
                ? { type: "link", href, children: [{ type: "text", value: match[1] }] }
                : { type: "text", value: match[1] };
        },
    },
    { pattern: /^ {2,}\n/, build: () => ({ type: "break" }) },
    { pattern: /^\\\n/, build: () => ({ type: "break" }) },
];

/**
 * Parse inline Markdown.
 *
 * A backslash escapes the next character, so `\*not italic\*` renders with the
 * asterisks. Anything that matches no rule is text — an unclosed `**` is two
 * asterisks, not a bold run to the end of the paragraph.
 *
 * @param source - One block's text.
 * @returns Inline nodes.
 */
export function parseInline(source: string): MarkdownInline[] {
    const nodes: MarkdownInline[] = [];
    let text = "";
    let i = 0;

    const flush = (): void => {
        if (text) nodes.push({ type: "text", value: text });
        text = "";
    };

    while (i < source.length) {
        if (source[i] === "\\" && i + 1 < source.length && source[i + 1] !== "\n") {
            text += source[i + 1];
            i += 2;
            continue;
        }

        const rest = source.slice(i);
        let matched = false;
        for (const rule of INLINE_RULES) {
            const match = rule.pattern.exec(rest);
            if (!match) continue;
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
