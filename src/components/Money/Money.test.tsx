import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Money } from "./Money";

describe("Money", () => {
    it("renders a span with the pt-BR formatted value", () => {
        const { container } = render(<Money cents={1990} />);
        const span = container.querySelector("span");
        expect(span).toBeTruthy();
        expect(span?.textContent).toContain("19,90");
    });

    it("supports other currencies and locales", () => {
        const { container } = render(<Money cents={500} currency="USD" locale="en-US" />);
        expect(container.querySelector("span")?.textContent).toContain("5.00");
    });
});
