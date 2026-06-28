import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Slider } from "./Slider";

describe("Slider", () => {
    it("renders the label and formatted value", () => {
        render(
            <Slider value={30} onChange={() => {}} label="Volume" formatValue={(v) => `${v}%`} />,
        );
        expect(screen.getByText("Volume")).toBeInTheDocument();
        expect(screen.getByText("30%")).toBeInTheDocument();
    });

    it("fires onChange with the numeric value", () => {
        const onChange = vi.fn();
        render(<Slider value={10} onChange={onChange} min={0} max={100} />);
        fireEvent.change(screen.getByRole("slider"), { target: { value: "42" } });
        expect(onChange).toHaveBeenCalledWith(42);
    });

    it("reflects value as a range input within bounds", () => {
        render(<Slider value={50} onChange={() => {}} min={0} max={200} />);
        const input = screen.getByRole("slider") as HTMLInputElement;
        expect(input.value).toBe("50");
        expect(input.min).toBe("0");
        expect(input.max).toBe("200");
    });

    it("can be disabled", () => {
        render(<Slider value={5} onChange={() => {}} disabled />);
        expect(screen.getByRole("slider")).toBeDisabled();
    });
});
