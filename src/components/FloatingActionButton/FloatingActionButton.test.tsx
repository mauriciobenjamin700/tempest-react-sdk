import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FloatingActionButton } from "./FloatingActionButton";

describe("FloatingActionButton", () => {
    it("renders the icon", () => {
        render(<FloatingActionButton icon={<span>+</span>} aria-label="Add" />);
        expect(screen.getByText("+")).toBeInTheDocument();
    });

    it("renders the label when extended", () => {
        render(<FloatingActionButton icon={<span>+</span>} label="Novo" />);
        expect(screen.getByText("Novo")).toBeInTheDocument();
    });

    it("fires onClick", () => {
        const onClick = vi.fn();
        render(<FloatingActionButton icon={<span>+</span>} aria-label="Add" onClick={onClick} />);
        fireEvent.click(screen.getByRole("button"));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("defaults to bottom-right position", () => {
        const { container } = render(
            <FloatingActionButton icon={<span>+</span>} aria-label="Add" />,
        );
        const button = container.querySelector("button");
        expect(button?.className).toMatch(/bottomRight/);
    });

    it("applies the bottom-left position class", () => {
        const { container } = render(
            <FloatingActionButton icon={<span>+</span>} aria-label="Add" position="bottom-left" />,
        );
        const button = container.querySelector("button");
        expect(button?.className).toMatch(/bottomLeft/);
        expect(button?.className).not.toMatch(/bottomRight/);
    });

    it("does not apply a corner class when position is none", () => {
        const { container } = render(
            <FloatingActionButton icon={<span>+</span>} aria-label="Add" position="none" />,
        );
        const button = container.querySelector("button");
        expect(button?.className).not.toMatch(/bottomRight/);
        expect(button?.className).not.toMatch(/bottomLeft/);
    });
});
