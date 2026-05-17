import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Select } from "./Select";

describe("Select children + states", () => {
    it("renders children options", () => {
        render(
            <Select label="x">
                <option value="1">One</option>
                <option value="2">Two</option>
            </Select>,
        );
        expect(screen.getByText("One")).toBeInTheDocument();
        expect(screen.getByText("Two")).toBeInTheDocument();
    });

    it("renders error message and aria-invalid", () => {
        render(<Select label="x" error="invalid" />);
        expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByText("invalid")).toBeInTheDocument();
    });

    it("renders helper text when no error", () => {
        render(<Select label="x" helperText="pick one" />);
        expect(screen.getByText("pick one")).toBeInTheDocument();
    });

    it("disables option marked as disabled", () => {
        render(
            <Select
                options={[
                    { value: "a", label: "A" },
                    { value: "b", label: "B", disabled: true },
                ]}
            />,
        );
        const b = screen.getByRole("option", { name: "B" }) as HTMLOptionElement;
        expect(b.disabled).toBe(true);
    });
});
