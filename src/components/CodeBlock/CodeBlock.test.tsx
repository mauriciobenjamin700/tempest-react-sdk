import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CodeBlock } from "./CodeBlock";

const SNIPPET = 'const answer = 42;\n// why\nexport { answer };\nconsole.log("ok");';

const region = () => screen.getByRole("group");

/** Text as the DOM holds it, so decoration shows up as part of the string. */
const rendered = (container: HTMLElement) =>
    (container.querySelector("code") as HTMLElement).textContent ?? "";

describe("CodeBlock — the code itself", () => {
    it("renders the source verbatim", () => {
        const { container } = render(<CodeBlock code={SNIPPET} language="ts" copyable={false} />);
        expect(rendered(container)).toBe(SNIPPET);
    });

    it("trims the blank lines a template literal leaves behind", () => {
        const { container } = render(<CodeBlock code={"\n\nconst a = 1;\n  \n"} language="ts" />);
        expect(rendered(container)).toBe("const a = 1;");
    });

    it("colours tokens by kind", () => {
        const { container } = render(<CodeBlock code="const a = 1;" language="ts" />);
        const kinds = [...container.querySelectorAll("[data-token]")].map((n) =>
            n.getAttribute("data-token"),
        );
        expect(kinds).toContain("keyword");
        expect(kinds).toContain("number");
    });

    it("renders an unknown language as plain text rather than failing", () => {
        const { container } = render(<CodeBlock code="MOVE A TO B." language="cobol" />);
        expect(rendered(container)).toBe("MOVE A TO B.");
        expect(container.querySelector('[data-language="plain"]')).not.toBeNull();
    });

    it("keeps a blank line inside the snippet", () => {
        const { container } = render(<CodeBlock code={"a\n\nb"} language="plain" />);
        expect(rendered(container)).toBe("a\n\nb");
    });
});

describe("CodeBlock — line numbers", () => {
    it("numbers every line when asked", () => {
        const { container } = render(<CodeBlock code={SNIPPET} showLineNumbers />);
        const numbers = [...container.querySelectorAll("[aria-hidden='true']")].map(
            (n) => n.textContent,
        );
        expect(numbers).toEqual(["1", "2", "3", "4"]);
    });

    it("hides the numbers from assistive tech — they are decoration", () => {
        const { container } = render(<CodeBlock code={SNIPPET} showLineNumbers />);
        for (const number of container.querySelectorAll("[aria-hidden='true']")) {
            expect(number).toHaveAttribute("aria-hidden", "true");
        }
    });

    it("adds none by default", () => {
        const { container } = render(<CodeBlock code={SNIPPET} />);
        expect(container.querySelectorAll("[aria-hidden='true']")).toHaveLength(0);
    });

    it("marks the lines the snippet is about", () => {
        const { container } = render(<CodeBlock code={SNIPPET} highlightLines={[2, 4]} />);
        const lines = [...container.querySelectorAll("code > span")];
        expect(lines[1].className).toMatch(/marked/);
        expect(lines[3].className).toMatch(/marked/);
        expect(lines[0].className).not.toMatch(/marked/);
    });

    it("ignores a highlight past the end instead of throwing", () => {
        expect(() => render(<CodeBlock code="a" highlightLines={[99]} />)).not.toThrow();
    });
});

describe("CodeBlock — keyboard and assistive tech", () => {
    it("is focusable, so a keyboard user can scroll and read it", () => {
        render(<CodeBlock code={SNIPPET} language="ts" />);
        expect(region()).toHaveAttribute("tabindex", "0");
    });

    it("names itself by language when there is no filename", () => {
        render(<CodeBlock code={SNIPPET} language="ts" />);
        expect(region()).toHaveAccessibleName("Bloco de código em typescript");
    });

    it("names itself by filename when there is one", () => {
        render(<CodeBlock code={SNIPPET} language="ts" filename="src/main.ts" />);
        expect(region()).toHaveAccessibleName("Código: src/main.ts");
    });

    it("drops the language from the name when it is unknown", () => {
        render(<CodeBlock code="x" />);
        expect(region()).toHaveAccessibleName("Bloco de código");
    });

    it("takes a caller-supplied name", () => {
        render(<CodeBlock code={SNIPPET} language="ts" label="Exemplo de uso" />);
        expect(region()).toHaveAccessibleName("Exemplo de uso");
    });
});

describe("CodeBlock — the header", () => {
    it("shows the filename", () => {
        render(<CodeBlock code={SNIPPET} filename="src/main.ts" />);
        expect(screen.getByText("src/main.ts")).toBeInTheDocument();
    });

    it("copies the trimmed source, not the line numbers", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText } });
        render(<CodeBlock code={`\n${SNIPPET}\n`} showLineNumbers />);

        await userEvent.click(screen.getByRole("button"));
        expect(writeText).toHaveBeenCalledWith(SNIPPET);
    });

    it("drops the header entirely when there is nothing to put in it", () => {
        render(<CodeBlock code={SNIPPET} copyable={false} />);
        expect(screen.queryByRole("button")).toBeNull();
    });
});

describe("CodeBlock — layout", () => {
    it("caps the height so a long log does not push the page", () => {
        render(<CodeBlock code={SNIPPET} maxHeight={200} />);
        expect(region()).toHaveStyle({ maxHeight: "200px" });
    });

    it("wraps instead of scrolling sideways when asked", () => {
        const { container } = render(<CodeBlock code={SNIPPET} wrap />);
        expect((container.querySelector("pre") as HTMLElement).className).toMatch(/wrap/);
    });

    it("forwards className and DOM props to the wrapper", () => {
        const { container } = render(<CodeBlock code={SNIPPET} className="x" data-testid="cb" />);
        const wrapper = container.firstElementChild as HTMLElement;
        expect(wrapper).toHaveClass("x");
        expect(wrapper).toHaveAttribute("data-testid", "cb");
    });
});
