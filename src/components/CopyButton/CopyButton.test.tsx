import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./CopyButton";

describe("CopyButton", () => {
    let writeText: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("renders the default label", () => {
        render(<CopyButton value="hello" />);
        expect(screen.getByRole("button")).toHaveTextContent("Copy");
    });

    it("copies value and flips the label on click", async () => {
        const onCopied = vi.fn();
        render(<CopyButton value="hello" onCopied={onCopied} />);

        fireEvent.click(screen.getByRole("button"));

        await waitFor(() => expect(writeText).toHaveBeenCalledWith("hello"));
        await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("Copied"));
        expect(onCopied).toHaveBeenCalledTimes(1);
    });

    it("renders custom children", () => {
        render(<CopyButton value="x">Copiar link</CopyButton>);
        expect(screen.getByRole("button")).toHaveTextContent("Copiar link");
    });

    it("goes back to the idle label after the timeout, and restarts it on a second copy", async () => {
        vi.useFakeTimers();
        render(<CopyButton value="abc" timeout={2000} />);
        const button = screen.getByRole("button");

        await act(async () => {
            fireEvent.click(button);
        });
        expect(button).toHaveTextContent(/copied/i);

        await act(async () => {
            fireEvent.click(button);
        });
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(button, "the second copy restarted the countdown").toHaveTextContent(/copied/i);

        act(() => {
            vi.advanceTimersByTime(1500);
        });
        expect(button).toHaveTextContent(/copy/i);

        vi.useRealTimers();
    });
});
