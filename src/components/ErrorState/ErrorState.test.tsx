import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "./ErrorState";

describe("ErrorState", () => {
    it("renders defaults", () => {
        render(<ErrorState />);
        expect(screen.getByText(/Algo deu errado/i)).toBeInTheDocument();
    });

    it("fires onRetry when button clicked", async () => {
        const onRetry = vi.fn();
        render(<ErrorState onRetry={onRetry} retryLabel="Retry" />);
        await userEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(onRetry).toHaveBeenCalled();
    });
});
