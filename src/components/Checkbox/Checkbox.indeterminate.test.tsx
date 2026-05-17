import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Checkbox } from "./Checkbox";

describe("Checkbox indeterminate + ref forwarding", () => {
    it("toggles indeterminate via prop change", () => {
        const { rerender } = render(<Checkbox label="x" />);
        const input = screen.getByRole("checkbox") as HTMLInputElement;
        expect(input.indeterminate).toBe(false);
        rerender(<Checkbox label="x" indeterminate />);
        expect(input.indeterminate).toBe(true);
        rerender(<Checkbox label="x" />);
        expect(input.indeterminate).toBe(false);
    });

    it("forwards ref to the underlying input", () => {
        const ref = createRef<HTMLInputElement>();
        render(<Checkbox label="x" ref={ref} />);
        expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });
});
