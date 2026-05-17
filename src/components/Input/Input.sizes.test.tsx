import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "./Input";

describe("Input — size prop", () => {
    const sizes = ["sm", "md", "lg"] as const;

    it.each(sizes)("applies size class for size=%s", (size) => {
        const { container } = render(<Input size={size} />);
        const input = container.querySelector("input")!;
        if (size === "sm") expect(input.className).toContain("sizeSm");
        if (size === "md") expect(input.className).toContain("sizeMd");
        if (size === "lg") expect(input.className).toContain("sizeLg");
    });
});
