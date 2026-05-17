import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
    it("renders label and description", () => {
        render(<Checkbox label="Terms" description="Read first" />);
        expect(screen.getByText("Terms")).toBeInTheDocument();
        expect(screen.getByText("Read first")).toBeInTheDocument();
    });

    it("toggles when clicked", async () => {
        const onChange = vi.fn();
        render(<Checkbox label="x" onChange={onChange} />);
        await userEvent.click(screen.getByRole("checkbox"));
        expect(onChange).toHaveBeenCalled();
    });

    it("applies indeterminate state", () => {
        render(<Checkbox label="x" indeterminate />);
        const input = screen.getByRole("checkbox") as HTMLInputElement;
        expect(input.indeterminate).toBe(true);
    });
});
