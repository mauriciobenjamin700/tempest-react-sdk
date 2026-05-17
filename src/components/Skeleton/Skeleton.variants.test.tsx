import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./Skeleton";

describe("Skeleton variants", () => {
    it.each(["rect", "text", "circle"] as const)("renders variant=%s", (variant) => {
        const { container } = render(<Skeleton variant={variant} />);
        const el = container.querySelector("span") as HTMLElement;
        if (variant !== "rect") expect(el.className).toContain(variant);
    });
});
