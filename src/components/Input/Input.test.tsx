import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "./Input";

describe("Input", () => {
    it("renders label + helper", () => {
        render(<Input label="Email" helperText="Required" />);
        expect(screen.getByText("Email")).toBeInTheDocument();
        expect(screen.getByText("Required")).toBeInTheDocument();
    });

    it("renders error and sets aria-invalid", () => {
        render(<Input label="Email" error="Invalid" />);
        const input = screen.getByRole("textbox");
        expect(input).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByText("Invalid")).toBeInTheDocument();
    });
});
