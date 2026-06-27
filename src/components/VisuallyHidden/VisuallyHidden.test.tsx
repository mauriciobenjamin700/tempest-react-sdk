import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VisuallyHidden } from "./VisuallyHidden";

describe("VisuallyHidden", () => {
    it("renders children in the DOM", () => {
        render(<VisuallyHidden>Close menu</VisuallyHidden>);
        expect(screen.getByText("Close menu")).toBeInTheDocument();
    });

    it("renders the requested element", () => {
        const { container } = render(<VisuallyHidden as="label">Email</VisuallyHidden>);
        expect(container.querySelector("label")).toBeTruthy();
    });
});
