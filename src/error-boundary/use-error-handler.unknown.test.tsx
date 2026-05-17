import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";
import { useErrorHandler } from "./use-error-handler";

function Trigger() {
    const throwError = useErrorHandler();
    return <button onClick={() => throwError("string-not-error")}>boom</button>;
}

describe("useErrorHandler with non-Error", () => {
    it("wraps non-Error values into Error and re-throws", async () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        render(
            <ErrorBoundary fallback={({ error }) => <span>{error.message}</span>}>
                <Trigger />
            </ErrorBoundary>,
        );
        await userEvent.click(screen.getByRole("button", { name: "boom" }));
        expect(screen.getByText("string-not-error")).toBeInTheDocument();
        spy.mockRestore();
    });
});
