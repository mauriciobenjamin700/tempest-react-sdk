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

    it("names itself with aria-label when no visible label fits", () => {
        render(<Slider value={5} onChange={() => {}} aria-label="Volume de Ana" />);
        expect(screen.getByRole("slider")).toHaveAccessibleName("Volume de Ana");
        expect(screen.queryByText("Volume de Ana")).not.toBeInTheDocument();
    });

    it("lets aria-label win over the visible label", () => {
        render(<Slider value={5} onChange={() => {}} label="Volume" aria-label="Volume de Ana" />);
        expect(screen.getByRole("slider")).toHaveAccessibleName("Volume de Ana");
        expect(screen.getByText("Volume")).toBeInTheDocument();
    });

    it("falls back to the visible label, then to Slider", () => {
        const { rerender } = render(<Slider value={5} onChange={() => {}} label="Volume" />);
        expect(screen.getByRole("slider")).toHaveAccessibleName("Volume");
        rerender(<Slider value={5} onChange={() => {}} />);
        expect(screen.getByRole("slider")).toHaveAccessibleName("Slider");
    });

    it("can be disabled", () => {
        render(<Slider value={5} onChange={() => {}} disabled />);
        expect(screen.getByRole("slider")).toBeDisabled();
    });
});
