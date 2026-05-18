import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PinInput } from "./PinInput";

function getCells(): HTMLInputElement[] {
    return screen.getAllByRole("textbox") as HTMLInputElement[];
}

describe("PinInput", () => {
    it("renders the requested number of cells", () => {
        render(<PinInput length={4} />);
        expect(getCells()).toHaveLength(4);
    });

    it("auto-advances on input", async () => {
        const onChange = vi.fn();
        render(<PinInput length={4} onChange={onChange} />);
        const cells = getCells();
        await userEvent.type(cells[0], "1");
        expect(onChange).toHaveBeenLastCalledWith("1");
        expect(document.activeElement).toBe(cells[1]);
    });

    it("rejects non-numeric chars when type='numeric'", async () => {
        const onChange = vi.fn();
        render(<PinInput length={4} onChange={onChange} />);
        await userEvent.type(getCells()[0], "a");
        expect(onChange).not.toHaveBeenCalled();
    });

    it("accepts letters when type='alphanumeric'", async () => {
        const onChange = vi.fn();
        render(<PinInput length={4} type="alphanumeric" onChange={onChange} />);
        await userEvent.type(getCells()[0], "a");
        expect(onChange).toHaveBeenLastCalledWith("a");
    });

    it("fires onComplete when last cell filled", async () => {
        const onComplete = vi.fn();
        render(<PinInput length={3} onComplete={onComplete} />);
        const cells = getCells();
        await userEvent.type(cells[0], "1");
        await userEvent.type(cells[1], "2");
        await userEvent.type(cells[2], "3");
        expect(onComplete).toHaveBeenCalledWith("123");
    });

    it("backspace on empty cell focuses previous and clears it", async () => {
        render(<PinInput length={3} defaultValue="12" />);
        const cells = getCells();
        cells[2].focus();
        await userEvent.keyboard("{Backspace}");
        expect(document.activeElement).toBe(cells[1]);
    });

    it("arrow keys navigate between cells", async () => {
        render(<PinInput length={4} />);
        const cells = getCells();
        cells[1].focus();
        await userEvent.keyboard("{ArrowRight}");
        expect(document.activeElement).toBe(cells[2]);
        await userEvent.keyboard("{ArrowLeft}");
        expect(document.activeElement).toBe(cells[1]);
    });

    it("shows error message and aria-invalid", () => {
        render(<PinInput length={4} error="invalid" />);
        expect(screen.getByText("invalid")).toBeInTheDocument();
        const cells = getCells();
        expect(cells[0]).toHaveAttribute("aria-invalid", "true");
    });
});
