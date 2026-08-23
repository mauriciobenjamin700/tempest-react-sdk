import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Markdown } from "./Markdown";

describe("Markdown", () => {
    it("renders headings shifted by the offset, so a page keeps one h1", () => {
        render(<Markdown source="# título do comentário" />);
        expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("título do comentário");
    });

    it("honors an explicit heading offset", () => {
        render(<Markdown source={"# a\n## b"} headingOffset={3} />);
        expect(screen.getByRole("heading", { level: 3, name: "a" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 4, name: "b" })).toBeInTheDocument();
    });

    it("never emits a heading past h6", () => {
        render(<Markdown source="###### fundo" headingOffset={5} />);
        expect(screen.getByRole("heading", { level: 6 })).toBeInTheDocument();
    });

    it("renders emphasis, code and a link", () => {
        render(<Markdown source="**forte**, `código` e [link](https://x.dev)" />);
        expect(screen.getByText("forte").tagName).toBe("STRONG");
        expect(screen.getByText("código").tagName).toBe("CODE");
        expect(screen.getByRole("link", { name: "link" })).toHaveAttribute("href", "https://x.dev");
    });

    it("renders lists", () => {
        render(<Markdown source={"- a\n- b\n\n1. um\n2. dois"} />);
        expect(screen.getAllByRole("list")).toHaveLength(2);
        expect(screen.getAllByRole("listitem")).toHaveLength(4);
    });

    it("renders a table with the alignment the delimiter row asked for", () => {
        render(<Markdown source={"| a | b |\n| :-- | --: |\n| 1 | 2 |"} />);
        expect(screen.getByRole("table")).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: "a" })).toHaveStyle({ textAlign: "left" });
        expect(screen.getByRole("columnheader", { name: "b" })).toHaveStyle({ textAlign: "right" });
    });

    it("renders fenced code through CodeBlock, with its copy control", () => {
        render(<Markdown source={"```ts\nconst a = 1;\n```"} />);
        expect(screen.getByText(/const/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
    });

    it("renders plain pre when highlighting is off", () => {
        const { container } = render(<Markdown source={"```\nx\n```"} highlightCode={false} />);
        expect(container.querySelector("pre > code")).toHaveTextContent("x");
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("renders a blockquote and a rule", () => {
        const { container } = render(<Markdown source={"> citação\n\n---"} />);
        expect(container.querySelector("blockquote")).toHaveTextContent("citação");
        expect(container.querySelector("hr")).toBeInTheDocument();
    });

    it("renders an image with its alt text", () => {
        render(<Markdown source="![um gato](https://x.dev/gato.png)" />);
        expect(screen.getByRole("img", { name: "um gato" })).toHaveAttribute(
            "src",
            "https://x.dev/gato.png",
        );
    });

    it("renders raw HTML as text — it is never markup", () => {
        const { container } = render(
            <Markdown source={"<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>"} />,
        );
        expect(container.querySelector("script")).toBeNull();
        expect(container.querySelector("img")).toBeNull();
        expect(container.textContent).toContain("<script>alert(1)</script>");
    });

    it("does not link a javascript: URL, and keeps the label", () => {
        render(<Markdown source="[clique aqui](javascript:alert(1))" />);
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
        expect(screen.getByText("clique aqui")).toBeInTheDocument();
    });

    it("does not render an image from a javascript: src", () => {
        render(<Markdown source="![x](javascript:alert(1))" />);
        expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("passes linkProps to every link", () => {
        render(
            <Markdown
                source="[a](https://a.dev) e [b](https://b.dev)"
                linkProps={{ target: "_blank", rel: "noreferrer" }}
            />,
        );
        for (const link of screen.getAllByRole("link")) {
            expect(link).toHaveAttribute("target", "_blank");
            expect(link).toHaveAttribute("rel", "noreferrer");
        }
    });

    it("renders nothing for an empty source", () => {
        const { container } = render(<Markdown source="" />);
        expect(container.firstElementChild?.childElementCount).toBe(0);
    });

    it("forwards the rest of the DOM props", () => {
        render(<Markdown source="oi" data-testid="md" aria-label="Comentário" />);
        expect(screen.getByTestId("md")).toHaveAttribute("aria-label", "Comentário");
    });
});

describe("Markdown — the inline nodes the first pass missed", () => {
    it("renders emphasis, strikethrough and a hard break", () => {
        const { container } = render(
            <Markdown source={"*ênfase* e ~~riscado~~\n\nlinha um  \nlinha dois"} />,
        );
        expect(screen.getByText("ênfase").tagName).toBe("EM");
        expect(screen.getByText("riscado").tagName).toBe("DEL");
        expect(container.querySelector("br")).toBeInTheDocument();
    });

    it("keeps an image whose src normalizes to nothing as its alt text", () => {
        render(<Markdown source={"![sem fonte](\u0001)"} />);
        expect(screen.getByText("sem fonte")).toBeInTheDocument();
        expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("starts an ordered list at the number it was written with", () => {
        const { container } = render(<Markdown source={"3. três\n4. quatro"} />);
        expect(container.querySelector("ol")).toHaveAttribute("start", "3");
    });

    it("keeps the ordered list unnumbered when it starts at one", () => {
        const { container } = render(<Markdown source={"1. um\n2. dois"} />);
        expect(container.querySelector("ol")).not.toHaveAttribute("start");
    });

    it("highlights a fence that names no language", () => {
        render(<Markdown source={"```\nsem linguagem\n```"} />);
        expect(screen.getByText(/sem linguagem/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
    });

    it("leaves a table without a delimiter alignment unstyled", () => {
        render(<Markdown source={"| a | b |\n| --- | --- |\n| 1 | 2 |"} />);
        const header = screen.getByRole("columnheader", { name: "a" });
        expect(header.style.textAlign).toBe("");
    });

    it("renders a row wider than the alignment row without styling the extra cell", () => {
        render(<Markdown source={"| a | b |\n| :-- | --: |\n| 1 | 2 | 3 |"} />);
        const cells = screen.getAllByRole("cell");
        expect(cells).toHaveLength(3);
        expect(cells[2].style.textAlign).toBe("");
    });
});

/**
 * jsdom performs no layout, so a table never looks wider than its box. These
 * stubs stand in for the measurement a browser would do.
 */
function stubWidths(scroll: number, client: number) {
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
        configurable: true,
        get: () => scroll,
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
        configurable: true,
        get: () => client,
    });
}

describe("Markdown — the table's scrollable region", () => {
    afterEach(() => {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollWidth");
        Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    });

    it("becomes a labelled tab stop only while the table overflows", () => {
        stubWidths(900, 300);
        render(<Markdown source={"| a | b |\n| :-- | --: |\n| 1 | 2 |"} />);
        const region = screen.getByRole("region", { name: "Tabela rolável" });
        expect(region).toHaveAttribute("tabindex", "0");
    });

    it("adds no tab stop while the table fits", () => {
        stubWidths(300, 300);
        const { container } = render(<Markdown source={"| a | b |\n| :-- | --: |\n| 1 | 2 |"} />);
        const scroll = container.firstElementChild?.firstElementChild as HTMLElement;
        expect(scroll).not.toHaveAttribute("tabindex");
        expect(scroll).not.toHaveAttribute("role");
    });
});
