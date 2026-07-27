import { describe, expect, it } from "vitest";

import { parseInline, parseMarkdown, type MarkdownBlock } from "./markdown-parse";

/** Block kinds of a document, for a quick shape assertion. */
const kinds = (source: string): string[] => parseMarkdown(source).map((block) => block.type);

/** The first block, narrowed. */
function first<T extends MarkdownBlock["type"]>(
    source: string,
    type: T,
): Extract<MarkdownBlock, { type: T }> {
    const block = parseMarkdown(source)[0];
    expect(block.type).toBe(type);
    return block as Extract<MarkdownBlock, { type: T }>;
}

/** Flatten inline nodes to their text, for readable assertions. */
function text(nodes: readonly unknown[]): string {
    return nodes
        .map((node) => {
            const n = node as { type: string; value?: string; children?: unknown[]; alt?: string };
            if (n.type === "text" || n.type === "code") return n.value ?? "";
            if (n.type === "image") return `[img:${n.alt}]`;
            if (n.type === "break") return "\n";
            return text(n.children ?? []);
        })
        .join("");
}

describe("parseMarkdown — blocks", () => {
    it("parses an empty document as nothing", () => {
        expect(parseMarkdown("")).toEqual([]);
        expect(parseMarkdown("\n\n  \n")).toEqual([]);
    });

    it("parses headings at every level, and shifts nothing", () => {
        const blocks = parseMarkdown("# um\n## dois\n###### seis");
        expect(blocks.map((b) => (b.type === "heading" ? b.level : null))).toEqual([1, 2, 6]);
    });

    it("does not treat seven hashes as a heading", () => {
        expect(kinds("####### nope")).toEqual(["paragraph"]);
    });

    it("joins wrapped lines into one paragraph", () => {
        const block = first("uma linha\ne a continuação", "paragraph");
        expect(text(block.children)).toBe("uma linha\ne a continuação");
    });

    it("splits paragraphs on a blank line", () => {
        expect(kinds("um\n\ndois")).toEqual(["paragraph", "paragraph"]);
    });

    it("parses a fenced code block with its language", () => {
        const block = first("```ts\nconst a = 1;\n```", "code");
        expect(block).toMatchObject({ language: "ts", value: "const a = 1;" });
    });

    it("keeps a fence closed by tildes separate from backticks", () => {
        const block = first("~~~\nplain\n~~~", "code");
        expect(block.value).toBe("plain");
    });

    it("does not parse Markdown inside code", () => {
        const block = first("```\n# não é heading\n**não é bold**\n```", "code");
        expect(block.value).toBe("# não é heading\n**não é bold**");
    });

    it("closes an unterminated fence at the end of the document", () => {
        const block = first("```\nsem fim", "code");
        expect(block.value).toBe("sem fim");
    });

    it("parses a thematic break, and not a list item", () => {
        expect(kinds("---")).toEqual(["rule"]);
        expect(kinds("***")).toEqual(["rule"]);
        expect(kinds("- item")).toEqual(["list"]);
    });

    it("parses a blockquote, with blocks inside it", () => {
        const block = first("> ## título\n> corpo", "quote");
        expect(block.children.map((child) => child.type)).toEqual(["heading", "paragraph"]);
    });

    it("continues a quote across a lazy line", () => {
        const block = first("> primeira\nsegunda", "quote");
        expect(block.children).toHaveLength(1);
        expect(text((block.children[0] as { children: unknown[] }).children)).toContain("segunda");
    });

    it("parses an unordered list", () => {
        const block = first("- a\n- b\n- c", "list");
        expect(block.ordered).toBe(false);
        expect(block.items).toHaveLength(3);
    });

    it("parses an ordered list and keeps its start number", () => {
        const block = first("3. a\n4. b", "list");
        expect(block).toMatchObject({ ordered: true, start: 3 });
        expect(block.items).toHaveLength(2);
    });

    it("does not merge a bullet list into an ordered one", () => {
        expect(kinds("- a\n1. b")).toEqual(["list", "list"]);
    });

    it("nests a list by indentation", () => {
        const block = first("- pai\n  - filho\n  - outro\n- tio", "list");
        expect(block.items).toHaveLength(2);
        const nested = block.items[0].find((child) => child.type === "list");
        expect(nested).toBeDefined();
        expect((nested as Extract<MarkdownBlock, { type: "list" }>).items).toHaveLength(2);
    });

    it("keeps a wrapped list item in one item", () => {
        const block = first("- primeira parte\n  segunda parte\n- outro", "list");
        expect(block.items).toHaveLength(2);
    });

    it("parses a pipe table with alignment", () => {
        const block = first(
            "| a | b | c |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |",
            "table",
        );
        expect(block.align).toEqual(["left", "center", "right"]);
        expect(block.head.map(text)).toEqual(["a", "b", "c"]);
        expect(block.rows).toHaveLength(2);
    });

    it("needs the delimiter row to call it a table", () => {
        expect(kinds("| a | b |\n| 1 | 2 |")).toEqual(["paragraph"]);
    });

    it("keeps an escaped pipe inside a cell", () => {
        const block = first("| a |\n| --- |\n| x \\| y |", "table");
        expect(block.rows[0].map(text)).toEqual(["x | y"]);
    });

    it("ends a table at a blank line", () => {
        expect(kinds("| a |\n| --- |\n| 1 |\n\ndepois")).toEqual(["table", "paragraph"]);
    });
});

