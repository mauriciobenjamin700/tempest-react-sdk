import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tooltip, type TooltipPlacement } from "./Tooltip";

describe("Tooltip placements", () => {
    it.each<TooltipPlacement>(["top", "bottom", "left", "right"])(
        "renders with placement=%s",
        async (placement) => {
            render(
                <Tooltip content="info" placement={placement} openDelay={0}>
                    <button>btn</button>
                </Tooltip>,
            );
            fireEvent.mouseEnter(screen.getByRole("button"));
            const tip = await screen.findByRole("tooltip");
            expect(tip.className).toContain(placement);
        },
    );
});
