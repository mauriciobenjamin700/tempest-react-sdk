import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
