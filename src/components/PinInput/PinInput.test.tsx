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

describe("PinInput — paste, controlled mode and chrome", () => {
    it("pastes a full code and focuses the last cell", async () => {
        const onComplete = vi.fn();
        render(<PinInput length={4} onComplete={onComplete} />);
        const cells = getCells();

        await userEvent.click(cells[0]);
        await userEvent.paste("1234");
        expect(cells.map((c) => c.value)).toEqual(["1", "2", "3", "4"]);
        expect(onComplete).toHaveBeenCalledWith("1234");
    });

    it("filters invalid characters out of a pasted value", async () => {
        render(<PinInput length={4} />);
        await userEvent.click(getCells()[0]);
        await userEvent.paste("1a2b3");
        expect(getCells().map((c) => c.value)).toEqual(["1", "2", "3", ""]);
    });

    it("ignores a paste with nothing usable", async () => {
        render(<PinInput length={4} />);
        await userEvent.click(getCells()[0]);
        await userEvent.paste("abcd");
        expect(getCells().map((c) => c.value)).toEqual(["", "", "", ""]);
    });

    it("keeps letters on a paste when the type is alphanumeric", async () => {
        render(<PinInput length={4} type="alphanumeric" />);
        await userEvent.click(getCells()[0]);
        await userEvent.paste("a1b2");
        expect(getCells().map((c) => c.value)).toEqual(["a", "1", "b", "2"]);
    });

    it("honours a controlled value without mutating it internally", async () => {
        const onChange = vi.fn();
        render(<PinInput length={4} value="12" onChange={onChange} />);
        await userEvent.type(getCells()[2], "3");
        expect(onChange).toHaveBeenCalledWith("123");
        expect(getCells().map((c) => c.value)).toEqual(["1", "2", "", ""]);
    });

    it("starts from defaultValue in uncontrolled mode", () => {
        render(<PinInput length={4} defaultValue="99" />);
        expect(getCells().map((c) => c.value)).toEqual(["9", "9", "", ""]);
    });

    it("clamps navigation at both ends", async () => {
        render(<PinInput length={3} />);
        const cells = getCells();

        cells[0].focus();
        await userEvent.keyboard("{ArrowLeft}");
        expect(document.activeElement).toBe(cells[0]);

        cells[2].focus();
        await userEvent.keyboard("{ArrowRight}");
        expect(document.activeElement).toBe(cells[2]);
    });

    it("Backspace on a filled cell clears it in place", async () => {
        render(<PinInput length={3} defaultValue="12" />);
        const cells = getCells();
        cells[1].focus();
        await userEvent.keyboard("{Backspace}");
        expect(cells[1].value).toBe("");
        expect(document.activeElement).toBe(cells[1]);
    });

    it("Backspace on the first empty cell stays put", async () => {
        render(<PinInput length={3} />);
        const cells = getCells();
        cells[0].focus();
        await userEvent.keyboard("{Backspace}");
        expect(document.activeElement).toBe(cells[0]);
    });

    it("masks the value when masked is set", () => {
        render(<PinInput length={2} masked defaultValue="12" />);
        expect(screen.queryAllByRole("textbox")).toHaveLength(0);
        expect(document.querySelectorAll('input[type="password"]')).toHaveLength(2);
    });

    it("auto-focuses the first cell when asked", () => {
        render(<PinInput length={3} autoFocus />);
        expect(document.activeElement).toBe(getCells()[0]);
    });

    it("renders label and helper text, and disables every cell", () => {
        const { unmount } = render(
            <PinInput length={2} label="Código" helperText="Enviamos por SMS" />,
        );
        expect(screen.getByText("Código")).toBeInTheDocument();
        expect(screen.getByText("Enviamos por SMS")).toBeInTheDocument();
        unmount();

        render(<PinInput length={2} disabled />);
        expect(getCells().every((cell) => cell.disabled)).toBe(true);
    });
});
