import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Radio, RadioGroup } from "./Radio";

describe("Radio standalone + disabled", () => {
    it("forwards onChange when used without RadioGroup", async () => {
        const onChange = vi.fn();
        render(<Radio value="x" name="g" label="X" onChange={onChange} />);
        await userEvent.click(screen.getByLabelText("X"));
        expect(onChange).toHaveBeenCalled();
    });

    it("respects group-level disabled", () => {
        render(
            <RadioGroup disabled value="a">
                <Radio value="a" label="A" />
            </RadioGroup>,
        );
        const input = screen.getByLabelText("A") as HTMLInputElement;
        expect(input).toBeDisabled();
    });

    it("uses uncontrolled defaultValue", () => {
        render(
            <RadioGroup defaultValue="b">
                <Radio value="a" label="A" />
                <Radio value="b" label="B" />
            </RadioGroup>,
        );
        expect((screen.getByLabelText("B") as HTMLInputElement).checked).toBe(true);
    });

    it("RadioGroup horizontal applies class", () => {
        const { container } = render(
            <RadioGroup horizontal defaultValue="a">
                <Radio value="a" label="A" />
            </RadioGroup>,
        );
        const group = container.querySelector('[role="radiogroup"]');
        expect(group?.className).toContain("horizontal");
    });
});
