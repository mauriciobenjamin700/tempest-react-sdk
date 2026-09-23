import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tooltip } from "./Tooltip";

describe("Tooltip in a portal", () => {
    it("renders the bubble outside the trigger wrapper, so an overflow ancestor cannot clip it", async () => {
        const { container } = render(
            <div style={{ overflow: "auto" }}>
                <Tooltip content="info" openDelay={0}>
                    <button>btn</button>
                </Tooltip>
            </div>,
        );
        fireEvent.mouseEnter(screen.getByRole("button"));
        const tip = await screen.findByRole("tooltip");
        expect(container.contains(tip)).toBe(false);
        expect(tip.style.position).toBe("fixed");
        expect(screen.getByRole("button")).toHaveAttribute("aria-describedby", tip.id);
    });

    it("keeps the bubble in flow when portal is false", async () => {
        const { container } = render(
            <Tooltip content="info" openDelay={0} portal={false}>
                <button>btn</button>
            </Tooltip>,
        );
        fireEvent.mouseEnter(screen.getByRole("button"));
        expect(container.contains(await screen.findByRole("tooltip"))).toBe(true);
    });
});
