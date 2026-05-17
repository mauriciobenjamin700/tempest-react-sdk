import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge";

describe("Badge — new variants/appearance/shape/dot", () => {
    const variants = ["neutral", "primary", "success", "warning", "danger", "info"] as const;
    const appearances = ["soft", "solid", "outline"] as const;
    const sizes = ["sm", "md", "lg"] as const;

    it.each(variants)("renders variant=%s", (variant) => {
        const { container } = render(<Badge variant={variant}>x</Badge>);
        expect(container.querySelector("span")?.className).toContain(variant);
    });

    it.each(appearances)("renders appearance=%s", (appearance) => {
        const { container } = render(<Badge appearance={appearance}>x</Badge>);
        if (appearance !== "soft") {
            expect(container.querySelector("span")?.className).toContain(appearance);
        }
    });

    it.each(sizes)("renders size=%s", (size) => {
        const { container } = render(<Badge size={size}>x</Badge>);
        expect(container.querySelector("span")?.className).toContain(size);
    });

    it("square shape adds class", () => {
        const { container } = render(<Badge shape="square">x</Badge>);
        expect(container.querySelector("span")?.className).toContain("square");
    });

    it("dot renders leading dot span", () => {
        const { container } = render(<Badge dot>x</Badge>);
        expect(container.querySelectorAll("span")).toHaveLength(2);
    });
});
