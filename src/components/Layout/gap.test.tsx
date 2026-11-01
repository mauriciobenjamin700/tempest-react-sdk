import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { Form, FormActions, FormRow, FormSection } from "../Form";
import { setDevBuild } from "@/utils/dev-mode";
import { Grid, Stack } from "./Layout";

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
    warn.mockRestore();
    setDevBuild(undefined);
});

/**
 * Render a layout element and return the CSS `gap` it ended up with.
 *
 * Takes the first element carrying an inline `gap`, so `FormSection` (whose gap
 * lives on its body, not its root) reads the same as the others.
 *
 * @param ui - The element to render.
 * @returns The inline `gap` value.
 */
function renderedGap(ui: ReactElement): string {
    const { container } = render(ui);
    const styled = [container, ...container.querySelectorAll<HTMLElement>("*")].find(
        (node) => node instanceof HTMLElement && node.style.gap !== "",
    ) as HTMLElement | undefined;
    return styled?.style.gap ?? "";
}

/**
 * The warnings logged so far that are about a pixel-looking `gap`.
 *
 * @returns Each matching warning's message.
 */
function gapWarnings(): string[] {
    return warn.mock.calls
        .map((call) => String(call[0]))
        .filter((message) => message.includes("numeric gap counts 4px steps"));
}

describe("numeric gap that reads as pixels (#536)", () => {
    it("warns that gap={24} renders 96px and names both ways out", () => {
        expect(renderedGap(<Stack gap={24}>x</Stack>)).toBe("96px");
        expect(gapWarnings()).toHaveLength(1);
        const [message] = gapWarnings();
        expect(message).toContain("<Stack gap={24}> renders a 96px gap");
        expect(message).toContain("For 24px use gap={6}");
        expect(message).toContain('pass gap="96px"');
    });

    it("warns once per value, however many components and renders repeat it", () => {
        renderedGap(<Stack gap={20}>x</Stack>);
        renderedGap(<Stack gap={20}>x</Stack>);
        renderedGap(<Grid gap={20}>x</Grid>);
        renderedGap(<Form gap={20}>x</Form>);
        expect(gapWarnings()).toHaveLength(1);
    });

    it.each([
        ["Grid", <Grid gap={13}>x</Grid>, "52px"],
        ["Form", <Form gap={14}>x</Form>, "56px"],
        ["FormSection", <FormSection gap={15}>x</FormSection>, "60px"],
        ["FormRow", <FormRow gap={16}>x</FormRow>, "64px"],
        ["FormActions", <FormActions gap={17}>x</FormActions>, "68px"],
    ])("warns from %s too, keeping the 4px scale it always had", (name, ui, pixels) => {
        expect(renderedGap(ui)).toBe(pixels);
        expect(gapWarnings()).toEqual([expect.stringContaining(`<${name} gap=`)]);
    });

    it("leaves out the scale hint when the pixel value is not a multiple of 4", () => {
        renderedGap(<Stack gap={18}>x</Stack>);
        expect(gapWarnings()[0]).not.toContain("use gap=");
    });

    it("warns about a value reached through a responsive object", () => {
        expect(renderedGap(<Stack gap={{ mobile: 21, tablet: 21, desktop: 21 }}>x</Stack>)).toBe(
            "84px",
        );
        expect(gapWarnings()).toEqual([expect.stringContaining("gap={21}")]);
    });

    it("stays silent for every value up to 12, the top of the tempest-gap-* scale", () => {
        for (const step of [0, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12]) {
            renderedGap(<Stack gap={step}>x</Stack>);
            renderedGap(<Grid gap={step}>x</Grid>);
            renderedGap(<Form gap={step}>x</Form>);
            renderedGap(<FormSection gap={step}>x</FormSection>);
            renderedGap(<FormRow gap={step}>x</FormRow>);
            renderedGap(<FormActions gap={step}>x</FormActions>);
        }
        renderedGap(<Stack>x</Stack>);
        renderedGap(<Form>x</Form>);
        expect(gapWarnings()).toEqual([]);
    });

    it("stays silent for a string gap, the escape hatch for an intended large gap", () => {
        expect(renderedGap(<Stack gap="96px">x</Stack>)).toBe("96px");
        expect(renderedGap(<Form gap="var(--tempest-space-24)">x</Form>)).toBe(
            "var(--tempest-space-24)",
        );
        expect(gapWarnings()).toEqual([]);
    });

    it("stays silent in a production build", () => {
        setDevBuild(false);
        expect(renderedGap(<Stack gap={30}>x</Stack>)).toBe("120px");
        expect(gapWarnings()).toEqual([]);
    });

    it("warns with no override at all, where the test runner's NODE_ENV is not production", () => {
        expect(process.env.NODE_ENV).not.toBe("production");
        renderedGap(<Stack gap={31}>x</Stack>);
        expect(gapWarnings()).toHaveLength(1);
    });
});
