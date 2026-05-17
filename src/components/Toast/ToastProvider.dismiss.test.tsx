import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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

    it("auto-dismisses after duration", async () => {
        function FastTrigger() {
            const toast = useToast();
            return <button onClick={() => toast.info("auto", { duration: 30 })}>fire</button>;
        }
        render(
            <ToastProvider>
                <FastTrigger />
            </ToastProvider>,
        );
        await userEvent.click(screen.getByText("fire"));
        expect(screen.getByText("auto")).toBeInTheDocument();
        await act(async () => {
            await new Promise((r) => setTimeout(r, 60));
        });
        expect(screen.queryByText("auto")).not.toBeInTheDocument();
    });
});
