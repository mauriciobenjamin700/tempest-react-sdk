import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DataTable, type DataTableSort } from "./DataTable";

type Row = { id: number; name: string };
const rows: Row[] = [
    { id: 1, name: "João" },
    { id: 2, name: "Usuários" },
    { id: 3, name: "Ana" },
];
const columns = [{ key: "name" as const, header: "Nome", sortable: true }];
const firstName = () => screen.getAllByRole("row")[1]!.textContent;

afterEach(() => {
    vi.useRealTimers();
});

/** #712: a sort that lives outside the table, and the arrow that follows it. */
describe("DataTable — controlled sort", () => {
    it("orders by the sort it is given and follows it when it changes from outside", () => {
        const { rerender } = render(
            <DataTable<Row>
                data={rows}
                columns={columns}
                sort={{ key: "name", direction: "asc" }}
                onSortChange={() => {}}
            />,
        );
        expect(firstName()).toBe("Ana");
        rerender(
            <DataTable<Row>
                data={rows}
                columns={columns}
                sort={{ key: "name", direction: "desc" }}
                onSortChange={() => {}}
            />,
        );
        expect(firstName()).toBe("Usuários");
        expect(screen.getByRole("button", { name: "Ordenar por Nome" })).toHaveTextContent("▼");
    });

    it("reports a header click without moving until the caller feeds the sort back", async () => {
        const onSortChange = vi.fn();
        render(
            <DataTable<Row>
                data={rows}
                columns={columns}
                sort={null}
                onSortChange={onSortChange}
            />,
        );
        await userEvent.click(screen.getByRole("button", { name: "Ordenar por Nome" }));
        expect(onSortChange).toHaveBeenCalledWith({ key: "name", direction: "asc" });
        expect(firstName()).toBe("João");
    });

    it("documents the old gap: initialSort is still read once, on mount", () => {
        const { rerender } = render(
            <DataTable<Row>
                data={rows}
                columns={columns}
                initialSort={{ key: "name", direction: "asc" }}
            />,
        );
        rerender(
            <DataTable<Row>
                data={rows}
                columns={columns}
                initialSort={{ key: "name", direction: "desc" }}
            />,
        );
        expect(firstName()).toBe("Ana");
    });
});

/** #712: a term that lives outside the table (the URL), and the box that shows it. */
describe("DataTable — controlled search", () => {
    function UrlLike({
        debounce = 0,
        onSearch,
    }: {
        debounce?: number;
        onSearch?: (t: string) => void;
    }) {
        const [term, setTerm] = useState("ana");
        return (
            <>
                <button type="button" onClick={() => setTerm("")}>
                    voltar
                </button>
                <DataTable<Row>
                    data={rows}
                    columns={columns}
                    searchable
                    search={term}
                    searchDebounceMs={debounce}
                    onSearchChange={(next) => {
                        onSearch?.(next);
                        setTerm(next);
                    }}
                />
            </>
        );
    }

    it("opens with the controlled term in the box and the rows filtered by it", () => {
        render(<UrlLike />);
        expect(screen.getByRole("searchbox")).toHaveValue("ana");
        expect(screen.getAllByRole("row")).toHaveLength(2);
    });

    it("rewrites the box when the term changes from outside, like the back button", async () => {
        render(<UrlLike />);
        await userEvent.click(screen.getByRole("button", { name: "voltar" }));
        expect(screen.getByRole("searchbox")).toHaveValue("");
        expect(screen.getAllByRole("row")).toHaveLength(4);
    });

    it("commits once per pause under searchDebounceMs, keeping every keystroke in the box", () => {
        vi.useFakeTimers();
        const onSearch = vi.fn();
        render(<UrlLike debounce={300} onSearch={onSearch} />);
        const box = screen.getByRole("searchbox");
        for (const value of ["", "j", "jo", "joa", "joao"]) {
            fireEvent.change(box, { target: { value } });
            act(() => vi.advanceTimersByTime(100));
        }
        expect(box).toHaveValue("joao");
        expect(onSearch).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(300));
        expect(onSearch.mock.calls).toEqual([["joao"]]);
        expect(box).toHaveValue("joao");
    });
});

/** #730 and #732: what the box matches and what it is called. */
describe("DataTable — search box", () => {
    it("finds accented rows from an unaccented term, and the reverse", async () => {
        render(<DataTable<Row> data={rows} columns={columns} searchable />);
        const box = screen.getByRole("searchbox");
        await userEvent.type(box, "joao");
        expect(screen.getByText("João")).toBeInTheDocument();
        await userEvent.clear(box);
        await userEvent.type(box, "USUÁRIOS");
        expect(screen.getByText("Usuários")).toBeInTheDocument();
    });

    it("has an accessible name by default, and takes the caller's name and placeholder", () => {
        const { rerender } = render(<DataTable<Row> data={rows} columns={columns} searchable />);
        expect(screen.getByRole("searchbox", { name: "Buscar na tabela" })).toHaveAttribute(
            "placeholder",
            "Buscar...",
        );
        rerender(
            <DataTable<Row>
                data={rows}
                columns={columns}
                searchable
                searchLabel="Buscar produtos"
                searchPlaceholder="Nome ou SKU"
            />,
        );
        expect(screen.getByRole("searchbox", { name: "Buscar produtos" })).toHaveAttribute(
            "placeholder",
            "Nome ou SKU",
        );
    });

    it("does not report page 1 on every keystroke when already on page 1", async () => {
        const onPageChange = vi.fn();
        render(
            <DataTable<Row>
                data={rows}
                columns={columns}
                searchable
                page={1}
                onPageChange={onPageChange}
            />,
        );
        await userEvent.type(screen.getByRole("searchbox"), "an");
        expect(onPageChange).not.toHaveBeenCalled();
    });
});

/** The union keeps the controlled pairs together. */
describe("DataTableProps — controlled pairs", () => {
    it("rejects a controlled sort or search with nobody to report to", () => {
        const sort: DataTableSort<Row> = { key: "name", direction: "asc" };
        // @ts-expect-error sort requires onSortChange
        expect(<DataTable data={rows} columns={columns} sort={sort} />).toBeTruthy();
        // @ts-expect-error search requires onSearchChange
        expect(<DataTable data={rows} columns={columns} search="x" />).toBeTruthy();
        // @ts-expect-error selectable requires selectedKeys and onSelectionChange
        expect(<DataTable data={rows} columns={columns} selectable />).toBeTruthy();
    });
});
