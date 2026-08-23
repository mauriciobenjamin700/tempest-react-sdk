import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VirtualTable, type VirtualTableColumn } from "./VirtualTable";

interface Row {
    id: number;
    name: string;
    total: number;
}

const COLUMNS: VirtualTableColumn<Row>[] = [
    { key: "id", header: "#", width: 60, sortable: true },
    { key: "name", header: "Nome", width: 200, sortable: true },
    { key: "total", header: "Total", width: 100, align: "right", sortable: true },
];

/** Build `count` rows whose `name` and `total` are deliberately anti-sorted by id. */
function rows(count: number): Row[] {
    return Array.from({ length: count }, (_, i) => ({
        id: i,
        name: `Item ${count - i}`,
        total: (count - i) * 10,
    }));
}

/**
 * Render with a fixed viewport height.
 *
 * jsdom does no layout, so `clientHeight` is always 0 and the component would
 * compute a window of `overscan * 2` rows. Stubbing the prototype getter gives the
 * viewport a real size, which is what lets the window arithmetic be asserted.
 */
function renderTable(props: Partial<Parameters<typeof VirtualTable<Row>>[0]> = {}) {
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
    return render(
        <VirtualTable<Row>
            data={rows(10_000)}
            columns={COLUMNS}
            rowHeight={20}
            height={200}
            rowKey={(row) => row.id}
            {...props}
        />,
    );
}

/** The `<tr>` elements that carry real data (spacers are aria-hidden). */
function dataRows(container: HTMLElement): HTMLElement[] {
    return [...container.querySelectorAll("tbody tr:not([aria-hidden])")] as HTMLElement[];
}

describe("VirtualTable — windowing", () => {
    it("renders a window instead of all 10 000 rows", () => {
        const { container } = renderTable();
        const rendered = dataRows(container);
        expect(rendered.length).toBeGreaterThan(0);
        expect(rendered.length).toBeLessThan(40);
    });

    it("accounts for every row through the trailing spacer", () => {
        const { container } = renderTable();
        const spacers = [...container.querySelectorAll("tbody tr[aria-hidden]")] as HTMLElement[];
        const rendered = dataRows(container);
        const spacerHeight = spacers.reduce(
            (sum, el) => sum + parseInt(el.style.height || "0", 10),
            0,
        );
        expect(spacerHeight + rendered.length * 20).toBe(10_000 * 20);
    });

    it("has no leading spacer at the top of the list", () => {
        const { container } = renderTable();
        const first = container.querySelector("tbody tr") as HTMLElement;
        expect(first.hasAttribute("aria-hidden")).toBe(false);
    });

    it("renders different rows after scrolling", () => {
        const { container } = renderTable();
        expect(screen.queryByText("Item 10000")).toBeInTheDocument();

        fireEvent.scroll(container.firstElementChild as HTMLElement, {
            target: { scrollTop: 20_000 },
        });

        expect(screen.queryByText("Item 10000")).not.toBeInTheDocument();
        expect(dataRows(container).length).toBeGreaterThan(0);
    });

    it("stays within bounds when scrolled to the very end", () => {
        const { container } = renderTable();
        fireEvent.scroll(container.firstElementChild as HTMLElement, {
            target: { scrollTop: 10_000 * 20 },
        });
        const indices = dataRows(container).map((el) => Number(el.getAttribute("aria-rowindex")));
        expect(Math.max(...indices)).toBeLessThanOrEqual(10_000);
    });

    it("renders every row when the dataset is smaller than the window", () => {
        const { container } = renderTable({ data: rows(3) });
        expect(dataRows(container)).toHaveLength(3);
        expect(container.querySelectorAll("tbody tr[aria-hidden]")).toHaveLength(0);
    });
});

