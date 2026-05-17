import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Textarea } from "./Textarea";

describe("Textarea", () => {
    it("renders label + error", () => {
        render(<Textarea label="Bio" error="bad" />);
        expect(screen.getByText("Bio")).toBeInTheDocument();
        expect(screen.getByText("bad")).toBeInTheDocument();
        expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    });
});
