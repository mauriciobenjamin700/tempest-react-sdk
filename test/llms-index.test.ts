/**
 * `docs/llms.txt` is the index an LLM reads first. Its descriptions came from
 * the first line of each page and did not skip admonitions: 48 of 118 entries
 * ended mid-sentence or described a "skip this page" tip instead of the page.
 *
 * @vitest-environment node
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { extractDescription, firstSentence, frontMatterDescription } from "../scripts/gen-llms.mjs";

const DOCS = fileURLToPath(new URL("../docs", import.meta.url));

/**
 * Every base (PT-BR) page that `gen-llms` indexes.
 *
 * @param dir Folder to walk.
 * @returns Absolute paths.
 */
function basePages(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return entry === "internal" ? [] : basePages(full);
        return entry.endsWith(".md") && !entry.endsWith(".en.md") ? [full] : [];
    });
}

describe("llms.txt descriptions", () => {
    it("give every page one whole sentence, not a fragment or a warning box", () => {
        const bad = basePages(DOCS)
            .map((page) => ({
                page: relative(DOCS, page),
                description: extractDescription(readFileSync(page, "utf8")),
            }))
            .filter(
                ({ description }) =>
                    !/[.!?]$/.test(description) ||
                    description.length > 300 ||
                    /^(!!!|\?\?\?)/.test(description),
            );
        expect(bad).toEqual([]);
    });

    it("read a paragraph wrapped across lines and skip the admonition before it", () => {
        const page = [
            "# Página",
            "",
            '!!! tip "Pule esta página"',
            "    Se você já sabe.",
            "",
            "Esta página explica uma coisa longa o bastante para",
            "quebrar em duas linhas. A segunda frase fica de fora.",
        ].join("\n");
        expect(extractDescription(page)).toBe(
            "Esta página explica uma coisa longa o bastante para quebrar em duas linhas.",
        );
    });

    it("prefer the front matter description over the page's opening hook", () => {
        const page =
            '---\ndescription: "Formulário acessível."\n---\n\n# Forms\n\nEste campo parece certo:\n';
        expect(frontMatterDescription(page)).toBe("Formulário acessível.");
        expect(extractDescription(page)).toBe("Formulário acessível.");
        expect(frontMatterDescription("# Sem front matter\n")).toBeUndefined();
    });

    it("do not stop at a colon or at an opening shorter than 40 characters", () => {
        expect(
            firstSentence("Curta. Esta segunda frase completa a descrição: com dois pontos. Fora."),
        ).toBe("Curta. Esta segunda frase completa a descrição: com dois pontos.");
        expect(firstSentence("Sem ponto final")).toBe("Sem ponto final");
    });
});
