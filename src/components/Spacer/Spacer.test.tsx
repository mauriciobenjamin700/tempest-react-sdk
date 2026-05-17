import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Spacer } from "./Spacer";

describe("Spacer", () => {
    it("renders a div", () => {
        const { container } = render(<Spacer data-testid="spacer" />);
        expect(container.firstElementChild?.tagName).toBe("DIV");
    });

    it("applies the requested axis class", () => {
        const { container } = render(<Spacer axis="x" />);
        expect((container.firstElementChild as HTMLElement).className).toMatch(/x/);
    });

    it("defaults to axis='both'", () => {
        const { container } = render(<Spacer />);
        expect((container.firstElementChild as HTMLElement).className).toMatch(/both/);
    });
});
