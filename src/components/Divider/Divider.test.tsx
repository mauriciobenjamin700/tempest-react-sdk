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
