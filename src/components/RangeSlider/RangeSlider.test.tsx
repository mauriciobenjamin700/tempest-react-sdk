import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RangeSlider } from "./RangeSlider";

describe("RangeSlider", () => {
    it("renders two range inputs", () => {
        render(<RangeSlider value={[10, 50]} onChange={vi.fn()} />);
        expect(screen.getAllByRole("slider")).toHaveLength(2);
    });

    it("clamps low not to exceed high", () => {
        const onChange = vi.fn();
        render(<RangeSlider value={[10, 50]} onChange={onChange} max={100} />);
        const inputs = screen.getAllByRole("slider");
        fireEvent.change(inputs[0], { target: { value: "80" } });
        expect(onChange).toHaveBeenCalledWith([50, 50]);
    });

    it("clamps high not to go below low", () => {
        const onChange = vi.fn();
        render(<RangeSlider value={[40, 60]} onChange={onChange} />);
        const inputs = screen.getAllByRole("slider");
        fireEvent.change(inputs[1], { target: { value: "10" } });
        expect(onChange).toHaveBeenCalledWith([40, 40]);
    });

    it("renders label + formatValue", () => {
        render(
            <RangeSlider
                value={[20, 80]}
                onChange={vi.fn()}
                label="Preço"
                formatValue={([lo, hi]) => `R$${lo} – R$${hi}`}
            />,
        );
        expect(screen.getByText("Preço")).toBeInTheDocument();
        expect(screen.getByText("R$20 – R$80")).toBeInTheDocument();
    });
});
