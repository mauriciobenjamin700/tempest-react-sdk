import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StepperInput } from "./StepperInput";

describe("StepperInput", () => {
    it("renders the current value", () => {
        render(<StepperInput value={3} onChange={() => {}} />);
        expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("increments by step", async () => {
        const onChange = vi.fn();
        render(<StepperInput value={5} onChange={onChange} step={2} />);
        await userEvent.click(screen.getByLabelText("Aumentar"));
        expect(onChange).toHaveBeenCalledWith(7);
    });

    it("decrements by step", async () => {
        const onChange = vi.fn();
        render(<StepperInput value={5} onChange={onChange} />);
        await userEvent.click(screen.getByLabelText("Diminuir"));
        expect(onChange).toHaveBeenCalledWith(4);
    });

    it("clamps to min", async () => {
        const onChange = vi.fn();
        render(<StepperInput value={1} onChange={onChange} min={1} />);
        expect(screen.getByLabelText("Diminuir")).toBeDisabled();
        await userEvent.click(screen.getByLabelText("Diminuir"));
        expect(onChange).not.toHaveBeenCalled();
    });

    it("clamps to max", async () => {
        const onChange = vi.fn();
        render(<StepperInput value={10} onChange={onChange} max={10} />);
        expect(screen.getByLabelText("Aumentar")).toBeDisabled();
    });

    it("respects disabled prop", async () => {
        const onChange = vi.fn();
        render(<StepperInput value={5} onChange={onChange} disabled />);
        await userEvent.click(screen.getByLabelText("Aumentar"));
        expect(onChange).not.toHaveBeenCalled();
    });

    it("renders via format()", () => {
        render(<StepperInput value={3} onChange={() => {}} format={(n) => `${n} un.`} />);
        expect(screen.getByText("3 un.")).toBeInTheDocument();
    });
});
