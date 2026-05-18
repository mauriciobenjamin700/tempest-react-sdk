import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SafeArea } from "./SafeArea";

describe("SafeArea", () => {
    it("applies all edges by default via data attribute", () => {
        const { container } = render(<SafeArea>x</SafeArea>);
        const el = container.firstElementChild as HTMLElement;
        expect(el.dataset.edges).toBe("top right bottom left");
    });

    it("applies only requested edges", () => {
        const { container } = render(<SafeArea edges={["top"]}>x</SafeArea>);
        const el = container.firstElementChild as HTMLElement;
        expect(el.dataset.edges).toBe("top");
    });

    it("applies a class per requested edge", () => {
        const { container } = render(<SafeArea edges={["top", "bottom"]}>x</SafeArea>);
        const el = container.firstElementChild as HTMLElement;
        expect(el.className).toMatch(/top/);
        expect(el.className).toMatch(/bottom/);
        expect(el.className).not.toMatch(/\bleft\b/);
    });

    it("renders inline (display: contents) when inline=true", () => {
        const { container } = render(
            <SafeArea inline edges={["top"]}>
                x
            </SafeArea>,
        );
        expect((container.firstElementChild as HTMLElement).className).toMatch(/inline/);
    });
});
