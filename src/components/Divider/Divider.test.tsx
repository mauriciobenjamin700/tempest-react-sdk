import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Divider } from "./Divider";

describe("Divider", () => {
    it("renders a horizontal hr without label", () => {
        const { container } = render(<Divider />);
        expect(container.querySelector("hr")).toBeTruthy();
    });

    it("renders a label inside divider when provided", () => {
        render(<Divider label="OR" />);
        expect(screen.getByText("OR")).toBeInTheDocument();
        expect(screen.getByRole("separator")).toHaveAttribute("aria-orientation", "horizontal");
    });

    it("renders vertical orientation", () => {
        render(<Divider orientation="vertical" data-testid="div" />);
        const el = screen.getByTestId("div");
        expect(el).toHaveAttribute("aria-orientation", "vertical");
    });

    it("applies dashed variant class", () => {
        const { container } = render(<Divider variant="dashed" />);
        const hr = container.querySelector("hr");
        expect(hr?.className).toContain("dashed");
    });
});

describe("Divider — variants and alignment", () => {
    it("marks a dashed horizontal divider", () => {
        const { container } = render(<Divider variant="dashed" />);
        expect((container.firstChild as HTMLElement).className).toContain("dashed");
    });

    it("marks a dashed vertical divider", () => {
        const { container } = render(<Divider orientation="vertical" variant="dashed" />);
        const el = container.firstChild as HTMLElement;
        expect(el.className).toContain("vertical");
        expect(el.className).toContain("dashed");
    });

    it.each([
        ["start", "alignStart"],
        ["end", "alignEnd"],
    ] as const)("aligns a labelled divider to %s", (align, expected) => {
        const { container } = render(<Divider label="rótulo" align={align} />);
        expect((container.firstChild as HTMLElement).className).toContain(expected);
    });

    it("adds no alignment class by default", () => {
        const { container } = render(<Divider label="rótulo" />);
        const cls = (container.firstChild as HTMLElement).className;
        expect(cls).not.toContain("alignStart");
        expect(cls).not.toContain("alignEnd");
    });

    it("renders a bare <hr> without a label", () => {
        const { container } = render(<Divider />);
        expect((container.firstChild as HTMLElement).tagName).toBe("HR");
        expect((container.firstChild as HTMLElement).className).toContain("bare");
    });
});
