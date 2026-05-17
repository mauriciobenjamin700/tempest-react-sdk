import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom({ enabled }: { enabled: boolean }) {
    if (enabled) throw new Error("kaboom");
    return <span>safe</span>;
}

describe("ErrorBoundary reset", () => {
    it("auto-resets when a value in resetKeys changes", async () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        function Wrapper() {
            const [tick, setTick] = useState(0);
            const [boom, setBoom] = useState(true);
            return (
                <>
                    <button onClick={() => { setBoom(false); setTick((t) => t + 1); }}>
                        reset
                    </button>
                    <ErrorBoundary resetKeys={[tick]} fallback={<span>caught</span>}>
                        <Boom enabled={boom} />
                    </ErrorBoundary>
                </>
            );
        }
        render(<Wrapper />);
        expect(screen.getByText("caught")).toBeInTheDocument();
        await userEvent.click(screen.getByText("reset"));
        expect(screen.getByText("safe")).toBeInTheDocument();
        spy.mockRestore();
    });

    it("static fallback is rendered when no render-prop", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        render(
            <ErrorBoundary fallback={<span>static-fallback</span>}>
                <Boom enabled />
            </ErrorBoundary>,
        );
        expect(screen.getByText("static-fallback")).toBeInTheDocument();
        spy.mockRestore();
    });
});

