import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { VirtualList } from "./VirtualList";

describe("VirtualList", () => {
    it("renders only a window of items", () => {
        const items = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
        render(
            <VirtualList
                items={items}
                itemHeight={20}
                height={100}
                getKey={(row) => row.id}
                renderItem={(row) => <span data-testid={`row-${row.id}`}>{row.id}</span>}
            />,
        );
        // viewport=100/20=5 + overscan ~ < 20 visible
        const rendered = screen.queryAllByTestId(/^row-/);
        expect(rendered.length).toBeLessThan(items.length);
    });
});

/**
 * jsdom performs no layout, so the container reports a zero-height viewport and
 * the list never looks scrollable. This stands in for the browser measurement.
 */
function stubViewport(height: number) {
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
        configurable: true,
        get: () => height,
    });
}

describe("VirtualList — keyboard reach", () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ id: i }));

    const renderList = (count: number) =>
        render(
            <VirtualList
                items={items.slice(0, count)}
                itemHeight={20}
                height={100}
                renderItem={(item) => <div data-testid={`row-${item.id}`}>{item.id}</div>}
            />,
        );

    afterEach(() => {
        Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
    });

    it("takes a tab stop while there are rows past the fold", () => {
        stubViewport(100);
        renderList(1000);
        expect(screen.getByRole("list")).toHaveAttribute("tabindex", "0");
    });

    it("adds none when every row fits — nothing to scroll", () => {
        stubViewport(100);
        renderList(3);
        expect(screen.getByRole("list")).not.toHaveAttribute("tabindex");
    });

    it("names the list when asked", () => {
        stubViewport(100);
        render(
            <VirtualList
                items={items}
                itemHeight={20}
                height={100}
                label="Pedidos"
                renderItem={(item) => <div>{item.id}</div>}
            />,
        );
        expect(screen.getByRole("list")).toHaveAccessibleName("Pedidos");
    });
});
