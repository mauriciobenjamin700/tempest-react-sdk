import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Kbd } from "./Kbd";

describe("Kbd", () => {
    it("renders key text", () => {
        render(<Kbd>Ctrl</Kbd>);
        expect(screen.getByText("Ctrl")).toBeInTheDocument();
    });

    it("uses kbd element", () => {
        const { container } = render(<Kbd>K</Kbd>);
        expect(container.querySelector("kbd")).toBeTruthy();
    });

    it("applies size class", () => {
        const { container } = render(<Kbd size="lg">K</Kbd>);
        expect(container.querySelector("kbd")?.className).toContain("lg");
    });
});
