import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";

describe("Button — new variants/sizes", () => {
    const variants = [
        "primary",
        "secondary",
        "danger",
        "success",
        "ghost",
        "soft",
        "outline",
        "link",
    ] as const;
    const sizes = ["xs", "sm", "md", "lg", "xl"] as const;

    it.each(variants)("renders variant=%s", (variant) => {
        const { container } = render(<Button variant={variant}>x</Button>);
        expect(container.querySelector("button")?.className).toContain(variant);
    });

    it.each(sizes)("renders size=%s", (size) => {
        const { container } = render(<Button size={size}>x</Button>);
        expect(container.querySelector("button")?.className).toContain(size);
    });

    it("iconOnly adds class", () => {
        const { container } = render(
            <Button iconOnly aria-label="x">
                <span>I</span>
            </Button>,
        );
        expect(container.querySelector("button")?.className).toContain("iconOnly");
    });

    it("pill adds class", () => {
        const { container } = render(<Button pill>x</Button>);
        expect(container.querySelector("button")?.className).toContain("pill");
    });
});
