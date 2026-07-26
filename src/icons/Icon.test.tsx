import { render, screen, waitFor } from "@testing-library/react";
import { Save } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Icon } from "./Icon";
import { createIconRegistry } from "./icon-context";
import { IconProvider } from "./IconProvider";
import { preloadIcons } from "./shard-cache";

/**
 * Read the rendered lucide `<svg>`, which carries the icon slug in its class list
 * (`lucide lucide-save`). Asserting on that is how a test tells *which* icon
 * rendered, not merely that something did.
 */
function svg(): SVGSVGElement | null {
    return document.querySelector("svg");
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
    warn.mockRestore();
});

describe("Icon — registry path", () => {
    it("renders a registry icon on the first frame, with no async wait", () => {
        render(
            <IconProvider registry={createIconRegistry({ save: Save })}>
                <Icon name="save" />
            </IconProvider>,
        );
        expect(svg()).toHaveClass("lucide-save");
    });

    it("passes size and strokeWidth through", () => {
        render(
            <IconProvider registry={createIconRegistry({ save: Save })}>
                <Icon name="save" size={18} strokeWidth={3} />
            </IconProvider>,
        );
        expect(svg()).toHaveAttribute("width", "18");
        expect(svg()).toHaveAttribute("stroke-width", "3");
    });

    it("takes size and strokeWidth defaults from the provider", () => {
        render(
            <IconProvider registry={createIconRegistry({ save: Save })} size={40} strokeWidth={1}>
                <Icon name="save" />
            </IconProvider>,
        );
        expect(svg()).toHaveAttribute("width", "40");
        expect(svg()).toHaveAttribute("stroke-width", "1");
    });

    it("lets an explicit prop win over the provider default", () => {
        render(
            <IconProvider registry={createIconRegistry({ save: Save })} size={40}>
                <Icon name="save" size={12} />
            </IconProvider>,
        );
        expect(svg()).toHaveAttribute("width", "12");
    });

    it("forwards arbitrary SVG props", () => {
        render(
            <IconProvider registry={createIconRegistry({ save: Save })}>
                <Icon name="save" className="x" aria-label="Salvar" data-testid="i" />
            </IconProvider>,
        );
        const el = screen.getByTestId("i");
        expect(el).toHaveClass("x");
        expect(el).toHaveAttribute("aria-label", "Salvar");
    });
});

describe("Icon — lazy shard path", () => {
    it("resolves a slug with no provider at all", async () => {
        render(<Icon name="trash-2" />);
        await waitFor(() => expect(svg()).toHaveClass("lucide-trash-2"));
    });

    it("resolves a deprecated alias to its canonical icon", async () => {
        render(<Icon name="alert-circle" />);
        await waitFor(() => expect(svg()).toHaveClass("lucide-circle-alert"));
    });

    it("renders a second icon from an already-loaded shard on its first frame", async () => {
        const { unmount } = render(<Icon name="save" />);
        await waitFor(() => expect(svg()).toHaveClass("lucide-save"));
        unmount();

        render(<Icon name="search" />);
        expect(svg()).toHaveClass("lucide-search");
    });

    it("renders the fallback while the shard is in flight", async () => {
        render(<Icon name="landmark" fallback={<span data-testid="ph" />} />);
        expect(screen.getByTestId("ph")).toBeInTheDocument();
        await waitFor(() => expect(svg()).toHaveClass("lucide-landmark"));
    });

    it("preloadIcons removes the fallback frame entirely", async () => {
        await preloadIcons(["utensils"]);
        render(<Icon name="utensils" fallback={<span data-testid="ph" />} />);
        expect(screen.queryByTestId("ph")).not.toBeInTheDocument();
        expect(svg()).toHaveClass("lucide-utensils");
    });
});

describe("Icon — unknown slug", () => {
    it("renders nothing and does not throw without a fallback", async () => {
        const { container } = render(<Icon name="definitely-not-an-icon" />);
        await waitFor(() => expect(warn).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });

    it("renders the fallback", async () => {
        render(<Icon name="also-not-an-icon" fallback={<span data-testid="ph" />} />);
        expect(screen.getByTestId("ph")).toBeInTheDocument();
        await waitFor(() => expect(warn).toHaveBeenCalled());
    });

    it("warns only once for a repeated unknown slug", async () => {
        render(
            <>
                <Icon name="nope-not-here" />
                <Icon name="nope-not-here" />
            </>,
        );
        await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    });

    it("warns once naming the slug and the kebab-case convention", async () => {
        render(<Icon name="CircleAlert" />);
        await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
        expect(warn.mock.calls[0][0]).toContain('name="CircleAlert"');
        expect(warn.mock.calls[0][0]).toContain("kebab-case");
    });

    it("does not warn while a real icon's shard is still loading", () => {
        render(<Icon name="wallet" />);
        expect(warn).not.toHaveBeenCalled();
    });
});
