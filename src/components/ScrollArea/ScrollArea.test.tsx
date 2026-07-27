import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ScrollArea } from "./ScrollArea";

describe("ScrollArea", () => {
    it("renders its children", () => {
        render(
            <ScrollArea>
                <p>inner content</p>
            </ScrollArea>,
        );
        expect(screen.getByText("inner content")).toBeInTheDocument();
    });

    it("applies a numeric maxHeight as a pixel value", () => {
        render(<ScrollArea maxHeight={240} data-testid="sa" />);
        expect(screen.getByTestId("sa")).toHaveStyle({ maxHeight: "240px" });
    });

    it("applies a string maxHeight verbatim", () => {
        render(<ScrollArea maxHeight="50vh" data-testid="sa" />);
        expect(screen.getByTestId("sa")).toHaveStyle({ maxHeight: "50vh" });
    });

    it("defaults to vertical overflow", () => {
        render(<ScrollArea data-testid="sa" />);
        expect(screen.getByTestId("sa")).toHaveStyle({ overflowY: "auto", overflowX: "hidden" });
    });

    it("sets horizontal overflow when orientation is horizontal", () => {
        render(<ScrollArea orientation="horizontal" data-testid="sa" />);
        expect(screen.getByTestId("sa")).toHaveStyle({ overflowX: "auto", overflowY: "hidden" });
    });

    it("sets both axes when orientation is both", () => {
        render(<ScrollArea orientation="both" data-testid="sa" />);
        expect(screen.getByTestId("sa")).toHaveStyle({ overflowX: "auto", overflowY: "auto" });
    });

    it("forwards className and extra style", () => {
        render(<ScrollArea className="custom" style={{ background: "red" }} data-testid="sa" />);
        const el = screen.getByTestId("sa");
        expect(el).toHaveClass("custom");
        expect(el).toHaveStyle({ background: "red" });
    });

    it("forwards the ref to the underlying div", () => {
        let node: HTMLDivElement | null = null;
        render(
            <ScrollArea
                ref={(el) => {
                    node = el;
                }}
                data-testid="sa"
            />,
        );
        expect(node).toBeInstanceOf(HTMLDivElement);
    });
});

/**
 * jsdom performs no layout, so nothing ever looks overflowing. These stubs
 * stand in for the browser measurement.
 */
function stubBox(scrollHeight: number, clientHeight: number) {
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
        configurable: true,
        get: () => scrollHeight,
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
        configurable: true,
        get: () => clientHeight,
    });
}

describe("ScrollArea — keyboard reach", () => {
    afterEach(() => {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
        Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
    });

    it("adds no tab stop while the content fits", () => {
        stubBox(200, 200);
        const { container } = render(
            <ScrollArea>
                <p>curto</p>
            </ScrollArea>,
        );
        expect(container.firstElementChild).not.toHaveAttribute("tabindex");
    });

    it("becomes a named, focusable group once the content overflows", () => {
        stubBox(2000, 200);
        render(
            <ScrollArea>
                <p>longo</p>
            </ScrollArea>,
        );
        const region = screen.getByRole("group");
        expect(region).toHaveAttribute("tabindex", "0");
        expect(region).toHaveAccessibleName("Área rolável");
    });

    it("takes a caller-supplied name", () => {
        stubBox(2000, 200);
        render(
            <ScrollArea scrollLabel="Termos de uso">
                <p>longo</p>
            </ScrollArea>,
        );
        expect(screen.getByRole("group")).toHaveAccessibleName("Termos de uso");
    });

    it("ignores vertical overflow when only the horizontal axis scrolls", () => {
        stubBox(2000, 200);
        const { container } = render(
            <ScrollArea orientation="horizontal">
                <p>longo</p>
            </ScrollArea>,
        );
        expect(container.firstElementChild).not.toHaveAttribute("tabindex");
    });

    it("still forwards the caller's ref while measuring internally", () => {
        stubBox(2000, 200);
        const ref = createRef<HTMLDivElement>();
        render(
            <ScrollArea ref={ref}>
                <p>longo</p>
            </ScrollArea>,
        );
        expect(ref.current).toBe(screen.getByRole("group"));
    });

    it("lets the caller override the role it would otherwise take", () => {
        stubBox(2000, 200);
        render(
            <ScrollArea role="log">
                <p>longo</p>
            </ScrollArea>,
        );
        expect(screen.getByRole("log")).toHaveAttribute("tabindex", "0");
    });
});