describe("VirtualTable — accessibility", () => {
    it("reports the real total on the table, not the window size", () => {
        const { container } = renderTable();
        expect(container.querySelector("table")).toHaveAttribute("aria-rowcount", "10000");
    });

    it("gives each row its index in the full dataset", () => {
        const { container } = renderTable();
        fireEvent.scroll(container.firstElementChild as HTMLElement, {
            target: { scrollTop: 20_000 },
        });
        const first = dataRows(container)[0];
        expect(Number(first.getAttribute("aria-rowindex"))).toBeGreaterThan(900);
    });

    it("marks the spacer rows as hidden from assistive technology", () => {
        const { container } = renderTable();
        const spacers = container.querySelectorAll("tbody tr[aria-hidden]");
        expect(spacers.length).toBeGreaterThan(0);
    });

    it("exposes a caption as the accessible name", () => {
        renderTable({ caption: "Pedidos" });
        expect(screen.getByRole("table", { name: "Pedidos" })).toBeInTheDocument();
    });

    it("marks sortable headers with aria-sort and unsortable ones without", () => {
        renderTable({
            columns: [
                { key: "id", header: "#", sortable: true },
                { key: "name", header: "Nome" },
            ],
        });
        expect(screen.getByRole("columnheader", { name: /#/ })).toHaveAttribute(
            "aria-sort",
            "none",
        );
        expect(screen.getByRole("columnheader", { name: "Nome" })).not.toHaveAttribute("aria-sort");
    });
});

describe("VirtualTable — sorting", () => {
    it("cycles asc → desc → unsorted", () => {
        const { container } = renderTable({ data: rows(50) });
        const header = screen.getByRole("button", { name: /Nome/ });
        const firstName = () => dataRows(container)[0].children[1].textContent;

        expect(firstName()).toBe("Item 50");

        fireEvent.click(header);
        expect(firstName()).toBe("Item 1");
        expect(screen.getByRole("columnheader", { name: /Nome/ })).toHaveAttribute(
            "aria-sort",
            "ascending",
        );

        fireEvent.click(header);
        expect(screen.getByRole("columnheader", { name: /Nome/ })).toHaveAttribute(
            "aria-sort",
            "descending",
        );

        fireEvent.click(header);
        expect(firstName()).toBe("Item 50");
        expect(screen.getByRole("columnheader", { name: /Nome/ })).toHaveAttribute(
            "aria-sort",
            "none",
        );
    });

    it("sorts numbers numerically, not lexicographically", () => {
        const data: Row[] = [
            { id: 1, name: "a", total: 100 },
            { id: 2, name: "b", total: 9 },
            { id: 3, name: "c", total: 80 },
        ];
        const { container } = renderTable({ data });
        fireEvent.click(screen.getByRole("button", { name: /Total/ }));
        const totals = dataRows(container).map((el) => el.children[2].textContent);
        expect(totals).toEqual(["9", "80", "100"]);
    });

    it("honours initialSort before any interaction", () => {
        const { container } = renderTable({
            data: rows(50),
            initialSort: { key: "name", direction: "asc" },
        });
        expect(dataRows(container)[0].children[1].textContent).toBe("Item 1");
    });

    it("resets the scroll offset when the sort changes", () => {
        const { container } = renderTable({ data: rows(500) });
        const scroll = container.firstElementChild as HTMLElement;
        fireEvent.scroll(scroll, { target: { scrollTop: 4000 } });
        expect(Number(dataRows(container)[0].getAttribute("aria-rowindex"))).toBeGreaterThan(100);

        fireEvent.click(screen.getByRole("button", { name: /Nome/ }));
        expect(dataRows(container)[0].getAttribute("aria-rowindex")).toBe("1");
    });
});

describe("VirtualTable — rows", () => {
    it("renders custom cell content", () => {
        renderTable({
            data: rows(3),
            columns: [{ key: "name", header: "Nome", render: (row) => <b>{row.name}!</b> }],
        });
        expect(screen.getByText("Item 3!")).toBeInTheDocument();
    });

    it("calls onRowClick with the row and its index in the full dataset", () => {
        const onRowClick = vi.fn();
        const { container } = renderTable({ data: rows(500), onRowClick });
        fireEvent.scroll(container.firstElementChild as HTMLElement, {
            target: { scrollTop: 2000 },
        });
        const row = dataRows(container)[0];
        fireEvent.click(row);
        const [, index] = onRowClick.mock.calls[0];
        expect(index).toBe(Number(row.getAttribute("aria-rowindex")) - 1);
    });

    it("activates a row from the keyboard", () => {
        const onRowClick = vi.fn();
        const { container } = renderTable({ data: rows(3), onRowClick });
        const row = dataRows(container)[0];
        expect(row).toHaveAttribute("tabIndex", "0");

        fireEvent.keyDown(row, { key: "Enter" });
        fireEvent.keyDown(row, { key: " " });
        expect(onRowClick).toHaveBeenCalledTimes(2);

        fireEvent.keyDown(row, { key: "a" });
        expect(onRowClick).toHaveBeenCalledTimes(2);
    });

    it("leaves rows out of the tab order when there is no click handler", () => {
        const { container } = renderTable({ data: rows(3) });
        expect(dataRows(container)[0]).not.toHaveAttribute("tabIndex");
    });

    it("shows the empty message for an empty dataset", () => {
        renderTable({ data: [], emptyMessage: "Sem pedidos" });
        expect(screen.getByText("Sem pedidos")).toBeInTheDocument();
    });
});

describe("VirtualTable — scrollToIndex", () => {
    it("scrolls the requested row into view", () => {
        const { container } = renderTable({ data: rows(500), scrollToIndex: 300 });
        expect((container.firstElementChild as HTMLElement).scrollTop).toBe(300 * 20);
    });

    it("clamps an out-of-range index", () => {
        const { container } = renderTable({ data: rows(10), scrollToIndex: 9999 });
        expect((container.firstElementChild as HTMLElement).scrollTop).toBe(9 * 20);
    });
});

describe("VirtualTable — the column shapes the defaults cover", () => {
    it("centres a column, keys rows by position and renders an absent cell as nothing", () => {
        vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
        const sparse = [{ id: 1, name: "Único" }] as Row[];

        const { container } = render(
            <VirtualTable<Row>
                data={sparse}
                columns={[
                    { key: "name", header: "Nome", align: "center" },
                    { key: "total", header: "Total" },
                ]}
                rowHeight={20}
                height={200}
            />,
        );

        const cells = container.querySelectorAll("tbody tr:not([aria-hidden]) td");
        expect(cells[0].className).toContain("alignCenter");
        expect(cells[1]).toBeEmptyDOMElement();
    });
});

describe("VirtualTable — measuring the viewport with a ResizeObserver", () => {
    /**
     * jsdom ships no `ResizeObserver`, so the component's observe branch never
     * runs there and the viewport is measured once. This double records the
     * subscription and hands the callback back, which is what lets a resize be
     * simulated.
     */
    function stubResizeObserver(): { fire: () => void; disconnected: () => number } {
        let callback: (() => void) | null = null;
        let disconnects = 0;
        class FakeResizeObserver {
            constructor(handler: () => void) {
                callback = handler;
            }
            observe(): void {}
            unobserve(): void {}
            disconnect(): void {
                disconnects += 1;
            }
        }
        vi.stubGlobal("ResizeObserver", FakeResizeObserver);
        return { fire: () => callback?.(), disconnected: () => disconnects };
    }

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("re-measures on resize and stops observing when it unmounts", () => {
        const observer = stubResizeObserver();
        let height = 200;
        vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => height);

        const { container, unmount } = render(
            <VirtualTable<Row>
                data={rows(1000)}
                columns={COLUMNS}
                rowHeight={20}
                height={200}
                rowKey={(row) => row.id}
            />,
        );
        const before = dataRows(container).length;

        height = 800;
        act(() => observer.fire());
        expect(dataRows(container).length).toBeGreaterThan(before);

        unmount();
        expect(observer.disconnected()).toBe(1);
    });
});
