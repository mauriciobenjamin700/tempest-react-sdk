import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { centsFromDigits, useMoneyMask } from "./money-mask";

function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe("centsFromDigits", () => {
    it("reads every digit as a cent position, bank-app style", () => {
        expect(centsFromDigits("1")).toBe(1);
        expect(centsFromDigits("1234")).toBe(1234);
        expect(centsFromDigits("R$ 12,345")).toBe(12345);
    });

    it("keeps only the digits of a paste", () => {
        expect(centsFromDigits("R$ 1.234,56 (à vista)")).toBe(123456);
    });

    it("answers null when no digit or only zeros are left", () => {
        expect(centsFromDigits("")).toBeNull();
        expect(centsFromDigits("R$ ")).toBeNull();
        expect(centsFromDigits("R$ 0,00")).toBeNull();
    });

    it("ignores a digit that would pass maxCents instead of clamping", () => {
        expect(centsFromDigits("9999", 1000)).toBe(999);
        expect(centsFromDigits("1000", 1000)).toBe(1000);
        expect(centsFromDigits("50000", 1000)).toBe(500);
    });

    it("never returns an integer Number cannot hold exactly", () => {
        const cents = centsFromDigits("12345678901234567890");
        expect(Number.isSafeInteger(cents)).toBe(true);
        expect(cents).toBe(1234567890123456);
    });

    it("rejects a negative or NaN ceiling", () => {
        expect(() => centsFromDigits("1", -1)).toThrow(RangeError);
        expect(() => centsFromDigits("1", Number.NaN)).toThrow(RangeError);
    });
});

function Headless({ initial = null, maxCents }: { initial?: number | null; maxCents?: number }) {
    const [cents, setCents] = useState<number | null>(initial);
    const mask = useMoneyMask({ value: cents, onChange: setCents, maxCents });
    return (
        <>
            <input {...mask} placeholder="valor" />
            <output data-testid="cents">{String(cents)}</output>
        </>
    );
}

describe("useMoneyMask", () => {
    it("renders null as an empty field so the placeholder shows", () => {
        render(<Headless />);
        const input = screen.getByPlaceholderText("valor") as HTMLInputElement;
        expect(input.value).toBe("");
        expect(input.inputMode).toBe("numeric");
        expect(input.type).toBe("text");
    });

    it("enters digits from the right as cents and reports null once emptied", () => {
        render(<Headless />);
        const input = screen.getByPlaceholderText("valor") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "1" } });
        expect(input.value).toBe("R$ 0,01");
        fireEvent.change(input, { target: { value: "R$ 0,012" } });
        expect(input.value).toBe("R$ 0,12");
        expect(screen.getByTestId("cents").textContent).toBe("12");
        fireEvent.change(input, { target: { value: "R$ 0,1" } });
        fireEvent.change(input, { target: { value: "R$ 0," } });
        expect(input.value).toBe("");
        expect(screen.getByTestId("cents").textContent).toBe("null");
    });

    it("leaves the amount unchanged when a typed digit would pass maxCents", () => {
        render(<Headless initial={999} maxCents={1000} />);
        const input = screen.getByPlaceholderText("valor") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "R$ 9,999" } });
        expect(screen.getByTestId("cents").textContent).toBe("999");
        expect(input.value).toBe("R$ 9,99");
    });

    it("moves a caret placed in the middle back to the end on click", () => {
        render(<Headless initial={1234} />);
        const input = screen.getByPlaceholderText("valor") as HTMLInputElement;
        input.focus();
        input.setSelectionRange(4, 4);
        fireEvent.click(input);
        expect(input.selectionStart).toBe(input.value.length);
    });

    it("moves a caret placed in the middle back to the end on select", () => {
        render(<Headless initial={1234} />);
        const input = screen.getByPlaceholderText("valor") as HTMLInputElement;
        input.focus();
        input.setSelectionRange(3, 3);
        fireEvent.select(input);
        expect(input.selectionEnd).toBe(input.value.length);
    });

    it("keeps a select-all so a paste still replaces the whole amount", () => {
        render(<Headless initial={1234} />);
        const input = screen.getByPlaceholderText("valor") as HTMLInputElement;
        input.focus();
        input.setSelectionRange(0, input.value.length);
        fireEvent.click(input);
        expect([input.selectionStart, input.selectionEnd]).toEqual([0, input.value.length]);
    });

    it("puts the caret at the end one frame after focus and after an edit", async () => {
        render(<Headless initial={1234} />);
        const input = screen.getByPlaceholderText("valor") as HTMLInputElement;
        input.focus();
        input.setSelectionRange(2, 2);
        fireEvent.focus(input);
        await nextFrame();
        expect(input.selectionStart).toBe(input.value.length);
        fireEvent.change(input, { target: { value: "R$ 12,345" } });
        input.setSelectionRange(1, 1);
        await nextFrame();
        expect(input.selectionStart).toBe(input.value.length);
    });

    it("leaves the caret alone when the input is not focused", () => {
        render(<Headless initial={1234} />);
        const input = screen.getByPlaceholderText("valor") as HTMLInputElement;
        input.setSelectionRange(2, 2);
        fireEvent.click(input);
        expect(input.selectionStart).toBe(2);
    });
});
