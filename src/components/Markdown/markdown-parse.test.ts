import { describe, expect, it } from "vitest";

import {
    parseInline,
    parseMarkdown,
    type MarkdownBlock,
    type MarkdownInline,
} from "./markdown-parse";

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

    it.each([
        ["- item"],
        ["* item"],
        ["+ item"],
        ["1. item"],
        ["1) item"],
        ["- \ttab after the marker"],
        ["   - recuado"],
    ])("reads %j as a list item", (source) => {
        expect(kinds(source)).toEqual(["list"]);
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

describe("parseMarkdown — what counts as a list item is unchanged", () => {
    it.each([
        ["-\u00a0item"], // NBSP right after the marker, as Word and Docs paste
        ["-\fitem"], // form feed
        ["\ufeff- item"], // BOM before the marker
        ["- \titem"], // tab
    ])("reads %j as a list", (source) => {
        expect(kinds(source)).toEqual(["list"]);
    });

    it.each([["- a\u2028b"], ["1. a\u2029b"], ["- a\u2028"]])(
        "keeps %j a paragraph, because the separator is not a line break",
        (source) => {
            expect(kinds(source)).toEqual(["paragraph"]);
        },
    );
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

/** A link node with one text child, for the nested-inline table. */
const link = (href: string, label: string) => ({
    type: "link",
    href,
    children: [{ type: "text", value: label }],
});

describe("parseInline — nested inline content (#599)", () => {
    it.each([
        ["**[a](mailto:a@b.com)**", [{ type: "strong", children: [link("mailto:a@b.com", "a")] }]],
        ["*[a](https://x.com)*", [{ type: "em", children: [link("https://x.com", "a")] }]],
        ["_[a](https://x.com)_", [{ type: "em", children: [link("https://x.com", "a")] }]],
        ["~~[a](https://x.com)~~", [{ type: "del", children: [link("https://x.com", "a")] }]],
        ["**`código`**", [{ type: "strong", children: [{ type: "code", value: "código" }] }]],
        [
            "**![gato](https://x.com/g.png)**",
            [
                {
                    type: "strong",
                    children: [{ type: "image", src: "https://x.com/g.png", alt: "gato" }],
                },
            ],
        ],
        [
            "**[clique](javascript:alert(1))**",
            [{ type: "strong", children: [{ type: "text", value: "clique" }] }],
        ],
    ])("parses %j with the inline content intact", (source, expected) => {
        expect(parseInline(source)).toEqual(expected);
    });

    it("reads *** as italic around bold, with no stray asterisk", () => {
        expect(parseInline("***[a](https://x.com)***")).toEqual([
            {
                type: "em",
                children: [{ type: "strong", children: [link("https://x.com", "a")] }],
            },
        ]);
    });

    it("nests bold inside italic instead of splitting the italic in three", () => {
        expect(parseInline("*a **b** c*")).toEqual([
            {
                type: "em",
                children: [
                    { type: "text", value: "a " },
                    { type: "strong", children: [{ type: "text", value: "b" }] },
                    { type: "text", value: " c" },
                ],
            },
        ]);
    });

    it("does not close emphasis on a marker inside a link URL", () => {
        expect(parseInline("_veja [doc](https://x.com/a_b) aqui_")).toEqual([
            {
                type: "em",
                children: [
                    { type: "text", value: "veja " },
                    link("https://x.com/a_b", "doc"),
                    { type: "text", value: " aqui" },
                ],
            },
        ]);
    });

    it("does not close emphasis on a marker inside a code span or an autolink", () => {
        expect(parseInline("**a `x**y` b**")).toEqual([
            {
                type: "strong",
                children: [
                    { type: "text", value: "a " },
                    { type: "code", value: "x**y" },
                    { type: "text", value: " b" },
                ],
            },
        ]);
        expect(parseInline("_ver <https://x.com/a_b>_")).toEqual([
            {
                type: "em",
                children: [
                    { type: "text", value: "ver " },
                    link("https://x.com/a_b", "https://x.com/a_b"),
                ],
            },
        ]);
    });

    it("keeps an unmatched marker as text next to the emphasis it did not open", () => {
        expect(parseInline("**a*")).toEqual([
            { type: "text", value: "*" },
            { type: "em", children: [{ type: "text", value: "a" }] },
        ]);
        expect(parseInline("***a**")).toEqual([
            { type: "text", value: "*" },
            { type: "strong", children: [{ type: "text", value: "a" }] },
        ]);
    });
});

/**
 * Run `work` three times and return the fastest run, in milliseconds.
 *
 * The budget is about eight times what the linear parser needs under coverage
 * instrumentation (at most ~35 ms, for the inline cases; under 10 ms bare), and
 * below what the backtracking regexes took before #437 on the same inputs:
 * `"# a" + " ".repeat(3000) + "b"` cost about 2 s, and the other cases 0.45 to
 * 2.3 s each.
 *
 * The fastest of three, not one run: load on the machine only ever adds time, so
 * the minimum measures the parser rather than the scheduler. A single run failed
 * at 532 ms in a `make check` on 2026-11-01 with the load average at 23 while the
 * parser was linear; a quadratic regression stays far above the budget in every
 * run.
 */
function elapsed(work: () => unknown): number {
    let fastest = Number.POSITIVE_INFINITY;
    for (let run = 0; run < 3; run += 1) {
        const start = performance.now();
        work();
        fastest = Math.min(fastest, performance.now() - start);
    }
    return fastest;
}

/** Ceiling for one parse of an adversarial input, in milliseconds. */
const BUDGET_MS = 250;

describe("parseMarkdown — hostile input stays linear (#437)", () => {
    it("parses a heading padded with 3000 spaces without cubic backtracking", () => {
        for (const prefix of ["# a", "> # a", "- # a"]) {
            expect(elapsed(() => parseMarkdown(`${prefix}${" ".repeat(3000)}b`))).toBeLessThan(
                BUDGET_MS,
            );
        }
    });

    it("parses a heading line with 50 KB of spaces well under the budget", () => {
        const source = `# a${" ".repeat(50_000)}b`;
        expect(elapsed(() => parseMarkdown(source))).toBeLessThan(BUDGET_MS);
        expect(first(source, "heading").children).toEqual([
            { type: "text", value: `a${" ".repeat(50_000)}b` },
        ]);
    });

    it.each([
        ["a paragraph with an inner run of spaces", `a${" ".repeat(50_000)}b`],
        ["a fence opener followed by spaces and junk", `\`\`\`${" ".repeat(50_000)}!`],
        ["a table delimiter row ending in spaces and junk", `a|b\n- |${" ".repeat(50_000)}!`],
        ["a run of unclosed link openers", "[".repeat(50_000)],
        ["a run of unclosed image openers", "![".repeat(25_000)],
        ["link openers sharing one failing tail", `${"[".repeat(50_000)}](x y`],
        ["a run of unclosed autolinks", "<http://".repeat(12_000)],
        ["italic openers stepping over unclosed link openers", "_[".repeat(25_000)],
        ["italic openers stepping over failing link tails", "*[x](".repeat(10_000)],
        ["italic openers stepping over unclosed code spans", "*`".repeat(25_000)],
        ["link labels full of underscores", "[_](".repeat(12_500)],
        ["bold openers around links with no closing paren", "**[x](y ".repeat(6_000)],
        ["a run of italic-around-bold openers", "***a ".repeat(10_000)],
        // The line separator and the paragraph separator are not `\n`, so they stay
        // inside one line. The list patterns used to let `\s+` and `(.*)` race for
        // the run of spaces around them, quadratic in the run (#478).
        [
            "a bullet item padded with spaces before a line separator",
            `- ${" ".repeat(50_000)}a\u2028`,
        ],
        [
            "an ordered item padded with spaces before a paragraph separator",
            `1. ${" ".repeat(50_000)}a\u2029`,
        ],
    ])("parses %s in linear time", (_label, source) => {
        expect(elapsed(() => parseMarkdown(source))).toBeLessThan(BUDGET_MS);
    });

    it("caps nesting instead of overflowing the stack on deep lists and quotes", () => {
        expect(() => parseMarkdown(`${"- ".repeat(20_000)}x`)).not.toThrow();
        expect(() => parseMarkdown(`${">".repeat(20_000)}x`)).not.toThrow();
    });

    it("keeps the text of a quote nested past the cap as a paragraph", () => {
        let block: MarkdownBlock | undefined = parseMarkdown(`${"> ".repeat(100)}fundo`)[0];
        let depth = 0;
        while (block?.type === "quote") {
            block = block.children[0];
            depth += 1;
        }
        expect(depth).toBeLessThan(100);
        expect(block?.type).toBe("paragraph");
        expect(text(block?.type === "paragraph" ? block.children : [])).toContain("fundo");
    });
});

/** How many inline nodes deep the deepest leaf of `nodes` sits. */
function inlineDepth(nodes: readonly MarkdownInline[]): number {
    let deepest = 0;
    for (const node of nodes) {
        const below = "children" in node ? inlineDepth(node.children) : 0;
        deepest = Math.max(deepest, 1 + below);
    }
    return deepest;
}

/** Every inline node of a tree, depth first. */
function allInline(nodes: readonly MarkdownInline[]): MarkdownInline[] {
    return nodes.flatMap((node) => [node, ...("children" in node ? allInline(node.children) : [])]);
}

/**
 * The deepest inline tree the grammar allows: the seven emphasis kinds (`*`,
 * `**`, `***`, `_`, `__`, `___`, `~~`) outside a link, the link, the seven again
 * inside its label, and the leaf. Nothing in the text can push past it.
 */
const MAX_INLINE_DEPTH = 7 + 1 + 7 + 1;

describe("parseMarkdown — link labels are parsed only when the link is kept", () => {
    it.each([
        ["50 000 link openers before one tail", `${"[".repeat(50_000)}a](u)`],
        ["5000 link openers before an absolute URL", `${"[".repeat(5000)}a](https://x.dev)`],
        ["9 KB of prose-like openers before one tail", `${"[a ".repeat(3000)}doc](https://x.dev)`],
        ["20 000 prose-like openers before one tail", `${"[a ".repeat(20_000)}b](u)`],
        ["25 000 image openers before one tail", `${"![".repeat(25_000)}a](u)`],
        ["link openers mixed with italic openers", `${"[*".repeat(10_000)}a](u)`],
        ["italic openers around link openers", `${"*[".repeat(10_000)}a](u)*`],
        ["bold, link and underscore openers", `${"**[_".repeat(5000)}a](u)_**`],
        ["strikethrough around link openers", `${"~~[".repeat(10_000)}a](u)~~`],
        ["autolinks that start in a label and end after it", `[${"<https://".repeat(10_000)}](u)>`],
    ])("parses %s without overflowing the stack, in linear time", (_label, source) => {
        expect(elapsed(() => parseMarkdown(source))).toBeLessThan(BUDGET_MS);
    });

    it("links the first opener and keeps the openers after it as label text", () => {
        const [link, ...rest] = first(`${"[".repeat(5000)}a](https://x.dev)`, "paragraph").children;
        expect(rest).toEqual([]);
        expect(link).toMatchObject({ type: "link", href: "https://x.dev" });
        expect(text([link])).toBe(`${"[".repeat(4999)}a`);
    });

    it("keeps an autolink inside a link label as text, so no link nests in a link", () => {
        expect(parseInline("[veja <https://b.dev>](https://a.dev)")).toEqual([
            {
                type: "link",
                href: "https://a.dev",
                children: [{ type: "text", value: "veja <https://b.dev>" }],
            },
        ]);
    });

    it("keeps the label of a link with formatting inside it", () => {
        expect(parseInline("[**negrito** e `código`](https://x.dev)")).toEqual([
            {
                type: "link",
                href: "https://x.dev",
                children: [
                    { type: "strong", children: [{ type: "text", value: "negrito" }] },
                    { type: "text", value: " e " },
                    { type: "code", value: "código" },
                ],
            },
        ]);
    });

    it("never nests a link inside a link, nor past the depth the grammar allows", () => {
        const pieces = [
            "[",
            "]",
            "](u)",
            "](javascript:x)",
            "*",
            "**",
            "_",
            "__",
            "~~",
            "`",
            "<https://a>",
            "a",
            " ",
        ];
        let seed = 599;
        const random = (): number => {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            return seed / 2147483648;
        };
        for (let sample = 0; sample < 300; sample += 1) {
            let source = "";
            for (let piece = 0; piece < 400; piece += 1) {
                source += pieces[Math.floor(random() * pieces.length)];
            }
            const nodes = parseInline(source);
            expect(inlineDepth(nodes)).toBeLessThanOrEqual(MAX_INLINE_DEPTH);
            for (const node of allInline(nodes)) {
                if (node.type !== "link") continue;
                expect(allInline(node.children).some((child) => child.type === "link")).toBe(false);
            }
        }
    });

    it("still refuses a javascript: URL deep inside emphasis and a link label", () => {
        const nodes = parseInline(
            "***~~_[**x** <javascript:alert(1)>](javascript:alert(1))_~~*** [ok](https://ok.dev)",
        );
        const links = allInline(nodes).filter((node) => node.type === "link");
        expect(links).toEqual([
            { type: "link", href: "https://ok.dev", children: [{ type: "text", value: "ok" }] },
        ]);
    });
});

describe("parseInline — autolinks read without a pattern over the URL", () => {
    it.each([
        ["<https://x.dev/a_b?c=1>", "https://x.dev/a_b?c=1"],
        ["<http://x.dev>", "http://x.dev"],
        ["<mailto:a@b.dev>", "mailto:a@b.dev"],
    ])("links %j to %j", (source, href) => {
        expect(parseInline(source)).toEqual([
            { type: "link", href, children: [{ type: "text", value: href }] },
        ]);
    });

    it.each([
        "<https://>",
        "<mailto:>",
        "<ftp://x.dev>",
        "<HTTPS://x.dev>",
        "<https://x .dev>",
        "<https://x.dev",
    ])("keeps %j as text", (source) => {
        expect(parseInline(source)).toEqual([{ type: "text", value: source }]);
    });
});

describe("parseMarkdown — heading edge cases kept by the linear matcher", () => {
    it.each([
        ["# título #", "título"],
        ["## título ##   ", "título"],
        ["# título#", "título"],
        ["#   espaçado   ", "espaçado"],
        ["   ### recuado", "recuado"],
        ["# a # b", "a # b"],
        ["# #", ""],
        ["# ", ""],
    ])("reads %j as the heading text %j", (source, expected) => {
        expect(text(first(source, "heading").children)).toBe(expected);
    });

    it.each(["#", "#título", "    # quatro espaços é código no CommonMark, aqui é texto"])(
        "does not read %j as a heading",
        (source) => {
            expect(kinds(source)).not.toContain("heading");
        },
    );
});
