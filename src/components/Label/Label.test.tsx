import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Label } from "./Label";

describe("Label", () => {
    it("renders text inside a label element", () => {
        const { container } = render(<Label>Email</Label>);
        expect(container.querySelector("label")).toBeTruthy();
        expect(screen.getByText("Email")).toBeInTheDocument();
    });

    it("forwards htmlFor", () => {
        const { container } = render(<Label htmlFor="email">Email</Label>);
        expect(container.querySelector("label")).toHaveAttribute("for", "email");
    });

    it("renders an aria-hidden asterisk when required", () => {
        render(<Label required>Email</Label>);
        const asterisk = screen.getByText("*");
        expect(asterisk).toBeInTheDocument();
        expect(asterisk).toHaveAttribute("aria-hidden");
    });

    it("omits the asterisk by default", () => {
        render(<Label>Email</Label>);
        expect(screen.queryByText("*")).not.toBeInTheDocument();
    });

    it("forwards className", () => {
        const { container } = render(<Label className="custom">Email</Label>);
        expect(container.querySelector("label")?.className).toContain("custom");
    });
});
