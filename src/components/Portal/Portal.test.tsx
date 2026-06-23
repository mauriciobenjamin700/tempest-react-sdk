import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Portal } from "./Portal";

describe("Portal", () => {
    it("renders children into document.body by default", () => {
        render(
            <Portal>
                <span>portal-content</span>
            </Portal>,
        );
        const node = screen.getByText("portal-content");
        expect(node).toBeInTheDocument();
        expect(document.body.contains(node)).toBe(true);
    });

    it("renders children into a custom container", () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        render(
            <Portal container={container}>
                <span>in-container</span>
            </Portal>,
        );
        expect(container.textContent).toContain("in-container");
        document.body.removeChild(container);
    });

    it("does not render the children inside the host element", () => {
        const { container } = render(
            <Portal>
                <span>escaped</span>
            </Portal>,
        );
        expect(container.textContent).toBe("");
    });
});
