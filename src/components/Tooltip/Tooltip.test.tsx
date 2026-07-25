import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tooltip } from "./Tooltip";

const DELAY = 60;

/** Waits past the open delay using real time — fake timers deadlock user-event. */
function pastDelay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, DELAY * 4));
}

/** Parent that can be re-rendered from the outside, mid-delay. */
function Host() {
    const [, setTick] = useState(0);
    return (
        <>
            <button onClick={() => setTick((value) => value + 1)}>re-render</button>
            <Tooltip content="info" openDelay={DELAY}>
                <button>Btn</button>
            </Tooltip>
        </>
    );
}

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

    it("does not open when the pointer leaves before the delay", async () => {
        render(
            <Tooltip content="info" openDelay={DELAY}>
                <button>Btn</button>
            </Tooltip>,
        );
        const btn = screen.getByRole("button");

        await userEvent.hover(btn);
        await userEvent.unhover(btn);
        await pastDelay();

        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("still cancels the pending open after a re-render during the delay", async () => {
        // Regression guard: the timer handle used to live in a `let` in the component
        // body, so this re-render replaced the binding, `clearTimeout` cancelled
        // nothing, and the tooltip opened with the pointer already gone.
        render(<Host />);
        const trigger = screen.getByRole("button", { name: "Btn" });

        await userEvent.hover(trigger);
        await userEvent.click(screen.getByRole("button", { name: "re-render" }));
        await userEvent.unhover(trigger);
        await pastDelay();

        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("opens after the delay when the pointer stays", async () => {
        render(
            <Tooltip content="info" openDelay={DELAY}>
                <button>Btn</button>
            </Tooltip>,
        );

        await userEvent.hover(screen.getByRole("button"));
        await pastDelay();

        expect(screen.getByRole("tooltip")).toHaveTextContent("info");
    });
});
