import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";
import { useErrorHandler } from "./use-error-handler";

function Trigger() {
    const throwError = useErrorHandler();
    return <button onClick={() => throwError(new Error("async"))}>boom</button>;
}

describe("useErrorHandler", () => {
    it("re-throws into the nearest ErrorBoundary", async () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        render(
            <ErrorBoundary fallback={<span>caught</span>}>
                <Trigger />
            </ErrorBoundary>,
        );
        await userEvent.click(screen.getByRole("button", { name: "boom" }));
        expect(screen.getByText("caught")).toBeInTheDocument();
        spy.mockRestore();
    });
});
