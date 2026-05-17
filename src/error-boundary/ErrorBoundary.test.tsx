import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): never {
    throw new Error("boom");
}

describe("ErrorBoundary", () => {
    it("renders children when no error", () => {
        render(
            <ErrorBoundary fallback={<span>fallback</span>}>
                <span>ok</span>
            </ErrorBoundary>,
        );
        expect(screen.getByText("ok")).toBeInTheDocument();
    });

    it("renders fallback on error and calls onError", () => {
        const onError = vi.fn();
        const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        render(
            <ErrorBoundary
                onError={onError}
                fallback={({ error }) => <span>err:{error.message}</span>}
            >
                <Boom />
            </ErrorBoundary>,
        );
        expect(screen.getByText("err:boom")).toBeInTheDocument();
        expect(onError).toHaveBeenCalled();
        spy.mockRestore();
    });
});
