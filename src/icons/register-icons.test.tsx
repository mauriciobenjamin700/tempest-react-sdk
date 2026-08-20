import { act, render, screen } from "@testing-library/react";
import { Save, Wrench } from "lucide-react";
import { describe, expect, it } from "vitest";

import { Icon } from "./Icon";
import { createIconRegistry } from "./icon-context";
import { IconProvider } from "./IconProvider";
import { iconStatus, peekIcon, registerIcons } from "./shard-cache";

/**
 * Slugs lucide does not ship, so registering them cannot disturb another test
 * file's expectations about the shared shard cache.
 */
const CUSTOM = "tempest-test-mark";
const CUSTOM_OTHER = "tempest-test-other";

describe("registerIcons", () => {
    it("resolves a slug with no provider and no plugin", () => {
        registerIcons({ [CUSTOM]: Wrench });
        render(<Icon name={CUSTOM} />);
        expect(document.querySelector("svg")).toHaveClass("lucide-wrench");
    });

    it("reports the slug as ready, so no dev warning fires", () => {
        registerIcons({ [CUSTOM_OTHER]: Save });
        expect(iconStatus(CUSTOM_OTHER)).toBe("ready");
    });

    it("stores a deprecated slug under its canonical name, so both spellings resolve", () => {
        registerIcons({ "alert-octagon": Wrench });
        expect(peekIcon("alert-octagon")).toBe(Wrench);
        expect(peekIcon("octagon-alert")).toBe(Wrench);
    });

    it("re-renders an <Icon> that already rendered its fallback", () => {
        const slug = "tempest-test-late";
        render(<Icon name={slug} fallback={<span data-testid="ph" />} />);
        expect(screen.getByTestId("ph")).toBeInTheDocument();

        act(() => registerIcons({ [slug]: Wrench }));
        expect(document.querySelector("svg")).toHaveClass("lucide-wrench");
    });

    it("lets a provider registry override the global one for its subtree", () => {
        const slug = "tempest-test-override";
        registerIcons({ [slug]: Wrench });
        render(
            <IconProvider registry={createIconRegistry({ [slug]: Save })}>
                <Icon name={slug} />
            </IconProvider>,
        );
        expect(document.querySelector("svg")).toHaveClass("lucide-save");
    });

    it("is idempotent — re-registering the same component changes nothing", () => {
        const slug = "tempest-test-idempotent";
        registerIcons({ [slug]: Wrench });
        registerIcons({ [slug]: Wrench });
        expect(peekIcon(slug)).toBe(Wrench);
    });
});

describe("Icon — icon prop", () => {
    it("renders the component it was handed, with no lookup", () => {
        render(<Icon icon={Wrench} />);
        expect(document.querySelector("svg")).toHaveClass("lucide-wrench");
    });

    it("still takes the provider's size and strokeWidth defaults", () => {
        render(
            <IconProvider size={18} strokeWidth={3}>
                <Icon icon={Wrench} />
            </IconProvider>,
        );
        const svg = document.querySelector("svg");
        expect(svg).toHaveAttribute("width", "18");
        expect(svg).toHaveAttribute("stroke-width", "3");
    });

    it("passes svg props through", () => {
        render(<Icon icon={Wrench} className="x" aria-label="Chave" data-testid="i" />);
        const svg = screen.getByTestId("i");
        expect(svg).toHaveClass("x");
        expect(svg).toHaveAttribute("aria-label", "Chave");
    });
});
