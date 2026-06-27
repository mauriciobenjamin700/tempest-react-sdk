import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
});
