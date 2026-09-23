import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Popover } from "./Popover";

describe("Popover in a portal", () => {
    it("renders the panel outside the trigger wrapper, so an overflow ancestor cannot clip it", async () => {
        const { container } = render(
            <div style={{ overflow: "auto" }}>
                <Popover trigger={<button type="button">open</button>}>body</Popover>
            </div>,
        );
        await userEvent.click(screen.getByText("open"));
        const panel = screen.getByRole("dialog");
        expect(container.contains(panel)).toBe(false);
        expect(panel.style.position).toBe("fixed");
    });

    it("keeps the panel in flow when portal is false", async () => {
        const { container } = render(
            <Popover portal={false} trigger={<button type="button">open</button>}>
                body
            </Popover>,
        );
        await userEvent.click(screen.getByText("open"));
        expect(container.contains(screen.getByRole("dialog"))).toBe(true);
    });

    it("stays open on a press inside the portalled panel", async () => {
        const onOpenChange = vi.fn();
        render(
            <Popover trigger={<button type="button">open</button>} onOpenChange={onOpenChange}>
                <input aria-label="field" />
            </Popover>,
        );
        await userEvent.click(screen.getByText("open"));
        fireEvent.mouseDown(screen.getByLabelText("field"));
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(onOpenChange).toHaveBeenLastCalledWith(true);
    });

    it("puts the portalled panel right after its trigger in the tab order", async () => {
        render(
            <>
                <Popover trigger={<button type="button">open</button>}>
                    <input aria-label="first" />
                    <input aria-label="last" />
                </Popover>
                <button type="button">after</button>
            </>,
        );
        await userEvent.click(screen.getByText("open"));
        await userEvent.tab();
        expect(screen.getByLabelText("first")).toHaveFocus();
        await userEvent.tab();
        expect(screen.getByLabelText("last")).toHaveFocus();
        await userEvent.tab();
        expect(screen.getByText("after")).toHaveFocus();
    });

    it("walks back from the panel to the trigger, and from the next stop into the panel", async () => {
        render(
            <>
                <Popover trigger={<button type="button">open</button>}>
                    <input aria-label="first" />
                    <input aria-label="last" />
                </Popover>
                <button type="button">after</button>
            </>,
        );
        await userEvent.click(screen.getByText("open"));
        screen.getByText("after").focus();
        await userEvent.tab({ shift: true });
        expect(screen.getByLabelText("last")).toHaveFocus();
        await userEvent.tab({ shift: true });
        expect(screen.getByLabelText("first")).toHaveFocus();
        await userEvent.tab({ shift: true });
        expect(screen.getByText("open")).toHaveFocus();
    });

    it("leaves the tab order alone when the panel has nothing to focus", async () => {
        render(
            <>
                <Popover trigger={<button type="button">open</button>}>plain text</Popover>
                <button type="button">after</button>
            </>,
        );
        await userEvent.click(screen.getByText("open"));
        await userEvent.tab();
        expect(screen.getByText("after")).toHaveFocus();
    });
});
