import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./ToastProvider";

function Trigger() {
    const toast = useToast();
    return <button onClick={() => toast.warning("careful", { title: "Heads up" })}>fire</button>;
}

describe("ToastProvider dismiss", () => {
    it("renders and dismisses a toast", async () => {
        render(
            <ToastProvider defaultDuration={0}>
                <Trigger />
            </ToastProvider>,
        );
        await userEvent.click(screen.getByText("fire"));
        expect(screen.getByText("Heads up")).toBeInTheDocument();
        await userEvent.click(screen.getByLabelText("Fechar notificação"));
        expect(screen.queryByText("Heads up")).not.toBeInTheDocument();
    });

    /**
     * #768: on a real clock the 30 ms `duration` ran out during `userEvent.click`
     * under load (three full suites together), so the toast was already gone when
     * the test looked for it. A stopped fake clock makes "shown" and "gone after
     * `duration`" two states the test moves between, not a race against the click.
     */
    it("auto-dismisses after duration", () => {
        function FastTrigger() {
            const toast = useToast();
            return <button onClick={() => toast.info("auto", { duration: 30 })}>fire</button>;
        }
        vi.useFakeTimers();
        try {
            render(
                <ToastProvider>
                    <FastTrigger />
                </ToastProvider>,
            );
            fireEvent.click(screen.getByText("fire"));
            act(() => {
                vi.advanceTimersByTime(29);
            });
            expect(screen.getByText("auto")).toBeInTheDocument();
            act(() => {
                vi.advanceTimersByTime(31);
            });
            expect(screen.queryByText("auto")).not.toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });
});
