import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tooltip } from "./Tooltip";

describe("Tooltip — disabled + focus", () => {
    it("does not show when disabled", () => {
        render(
            <Tooltip content="info" disabled openDelay={0}>
                <button>btn</button>
            </Tooltip>,
        );
        fireEvent.mouseEnter(screen.getByRole("button"));
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("shows on focus", async () => {
        render(
            <Tooltip content="focus-info" openDelay={0}>
                <button>btn</button>
            </Tooltip>,
        );
        fireEvent.focus(screen.getByRole("button"));
        expect(await screen.findByRole("tooltip")).toHaveTextContent("focus-info");
    });
});
