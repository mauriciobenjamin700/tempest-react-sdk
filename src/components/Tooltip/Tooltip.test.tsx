import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tooltip } from "./Tooltip";

describe("Tooltip", () => {
    it("shows on hover and hides on leave", async () => {
        render(
            <Tooltip content="info" openDelay={0}>
                <button>Btn</button>
            </Tooltip>,
        );
        const btn = screen.getByRole("button");
        await userEvent.hover(btn);
        expect(await screen.findByRole("tooltip")).toHaveTextContent("info");
        await userEvent.unhover(btn);
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
});
