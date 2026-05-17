import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
    it("renders with size styles", () => {
        const { container } = render(<Skeleton width={100} height={20} />);
        const el = container.querySelector("span");
        expect(el?.style.width).toBe("100px");
        expect(el?.style.height).toBe("20px");
    });
});
