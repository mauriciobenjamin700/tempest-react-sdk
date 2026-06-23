import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Resizable } from "./Resizable";

describe("Resizable", () => {
    it("renders both panes and a separator", () => {
        render(
            <Resizable>
                <div>Pane A</div>
                <div>Pane B</div>
            </Resizable>,
        );
        expect(screen.getByText("Pane A")).toBeInTheDocument();
        expect(screen.getByText("Pane B")).toBeInTheDocument();
        expect(screen.getByRole("separator")).toBeInTheDocument();
    });

    it("exposes the default size and orientation on the separator", () => {
        render(
            <Resizable defaultSize={50}>
                <div>A</div>
                <div>B</div>
            </Resizable>,
        );
        const separator = screen.getByRole("separator");
        expect(separator).toHaveAttribute("aria-valuenow", "50");
        expect(separator).toHaveAttribute("aria-orientation", "vertical");
    });

    it("ArrowRight / ArrowLeft adjust aria-valuenow (horizontal)", () => {
        render(
            <Resizable defaultSize={50}>
                <div>A</div>
                <div>B</div>
            </Resizable>,
        );
        const separator = screen.getByRole("separator");
        fireEvent.keyDown(separator, { key: "ArrowRight" });
        expect(separator).toHaveAttribute("aria-valuenow", "52");
        fireEvent.keyDown(separator, { key: "ArrowLeft" });
        fireEvent.keyDown(separator, { key: "ArrowLeft" });
        expect(separator).toHaveAttribute("aria-valuenow", "48");
    });

    it("uses horizontal orientation for vertical direction", () => {
        render(
            <Resizable direction="vertical">
                <div>A</div>
                <div>B</div>
            </Resizable>,
        );
        const separator = screen.getByRole("separator");
        expect(separator).toHaveAttribute("aria-orientation", "horizontal");
        fireEvent.keyDown(separator, { key: "ArrowDown" });
        expect(separator).toHaveAttribute("aria-valuenow", "52");
    });

    it("clamps at min and max", () => {
        render(
            <Resizable defaultSize={11} min={10} max={14}>
                <div>A</div>
                <div>B</div>
            </Resizable>,
        );
        const separator = screen.getByRole("separator");
        fireEvent.keyDown(separator, { key: "ArrowLeft" });
        expect(separator).toHaveAttribute("aria-valuenow", "10");
        fireEvent.keyDown(separator, { key: "ArrowRight" });
        fireEvent.keyDown(separator, { key: "ArrowRight" });
        fireEvent.keyDown(separator, { key: "ArrowRight" });
        expect(separator).toHaveAttribute("aria-valuenow", "14");
    });

    it("forwards className", () => {
        const { container } = render(
            <Resizable className="custom">
                <div>A</div>
                <div>B</div>
            </Resizable>,
        );
        expect((container.firstChild as HTMLElement).className).toContain("custom");
    });
});
