import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Textarea } from "./Textarea";

describe("Textarea helper + required", () => {
    it("renders helper when no error", () => {
        render(<Textarea label="Bio" helperText="optional" />);
        expect(screen.getByText("optional")).toBeInTheDocument();
    });

    it("shows required asterisk in label", () => {
        const { container } = render(<Textarea label="Bio" required />);
        const star = container.querySelector('[class*="required"]');
        expect(star).not.toBeNull();
    });
});
