import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Masonry } from "./Masonry";

/**
 * jsdom does no layout, so `ResizeObserver` does not exist and every rect is zero.
 * These stubs give the component a width to pick columns from and a height per
 * card, which is what the packing needs; the packing itself is covered by
 * `masonry-layout.test.ts` without any DOM at all.
 */
function stubLayout({ width, heights }: { width: number; heights: number[] }) {
    const observers: Array<() => void> = [];
    vi.stubGlobal(
        "ResizeObserver",
        class {
            constructor(callback: (entries: Array<{ contentRect: { width: number } }>) => void) {
                observers.push(() => callback([{ contentRect: { width } }]));
            }
            observe() {
                observers[observers.length - 1]?.();
            }
            disconnect() {}
        },
    );

    let call = 0;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
        this: HTMLElement,
    ) {
        const isCard = this.getAttribute("data-card") !== null;
        const height = isCard ? (heights[call++ % heights.length] ?? 1) : 0;
        return {
            width,
            height,
            top: 0,
            left: 0,
            right: width,
            bottom: height,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect;
    });
}

const ITEMS = ["a", "b", "c", "d", "e"];

beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("Masonry", () => {
    it("renders every item once", () => {
        render(<Masonry items={ITEMS}>{(item) => <p>{item}</p>}</Masonry>);
        for (const item of ITEMS) expect(screen.getByText(item)).toBeInTheDocument();
    });

    it("renders one column before it has measured anything", () => {
        // Width starts at 0, and 0 maps to a single column in the default map, so the
        // first paint is a plain stack rather than an empty box.
        const { container } = render(<Masonry items={ITEMS}>{(item) => <p>{item}</p>}</Masonry>);
        expect(container.firstElementChild?.children).toHaveLength(1);
    });

    it("splits into the column count the container width asks for", async () => {
        stubLayout({ width: 1200, heights: [100, 100, 100, 100, 100] });
        const { container } = render(
            <Masonry items={ITEMS}>{(item) => <p data-card>{item}</p>}</Masonry>,
        );
        await waitFor(() => {
            expect(container.firstElementChild?.children).toHaveLength(3);
        });
    });

    it("honors a fixed column count", async () => {
        stubLayout({ width: 1200, heights: [10, 10, 10, 10, 10] });
        const { container } = render(
            <Masonry items={ITEMS} columns={2}>
                {(item) => <p data-card>{item}</p>}
            </Masonry>,
        );
        await waitFor(() => {
            expect(container.firstElementChild?.children).toHaveLength(2);
        });
    });

    it("keeps the reading order down each column", async () => {
        stubLayout({ width: 1200, heights: [10, 10, 10, 10, 10] });
        const { container } = render(
            <Masonry items={ITEMS} columns={2}>
                {(item) => <p data-card>{item}</p>}
            </Masonry>,
        );
        await waitFor(() => expect(container.firstElementChild?.children).toHaveLength(2));
        const firstColumn = container.firstElementChild?.children[0];
        expect(firstColumn?.textContent).toBe("ace");
    });

    it("asks for a stable key for every item", () => {
        const itemKey = vi.fn((item: string) => item);
        render(
            <Masonry items={ITEMS} itemKey={itemKey}>
                {(item) => <p>{item}</p>}
            </Masonry>,
        );
        // Called once per item per render — the count is not the contract, the
        // coverage is.
        for (const item of ITEMS) {
            expect(itemKey).toHaveBeenCalledWith(item, ITEMS.indexOf(item));
        }
    });

    it("passes the index to the renderer", () => {
        render(<Masonry items={ITEMS}>{(item, index) => <p>{`${index}:${item}`}</p>}</Masonry>);
        expect(screen.getByText("0:a")).toBeInTheDocument();
    });

    it("sets the gap through a custom property", () => {
        const { container } = render(
            <Masonry items={ITEMS} gap="2rem">
                {(item) => <p>{item}</p>}
            </Masonry>,
        );
        expect(container.firstElementChild).toHaveStyle({ "--tempest-masonry-gap": "2rem" });
    });

    it("renders nothing but the columns for an empty list", () => {
        const { container } = render(
            <Masonry items={[]}>{(item) => <p>{String(item)}</p>}</Masonry>,
        );
        expect(container.textContent).toBe("");
    });

    it("survives a runtime with no ResizeObserver", () => {
        vi.stubGlobal("ResizeObserver", undefined);
        expect(() =>
            render(<Masonry items={ITEMS}>{(item) => <p>{item}</p>}</Masonry>),
        ).not.toThrow();
        expect(screen.getByText("a")).toBeInTheDocument();
    });

    it("forwards the rest of the DOM props", () => {
        render(
            <Masonry items={ITEMS} data-testid="grid" aria-label="Fotos">
                {(item) => <p>{item}</p>}
            </Masonry>,
        );
        expect(screen.getByTestId("grid")).toHaveAttribute("aria-label", "Fotos");
    });
});
