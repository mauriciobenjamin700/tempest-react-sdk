import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Spinner } from "./Spinner";

describe("Spinner — new sizes", () => {
    const sizes = ["xs", "sm", "md", "lg", "xl"] as const;

    it.each(sizes)("renders size=%s", (size) => {
        const { container } = render(<Spinner size={size} />);
        expect((container.firstChild as HTMLElement).className).toContain(size);
    });
});