describe("parseInline", () => {
    it("parses bold, italic and strikethrough", () => {
        expect(parseInline("**b**")[0]).toMatchObject({ type: "strong" });
        expect(parseInline("__b__")[0]).toMatchObject({ type: "strong" });
        expect(parseInline("*i*")[0]).toMatchObject({ type: "em" });
        expect(parseInline("_i_")[0]).toMatchObject({ type: "em" });
        expect(parseInline("~~x~~")[0]).toMatchObject({ type: "del" });
    });

    it("prefers the longer marker, so ** is bold and not two italics", () => {
        expect(parseInline("**forte**")[0].type).toBe("strong");
    });

    it("parses code spans, and does not read Markdown inside them", () => {
        expect(parseInline("`**cru**`")[0]).toEqual({ type: "code", value: "**cru**" });
    });

    it("parses a link and keeps the label as inline content", () => {
        const [node] = parseInline("[**forte**](https://x.dev)");
        expect(node).toMatchObject({ type: "link", href: "https://x.dev" });
        expect(text([node])).toBe("forte");
    });

    it("keeps the label as text when the URL is rejected", () => {
        // Dropping the words somebody wrote would be worse than dropping the link.
        expect(parseInline("[clique](javascript:alert(1))")).toEqual([
            { type: "text", value: "clique" },
        ]);
    });

    it("parses an image, and falls back to the alt text on a bad src", () => {
        expect(parseInline("![gato](https://x.dev/g.png)")[0]).toMatchObject({
            type: "image",
            alt: "gato",
        });
        expect(parseInline("![gato](javascript:alert(1))")).toEqual([
            { type: "text", value: "gato" },
        ]);
    });

    it("parses an autolink", () => {
        expect(parseInline("<https://x.dev>")[0]).toMatchObject({
            type: "link",
            href: "https://x.dev",
        });
    });

    it("leaves anything else in angle brackets as text — no raw HTML", () => {
        expect(parseInline("<script>alert(1)</script>")).toEqual([
            { type: "text", value: "<script>alert(1)</script>" },
        ]);
        expect(parseInline("<b>não</b>")).toEqual([{ type: "text", value: "<b>não</b>" }]);
    });

    it("honors a backslash escape", () => {
        expect(parseInline("\\*não itálico\\*")).toEqual([
            { type: "text", value: "*não itálico*" },
        ]);
    });

    it("leaves an unclosed marker as text instead of running to the end", () => {
        expect(parseInline("**sem fim")).toEqual([{ type: "text", value: "**sem fim" }]);
    });

    it("parses a hard break from two trailing spaces and from a backslash", () => {
        expect(parseInline("a  \nb").map((n) => n.type)).toEqual(["text", "break", "text"]);
        expect(parseInline("a\\\nb").map((n) => n.type)).toEqual(["text", "break", "text"]);
    });

    it("nests emphasis inside strong", () => {
        const [node] = parseInline("**forte com *itálico* dentro**");
        expect(node.type).toBe("strong");
        expect(text([node])).toBe("forte com itálico dentro");
    });
});
