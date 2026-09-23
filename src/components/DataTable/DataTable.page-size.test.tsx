import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataTable, type DataTableColumn, type DataTableProps } from "./DataTable";

type Row = { id: number };

const columns: DataTableColumn<Row>[] = [{ key: "id", header: "Id" }];

const rowsOf = (count: number): Row[] => Array.from({ length: count }, (_, id) => ({ id }));

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

/**
 * A server-mode table wired the way a consumer of #359 would wire it.
 *
 * @param props - Starting page, size, total and spies.
 * @returns The table under its own page/size state.
 */
function ServerTable({
    total,
    initialPage = 1,
    initialSize = 10,
    onPage,
    onSize,
}: {
    total: number;
    initialPage?: number;
    initialSize?: number;
    onPage?: (page: number) => void;
    onSize?: (size: number) => void;
}) {
    const [page, setPage] = useState(initialPage);
    const [size, setSize] = useState(initialSize);
    return (
        <>
            <output data-testid="state">{`${page}/${size}`}</output>
            <DataTable<Row>
                data={rowsOf(Math.min(size, total))}
                columns={columns}
                totalItems={total}
                page={page}
                onPageChange={(next) => {
                    onPage?.(next);
                    setPage(next);
                }}
                pageSize={size}
                pageSizeOptions={[10, 25, 50, 100]}
                onPageSizeChange={(next) => {
                    onSize?.(next);
                    setSize(next);
                }}
            />
        </>
    );
}

describe("DataTable — items-per-page selector", () => {
    it("renders no selector when onPageSizeChange is absent", () => {
        render(
            <DataTable<Row>
                data={rowsOf(10)}
                columns={columns}
                totalItems={95}
                page={1}
                onPageChange={vi.fn()}
            />,
        );
        expect(screen.queryByLabelText("Itens por página")).toBeNull();
        expect(screen.getByLabelText("Página anterior")).toBeInTheDocument();
    });

    it("keeps hiding the footer for a single page when no selector is asked for", () => {
        render(<DataTable<Row> data={rowsOf(4)} columns={columns} pageSize={10} />);
        expect(screen.queryByLabelText("Página anterior")).toBeNull();
    });

    it("shows the selector in the built-in footer and reports the size picked", async () => {
        const onSize = vi.fn();
        render(<ServerTable total={95} onSize={onSize} />);
        const select = screen.getByLabelText<HTMLSelectElement>("Itens por página");
        expect(select.value).toBe("10");

        await userEvent.selectOptions(select, "50");

        expect(onSize).toHaveBeenCalledWith(50);
        expect(screen.getByTestId("state")).toHaveTextContent("1/50");
        expect(screen.getAllByLabelText("Itens por página")).toHaveLength(1);
    });

    it("counts pages by the new size once it comes back as pageSize", async () => {
        render(<ServerTable total={95} />);
        expect(screen.getByRole("button", { name: "10" })).toBeInTheDocument();

        await userEvent.selectOptions(screen.getByLabelText("Itens por página"), "25");

        expect(screen.getByRole("button", { name: "4" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "5" })).toBeNull();
    });

    /**
     * Page 7 at 10 per page is rows 61–70; at 100 per page there is one page, so
     * keeping 7 would ask the server for a page that does not exist.
     */
    it("returns to page 1 when the size changes, after reporting the size", async () => {
        const calls: string[] = [];
        render(
            <ServerTable
                total={95}
                initialPage={7}
                onSize={(size) => calls.push(`size:${size}`)}
                onPage={(page) => calls.push(`page:${page}`)}
            />,
        );

        await userEvent.selectOptions(screen.getByLabelText("Itens por página"), "100");

        expect(calls).toEqual(["size:100", "page:1"]);
        expect(screen.getByTestId("state")).toHaveTextContent("1/100");
    });

    it("does not report a page change when already on page 1", async () => {
        const onPage = vi.fn();
        render(<ServerTable total={95} onPage={onPage} />);

        await userEvent.selectOptions(screen.getByLabelText("Itens por página"), "25");

        expect(onPage).not.toHaveBeenCalled();
    });

    /**
     * The defect a plain forward of the three props would have shipped: the footer
     * is gated on `totalPages > 1`, so picking 100 for 40 rows removed the footer
     * and, with it, the only control that could pick 10 again.
     */
    it("keeps the selector on screen when everything fits on one page", async () => {
        render(<ServerTable total={40} />);

        await userEvent.selectOptions(screen.getByLabelText("Itens por página"), "100");

        expect(screen.getByLabelText<HTMLSelectElement>("Itens por página").value).toBe("100");
        await userEvent.selectOptions(screen.getByLabelText("Itens por página"), "10");
        expect(screen.getByTestId("state")).toHaveTextContent("1/10");
    });

    it("resets the internal page in client mode too", async () => {
        function ClientTable() {
            const [size, setSize] = useState(10);
            return (
                <DataTable<Row>
                    data={rowsOf(95)}
                    columns={columns}
                    pageSize={size}
                    onPageSizeChange={setSize}
                />
            );
        }
        render(<ClientTable />);
        await userEvent.click(screen.getByRole("button", { name: "10" }));
        expect(screen.getByRole("button", { name: "10" })).toHaveAttribute("aria-current", "page");

        await userEvent.selectOptions(screen.getByLabelText("Itens por página"), "25");

        expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page");
        expect(screen.getAllByRole("row")).toHaveLength(26);
    });

    it("warns in development when onPageSizeChange has no pageSize to feed back", () => {
        const props = { data: rowsOf(3), columns, onPageSizeChange: vi.fn() };
        render(<DataTable {...(props as unknown as DataTableProps<Row>)} />);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("controlled `pageSize`"));
    });

    it("stays quiet in development for a fully wired selector", () => {
        render(<ServerTable total={95} />);
        expect(warn).not.toHaveBeenCalled();
    });
});
