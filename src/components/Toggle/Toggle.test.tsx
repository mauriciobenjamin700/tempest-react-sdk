import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Toggle } from "./Toggle";

describe("Toggle", () => {
    it("renders a button with aria-pressed", () => {
        render(<Toggle>Bold</Toggle>);
        const btn = screen.getByRole("button", { name: "Bold" });
        expect(btn).toHaveAttribute("type", "button");
        expect(btn).toHaveAttribute("aria-pressed", "false");
    });

    it("toggles aria-pressed on click (uncontrolled)", () => {
        render(<Toggle>Bold</Toggle>);
        const btn = screen.getByRole("button");
        fireEvent.click(btn);
        expect(btn).toHaveAttribute("aria-pressed", "true");
        fireEvent.click(btn);
        expect(btn).toHaveAttribute("aria-pressed", "false");
    });

    it("honors defaultPressed", () => {
        render(<Toggle defaultPressed>Bold</Toggle>);
        expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    });

    it("respects the controlled prop and does not self-update", () => {
        const onPressedChange = vi.fn();
        render(
            <Toggle pressed={false} onPressedChange={onPressedChange}>
                Bold
            </Toggle>,
        );
        const btn = screen.getByRole("button");
        fireEvent.click(btn);
        expect(onPressedChange).toHaveBeenCalledWith(true);
        // Stays controlled at false until parent updates the prop.
        expect(btn).toHaveAttribute("aria-pressed", "false");
    });

    it("does not fire when disabled", () => {
        const onPressedChange = vi.fn();
        render(
            <Toggle disabled onPressedChange={onPressedChange}>
                Bold
            </Toggle>,
        );
        fireEvent.click(screen.getByRole("button"));
        expect(onPressedChange).not.toHaveBeenCalled();
    });

    it("forwards className", () => {
        render(<Toggle className="custom">Bold</Toggle>);
        expect(screen.getByRole("button").className).toContain("custom");
    });
});
