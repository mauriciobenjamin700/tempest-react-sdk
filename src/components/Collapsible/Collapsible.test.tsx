import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Collapsible } from "./Collapsible";

describe("Collapsible", () => {
    it("renders a trigger button wired to the content region", () => {
        render(
            <Collapsible trigger="Details">
                <p>Hidden content</p>
            </Collapsible>,
        );
        const trigger = screen.getByRole("button", { name: "Details" });
        const region = screen.getByRole("region", { hidden: true });
        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(trigger.getAttribute("aria-controls")).toBe(region.getAttribute("id"));
    });

    it("is closed by default and hides content", () => {
        render(
            <Collapsible trigger="Details">
                <p>Hidden content</p>
            </Collapsible>,
        );
        expect(screen.getByRole("region", { hidden: true })).not.toBeVisible();
    });

    it("toggles content visibility and aria-expanded on click", () => {
        render(
            <Collapsible trigger="Details">
                <p>Hidden content</p>
            </Collapsible>,
        );
        const trigger = screen.getByRole("button");
        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("region")).toBeVisible();

        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(screen.getByRole("region", { hidden: true })).not.toBeVisible();
    });

    it("honors defaultOpen", () => {
        render(
            <Collapsible defaultOpen trigger="Details">
                <p>Hidden content</p>
            </Collapsible>,
        );
        expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("region")).toBeVisible();
    });

    it("respects controlled open and does not self-update", () => {
        const onOpenChange = vi.fn();
        render(
            <Collapsible open={false} onOpenChange={onOpenChange} trigger="Details">
                <p>Hidden content</p>
            </Collapsible>,
        );
        const trigger = screen.getByRole("button");
        fireEvent.click(trigger);
        expect(onOpenChange).toHaveBeenCalledWith(true);
        expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    it("forwards className", () => {
        const { container } = render(
            <Collapsible className="custom" trigger="Details">
                <p>Hidden content</p>
            </Collapsible>,
        );
        expect((container.firstChild as HTMLElement).className).toContain("custom");
    });
});
