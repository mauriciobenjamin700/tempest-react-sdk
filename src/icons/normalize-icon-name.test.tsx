import { render, screen } from "@testing-library/react";
import { Save } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Icon } from "./Icon";
import { isIconName } from "./is-icon-name";
import { normalizeIconName } from "./normalize-icon-name";
import { preloadIcons, registerIcons } from "./shard-cache";

describe("normalizeIconName", () => {
    it("lower-cases and trims", () => {
        expect(normalizeIconName("  Save ")).toBe("save");
    });

    it("turns snake_case into kebab-case", () => {
        expect(normalizeIconName("shopping_cart")).toBe("shopping-cart");
    });

    it("resolves a deprecated slug to its canonical name", () => {
        expect(normalizeIconName("alert-circle")).toBe("circle-alert");
    });

    it("does all three at once, which is the case that motivated it", () => {
        expect(normalizeIconName(" Alert_Circle ")).toBe("circle-alert");
    });

    it("leaves a canonical slug untouched", () => {
        expect(normalizeIconName("circle-alert")).toBe("circle-alert");
    });

    it("returns the cleaned string even when no icon matches, so the caller decides", () => {
        expect(normalizeIconName("Not_An_Icon")).toBe("not-an-icon");
        expect(isIconName(normalizeIconName("Not_An_Icon"))).toBe(false);
    });

    it("produces a real slug for every lucide name written the legacy way", () => {
        for (const slug of ["circle-alert", "shopping-cart", "trash-2"]) {
            expect(isIconName(normalizeIconName(slug.replaceAll("-", "_").toUpperCase()))).toBe(
                true,
            );
        }
    });
});

describe("Icon — normalization", () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        /**
         * The unknown name is loaded on purpose: `iconStatus` only reports
         * `"missing"` once the shard that *would* own the slug has settled, so
         * without this the unknown-name case is still `"loading"` and never warns.
         * Loading the slug itself settles the right shard whatever the current
         * range boundaries are.
         */
        await preloadIcons(["save", "shopping-cart", "definitely-not-an-icon"]);
    });

    afterEach(() => {
        warn.mockRestore();
    });

    it("renders a snake_case icon_code", () => {
        render(<Icon name="SHOPPING_CART" fallback={<span data-testid="ph" />} />);
        expect(document.querySelector("svg")).toHaveClass("lucide-shopping-cart");
    });

    it("renders a code with stray whitespace and capitals", () => {
        render(<Icon name="  Save " />);
        expect(document.querySelector("svg")).toHaveClass("lucide-save");
    });

    it("falls back to nothing under normalize={false}", () => {
        render(<Icon name="  Save " normalize={false} fallback={<span data-testid="ph" />} />);
        expect(screen.getByTestId("ph")).toBeInTheDocument();
        expect(document.querySelector("svg")).toBeNull();
    });

    it("warns naming the code as written, which is what the developer typed", () => {
        render(<Icon name="Definitely_Not_An_Icon" />);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('name="Definitely_Not_An_Icon"');
    });

    it("looks up a registered custom slug through the same normalization", () => {
        registerIcons({ "tempest-test-normalize": Save });
        render(<Icon name="Tempest_Test_Normalize" />);
        expect(document.querySelector("svg")).toHaveClass("lucide-save");
    });
});
