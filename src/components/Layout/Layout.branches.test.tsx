import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Container, Grid, Stack } from "./Layout";

describe("Layout branches", () => {
    it.each(["start", "center", "end", "stretch"] as const)("Stack align=%s", (align) => {
        const { container } = render(<Stack align={align}>x</Stack>);
        const el = container.firstChild as HTMLElement;
        expect(el.className).toContain(align);
    });

    it.each(["start", "center", "end", "between"] as const)("Stack justify=%s", (justify) => {
        const { container } = render(<Stack justify={justify}>x</Stack>);
        const el = container.firstChild as HTMLElement;
        expect(el.className).toMatch(/justify/i);
    });

    it("Stack horizontal direction wraps when wrap=true", () => {
        const { container } = render(
            <Stack direction="horizontal" wrap>
                x
            </Stack>,
        );
        const el = container.firstChild as HTMLElement;
        expect(el.className).toContain("wrap");
    });

    it("Stack accepts string gap", () => {
        const { container } = render(<Stack gap="2rem">x</Stack>);
        const el = container.firstChild as HTMLElement;
        expect(el.style.gap).toBe("2rem");
    });

    it("Grid accepts custom string columns template", () => {
        const { container } = render(<Grid columns="200px 1fr">x</Grid>);
        const el = container.firstChild as HTMLElement;
        expect(el.style.gridTemplateColumns).toBe("200px 1fr");
    });

    it("Grid accepts string gap", () => {
        const { container } = render(<Grid gap="1rem">x</Grid>);
        const el = container.firstChild as HTMLElement;
        expect(el.style.gap).toBe("1rem");
    });

    it("Container supports all sizes", () => {
        for (const size of ["sm", "md", "lg", "xl", "full"] as const) {
            const { container, unmount } = render(<Container size={size}>x</Container>);
            expect((container.firstChild as HTMLElement).className).toContain(size);
            unmount();
        }
    });
});
