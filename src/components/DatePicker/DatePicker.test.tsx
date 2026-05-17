import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DatePicker } from "./DatePicker";

describe("DatePicker", () => {
    it("renders type=date by default", () => {
        const { container } = render(
            <DatePicker value="2026-05-16" onChange={vi.fn()} label="Date" />,
        );
        const input = container.querySelector("input");
        expect(input?.type).toBe("date");
    });

    it("forwards onChange with new value", () => {
        const onChange = vi.fn();
        render(<DatePicker value="" onChange={onChange} placeholder="d" mode="month" />);
        const input = screen.getByPlaceholderText("d") as HTMLInputElement;
        expect(input.type).toBe("month");
        fireEvent.change(input, { target: { value: "2026-05" } });
        expect(onChange).toHaveBeenCalledWith("2026-05");
    });
});
