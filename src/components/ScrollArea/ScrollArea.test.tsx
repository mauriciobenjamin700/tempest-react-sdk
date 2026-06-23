import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
