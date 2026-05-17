import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Popover } from "./Popover";

describe("Popover", () => {
    it("toggles on trigger click", async () => {
        render(
            <Popover trigger={<button type="button">trig</button>}>
                <span>panel</span>
            </Popover>,
        );
        expect(screen.queryByText("panel")).not.toBeInTheDocument();
        await userEvent.click(screen.getByText("trig"));
        expect(screen.getByText("panel")).toBeInTheDocument();
    });

    it("closes on outside click", async () => {
        render(
            <div>
                <Popover trigger={<button type="button">trig</button>}>
                    <span>panel</span>
                </Popover>
                <div data-testid="outside">outside</div>
            </div>,
        );
        await userEvent.click(screen.getByText("trig"));
        expect(screen.getByText("panel")).toBeInTheDocument();
        await userEvent.click(screen.getByTestId("outside"));
        expect(screen.queryByText("panel")).not.toBeInTheDocument();
    });

    it("closes on Escape", async () => {
        render(
            <Popover trigger={<button type="button">trig</button>}>
                <span>panel</span>
            </Popover>,
        );
        await userEvent.click(screen.getByText("trig"));
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByText("panel")).not.toBeInTheDocument();
    });

    it("controlled via open + onOpenChange", async () => {
        const onOpenChange = vi.fn();
        const { rerender } = render(
            <Popover
                trigger={<button type="button">trig</button>}
                open={false}
                onOpenChange={onOpenChange}
            >
                <span>panel</span>
            </Popover>,
        );
        await userEvent.click(screen.getByText("trig"));
        expect(onOpenChange).toHaveBeenCalledWith(true);
        rerender(
            <Popover trigger={<button type="button">trig</button>} open onOpenChange={onOpenChange}>
                <span>panel</span>
            </Popover>,
        );
        expect(screen.getByText("panel")).toBeInTheDocument();
    });
});
