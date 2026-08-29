import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { VirtualList } from "./VirtualList";
import { VirtualTable, type VirtualTableColumn } from "../VirtualTable/VirtualTable";

interface Item {
    id: number;
    name: string;
}

const ITEMS: Item[] = Array.from({ length: 5000 }, (_, index) => ({
    id: index,
    name: `linha ${index}`,
}));

/**
 * Drive a scroll container by whole rows, the way a wheel does.
 *
 * jsdom computes no layout, so the viewport height and the scroll offset are
 * both set by hand — which is also what makes the render count deterministic.
 *
 * @param element - The scrolling container.
 * @param steps - How many single-row steps to take.
 * @param rowHeight - Height of one row in pixels.
 * @returns Nothing.
 */
function scrollByRows(element: HTMLElement, steps: number, rowHeight: number): void {
    for (let step = 1; step <= steps; step += 1) {
        Object.defineProperty(element, "scrollTop", {
            value: step * rowHeight,
            configurable: true,
        });
        fireEvent.scroll(element);
    }
}

describe("windowed rows are memoised", () => {
    it("VirtualList renders the rows that entered, not the whole window", () => {
        const renderItem = vi.fn((item: Item) => <span>{item.name}</span>);
        const { container } = render(
            <VirtualList
                items={ITEMS}
                itemHeight={40}
                height={400}
                overscan={3}
                getKey={(item) => item.id}
                renderItem={renderItem}
            />,
        );

        const scroller = container.firstElementChild as HTMLDivElement;
        Object.defineProperty(scroller, "clientHeight", { value: 400, configurable: true });
        renderItem.mockClear();
        scrollByRows(scroller, 20, 40);

        expect(renderItem.mock.calls.length).toBeLessThanOrEqual(30);
    });

    it("VirtualTable renders the cells that entered, not every visible cell", () => {
        const cell = vi.fn((row: Item) => <span>{row.name}</span>);
        const columns: VirtualTableColumn<Item>[] = [
            { key: "id", header: "#", width: 80 },
            { key: "name", header: "Nome", width: 240, render: cell },
        ];

        const { container } = render(
            <VirtualTable
                data={ITEMS}
                columns={columns}
                rowHeight={40}
                height={400}
                rowKey={(row) => row.id}
            />,
        );

        const scroller = container.firstElementChild as HTMLDivElement;
        Object.defineProperty(scroller, "clientHeight", { value: 400, configurable: true });
        cell.mockClear();
        scrollByRows(scroller, 20, 40);

        expect(cell.mock.calls.length).toBeLessThanOrEqual(30);
    });

    it("still repaints a row when the renderer starts producing different output", () => {
        function Harness() {
            const [selected, setSelected] = useState<number | null>(null);
            return (
                <>
                    <button onClick={() => setSelected(2)}>selecionar</button>
                    <VirtualList
                        items={ITEMS.slice(0, 20)}
                        itemHeight={40}
                        height={400}
                        getKey={(item) => item.id}
                        renderItem={(item) => (
                            <span>{item.id === selected ? `[${item.name}]` : item.name}</span>
                        )}
                    />
                </>
            );
        }

        render(<Harness />);
        expect(screen.getByText("linha 2")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "selecionar" }));

        expect(screen.getByText("[linha 2]")).toBeInTheDocument();
        expect(screen.queryByText("linha 2")).not.toBeInTheDocument();
    });
});
