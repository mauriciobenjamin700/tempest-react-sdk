import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AspectRatio } from "./AspectRatio";

describe("AspectRatio", () => {
    it("applies the aspect-ratio style from the ratio prop", () => {
        const { container } = render(
            <AspectRatio ratio={4 / 3}>
                <img alt="" />
            </AspectRatio>,
        );
        expect((container.firstElementChild as HTMLElement).style.aspectRatio).toContain(
            String(4 / 3),
        );
    });

    it("defaults to 16/9 when ratio is not provided", () => {
        const { container } = render(
            <AspectRatio>
                <img alt="" />
            </AspectRatio>,
        );
        expect((container.firstElementChild as HTMLElement).style.aspectRatio).toContain(
            String(16 / 9),
        );
    });
});
