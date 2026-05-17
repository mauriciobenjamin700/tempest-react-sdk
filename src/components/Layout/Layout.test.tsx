import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Container, Grid, Stack } from "./Layout";

describe("Layout", () => {
    it("Container respects size", () => {
        const { container } = render(<Container size="sm">x</Container>);
        const el = container.firstChild as HTMLElement;
        expect(el.className).toContain("sm");
    });

    it("Stack maps numeric gap to 4px multiples", () => {
        const { container } = render(<Stack gap={4}>x</Stack>);
        const el = container.firstChild as HTMLElement;
        expect(el.style.gap).toBe("16px");
    });

    it("Grid resolves numeric columns to repeat()", () => {
        const { container } = render(<Grid columns={3}>x</Grid>);
        const el = container.firstChild as HTMLElement;
        expect(el.style.gridTemplateColumns).toContain("repeat(3");
    });
});
