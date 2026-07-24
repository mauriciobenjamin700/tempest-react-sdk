import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Container, Grid, Stack } from "./Layout";

const breakpoint = vi.hoisted(() => ({
    value: { isMobile: false, isTablet: false, isDesktop: true },
}));

vi.mock("@/hooks/use-breakpoint", () => ({
    useBreakpoint: () => breakpoint.value,
    BREAKPOINTS: { mobile: 640, tablet: 1024 },
}));

/**
 * Pretend the viewport is at the given device class.
 *
 * `Stack`/`Grid` resolve responsive props through `useBreakpoint`, and jsdom
 * reports no layout, so the hook is mocked and flipped per test instead.
 *
 * @param device - Device class the mocked hook should report.
 */
function setDevice(device: "mobile" | "tablet" | "desktop"): void {
    breakpoint.value = {
        isMobile: device === "mobile",
        isTablet: device === "tablet",
        isDesktop: device === "desktop",
    };
}

function firstChild(ui: ReactElement): HTMLElement {
    const { container } = render(ui);
    return container.firstChild as HTMLElement;
}

beforeEach(() => setDevice("desktop"));

describe("Container", () => {
    it.each(["sm", "md", "lg", "xl", "full"] as const)("carries the %s size class", (size) => {
        expect(firstChild(<Container size={size}>x</Container>).className).toContain(size);
    });

    it("defaults to lg and keeps a caller className", () => {
        const el = firstChild(<Container className="mine">x</Container>);
        expect(el.className).toContain("lg");
        expect(el.className).toContain("mine");
    });
});

describe("Stack — gap and direction", () => {
    it("maps a numeric gap to 4px multiples", () => {
        expect(firstChild(<Stack gap={4}>x</Stack>).style.gap).toBe("16px");
    });

    it("passes a string gap through untouched", () => {
        expect(firstChild(<Stack gap="1.5rem">x</Stack>).style.gap).toBe("1.5rem");
    });

    it("defaults to vertical", () => {
        expect(firstChild(<Stack>x</Stack>).className).toContain("vertical");
    });

    it("accepts an explicit horizontal direction", () => {
        expect(firstChild(<Stack direction="horizontal">x</Stack>).className).toContain(
            "horizontal",
        );
    });

    it("lets an inline style override the computed gap", () => {
        expect(firstChild(<Stack gap={4} style={{ gap: "2px" }} />).style.gap).toBe("2px");
    });
});

describe("Stack — responsive resolution", () => {
    it("uses the mobile entry on a phone", () => {
        setDevice("mobile");
        const el = firstChild(
            <Stack direction={{ mobile: "vertical", desktop: "horizontal" }} gap={{ mobile: 1 }}>
                x
            </Stack>,
        );
        expect(el.className).toContain("vertical");
        expect(el.style.gap).toBe("4px");
    });

    it("uses the desktop entry on a desktop", () => {
        const el = firstChild(
            <Stack direction={{ mobile: "vertical", desktop: "horizontal" }}>x</Stack>,
        );
        expect(el.className).toContain("horizontal");
    });

    it("falls back from tablet to mobile when tablet is absent", () => {
        setDevice("tablet");
        const el = firstChild(<Stack direction={{ mobile: "horizontal" }}>x</Stack>);
        expect(el.className).toContain("horizontal");
    });

    it("falls back from tablet to desktop when only desktop is set", () => {
        setDevice("tablet");
        const el = firstChild(<Stack direction={{ desktop: "horizontal" }}>x</Stack>);
        expect(el.className).toContain("horizontal");
    });

    it("falls back from desktop to tablet, then to mobile", () => {
        expect(firstChild(<Stack direction={{ tablet: "horizontal" }} />).className).toContain(
            "horizontal",
        );
        expect(firstChild(<Stack direction={{ mobile: "horizontal" }} />).className).toContain(
            "horizontal",
        );
    });

    it("falls back from mobile to tablet, then to desktop", () => {
        setDevice("mobile");
        expect(firstChild(<Stack direction={{ tablet: "horizontal" }} />).className).toContain(
            "horizontal",
        );
        expect(firstChild(<Stack direction={{ desktop: "horizontal" }} />).className).toContain(
            "horizontal",
        );
    });
});

describe("Stack — align, justify and wrap", () => {
    it.each(["start", "center", "end", "stretch"] as const)("carries align=%s", (align) => {
        expect(firstChild(<Stack align={align}>x</Stack>).className).toContain(align);
    });

    it.each([
        ["between", "justifyBetween"],
        ["center", "justifyCenter"],
        ["end", "justifyEnd"],
        ["start", "justifyStart"],
    ] as const)("maps justify=%s to %s", (justify, expected) => {
        expect(firstChild(<Stack justify={justify}>x</Stack>).className).toContain(expected);
    });

    it("omits the justify class when justify is unset", () => {
        expect(firstChild(<Stack>x</Stack>).className).not.toContain("justify");
    });

    it("adds the wrap class only when wrap is on", () => {
        expect(firstChild(<Stack wrap>x</Stack>).className).toContain("wrap");
        expect(firstChild(<Stack>x</Stack>).className).not.toContain("wrap");
    });
});

describe("Grid", () => {
    it("resolves numeric columns to repeat()", () => {
        expect(firstChild(<Grid columns={3}>x</Grid>).style.gridTemplateColumns).toContain(
            "repeat(3",
        );
    });

    it("passes a custom template through untouched", () => {
        expect(firstChild(<Grid columns="200px 1fr">x</Grid>).style.gridTemplateColumns).toBe(
            "200px 1fr",
        );
    });

    it("resolves responsive columns per device", () => {
        setDevice("mobile");
        expect(
            firstChild(<Grid columns={{ mobile: 1, desktop: 4 }} />).style.gridTemplateColumns,
        ).toContain("repeat(1");

        setDevice("desktop");
        expect(
            firstChild(<Grid columns={{ mobile: 1, desktop: 4 }} />).style.gridTemplateColumns,
        ).toContain("repeat(4");
    });

    it("applies the default gap of 4 scale units", () => {
        expect(firstChild(<Grid>x</Grid>).style.gap).toBe("16px");
    });

    it("lets an inline style win over computed values", () => {
        const el = firstChild(<Grid columns={2} style={{ gridTemplateColumns: "1fr" }} />);
        expect(el.style.gridTemplateColumns).toBe("1fr");
    });
});
