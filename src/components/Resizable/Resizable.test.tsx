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

describe("Resizable — keyboard and pointer", () => {
    function panes(): [React.ReactNode, React.ReactNode] {
        return [<div key="a">A</div>, <div key="b">B</div>];
    }

    it("ArrowUp / ArrowDown adjust a vertical split", () => {
        render(<Resizable direction="vertical">{panes()}</Resizable>);
        const divider = screen.getByRole("separator");

        fireEvent.keyDown(divider, { key: "ArrowDown" });
        expect(divider).toHaveAttribute("aria-valuenow", "52");
        fireEvent.keyDown(divider, { key: "ArrowUp" });
        expect(divider).toHaveAttribute("aria-valuenow", "50");
    });

    it("ignores the cross-axis arrows for each direction", () => {
        const { unmount } = render(<Resizable>{panes()}</Resizable>);
        const horizontal = screen.getByRole("separator");
        fireEvent.keyDown(horizontal, { key: "ArrowDown" });
        expect(horizontal).toHaveAttribute("aria-valuenow", "50");
        unmount();

        render(<Resizable direction="vertical">{panes()}</Resizable>);
        const vertical = screen.getByRole("separator");
        fireEvent.keyDown(vertical, { key: "ArrowRight" });
        expect(vertical).toHaveAttribute("aria-valuenow", "50");
    });

    it("Home and End jump to the clamps", () => {
        render(
            <Resizable min={20} max={80}>
                {panes()}
            </Resizable>,
        );
        const divider = screen.getByRole("separator");

        fireEvent.keyDown(divider, { key: "Home" });
        expect(divider).toHaveAttribute("aria-valuenow", "20");
        fireEvent.keyDown(divider, { key: "End" });
        expect(divider).toHaveAttribute("aria-valuenow", "80");
    });

    it("ignores unrelated keys", () => {
        render(<Resizable>{panes()}</Resizable>);
        const divider = screen.getByRole("separator");
        fireEvent.keyDown(divider, { key: "Enter" });
        expect(divider).toHaveAttribute("aria-valuenow", "50");
    });

    it("clamps a defaultSize that sits outside the range", () => {
        const { unmount } = render(
            <Resizable defaultSize={5} min={25} max={75}>
                {panes()}
            </Resizable>,
        );
        expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "25");
        unmount();

        render(
            <Resizable defaultSize={99} min={25} max={75}>
                {panes()}
            </Resizable>,
        );
        expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "75");
    });

    it("resizes from a pointer drag along the container", () => {
        const { container } = render(<Resizable>{panes()}</Resizable>);
        const root = container.firstChild as HTMLElement;
        root.getBoundingClientRect = () =>
            ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;

        const divider = screen.getByRole("separator");
        divider.setPointerCapture = () => undefined;
        fireEvent.pointerDown(divider, { pointerId: 1 });
        fireEvent.pointerMove(window, { clientX: 60, clientY: 0 });
        expect(divider).toHaveAttribute("aria-valuenow", "30");

        fireEvent.pointerUp(window, { pointerId: 1 });
        fireEvent.pointerMove(window, { clientX: 150, clientY: 0 });
        expect(divider).toHaveAttribute("aria-valuenow", "30");
    });

    it("drags along the vertical axis when the split is vertical", () => {
        const { container } = render(<Resizable direction="vertical">{panes()}</Resizable>);
        const root = container.firstChild as HTMLElement;
        root.getBoundingClientRect = () =>
            ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;

        const divider = screen.getByRole("separator");
        divider.setPointerCapture = () => undefined;
        fireEvent.pointerDown(divider, { pointerId: 1 });
        fireEvent.pointerMove(window, { clientX: 0, clientY: 70 });
        expect(divider).toHaveAttribute("aria-valuenow", "70");
    });

    it("ignores a drag when the container has no size", () => {
        const { container } = render(<Resizable>{panes()}</Resizable>);
        const root = container.firstChild as HTMLElement;
        root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 }) as DOMRect;

        const divider = screen.getByRole("separator");
        divider.setPointerCapture = () => undefined;
        fireEvent.pointerDown(divider, { pointerId: 1 });
        fireEvent.pointerMove(window, { clientX: 50, clientY: 50 });
        expect(divider).toHaveAttribute("aria-valuenow", "50");
    });
});
