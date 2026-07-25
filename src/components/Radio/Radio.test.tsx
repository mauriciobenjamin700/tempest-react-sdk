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

describe("Radio — label, description and uncontrolled mode", () => {
    it("renders a description next to the label", () => {
        render(<Radio name="p" value="a" label="Plano A" description="Ideal pra começar" />);
        expect(screen.getByText("Ideal pra começar")).toBeInTheDocument();
    });

    it("renders neither wrapper without label or description", () => {
        const { container } = render(<Radio name="p" value="a" aria-label="sem rótulo" />);
        expect(container.querySelector("[class*='labelWrap']")).toBeNull();
    });

    it("tracks its own state when uncontrolled inside a group", async () => {
        render(
            <RadioGroup name="plan" defaultValue="a">
                <Radio value="a" label="A" />
                <Radio value="b" label="B" />
            </RadioGroup>,
        );
        const b = screen.getByRole("radio", { name: "B" });
        await userEvent.click(b);
        expect(b).toBeChecked();
    });
});
