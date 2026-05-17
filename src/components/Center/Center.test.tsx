import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Center } from "./Center";

describe("Center", () => {
    it("renders children", () => {
        render(<Center>hello</Center>);
        expect(screen.getByText("hello")).toBeInTheDocument();
    });

    it("defaults to axis='both'", () => {
        const { container } = render(<Center>x</Center>);
        expect((container.firstElementChild as HTMLElement).className).toMatch(/both/);
    });

    it("applies the requested axis class", () => {
        const { container } = render(<Center axis="horizontal">x</Center>);
        expect((container.firstElementChild as HTMLElement).className).toMatch(/horizontal/);
    });

    it("applies minHeight from a number value", () => {
        const { container } = render(<Center minHeight={200}>x</Center>);
        expect((container.firstElementChild as HTMLElement).style.minHeight).toBe("200px");
    });

    it("applies minHeight from a string value", () => {
        const { container } = render(<Center minHeight="50vh">x</Center>);
        expect((container.firstElementChild as HTMLElement).style.minHeight).toBe("50vh");
    });
});
