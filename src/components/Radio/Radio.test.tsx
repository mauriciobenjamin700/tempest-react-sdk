import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Radio, RadioGroup } from "./Radio";

describe("RadioGroup", () => {
    it("controlled selection switches via onChange", async () => {
        const onChange = vi.fn();
        render(
            <RadioGroup value="a" onChange={onChange}>
                <Radio value="a" label="A" />
                <Radio value="b" label="B" />
            </RadioGroup>,
        );
        await userEvent.click(screen.getByLabelText("B"));
        expect(onChange).toHaveBeenCalledWith("b");
    });

    it("renders radiogroup role", () => {
        render(
            <RadioGroup defaultValue="a">
                <Radio value="a" label="A" />
                <Radio value="b" label="B" />
            </RadioGroup>,
        );
        expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    });
});
