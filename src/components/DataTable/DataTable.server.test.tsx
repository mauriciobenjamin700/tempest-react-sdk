import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDevWarnings } from "@/utils/dev-warn";

import { DataTable, type DataTableColumn, type DataTableSort } from "./DataTable";

type Person = { id: number; name: string; age: number };

/** One page as a server would return it — deliberately unsorted. */
const pageOne: Person[] = [
    { id: 1, name: "Charlie", age: 30 },
    { id: 2, name: "Alice", age: 42 },
];

const columns: DataTableColumn<Person>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "age", header: "Age", sortable: true },
];

const firstRowText = (): string => {
    const rows = screen.getAllByRole("row");
    return within(rows[1]).getAllByRole("cell")[0]?.textContent ?? "";
};

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    resetDevWarnings();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("DataTable — server mode", () => {
    it("counts pages from totalItems, not from the rows it was handed", () => {
        render(
            <DataTable
                data={pageOne}
                columns={columns}
                rowKey={(row) => row.id}
                pageSize={2}
                totalItems={7}
                page={1}
                onPageChange={vi.fn()}
                onSortChange={vi.fn()}
            />,
        );
        expect(screen.getByText("4", { selector: "button, span" })).toBeInTheDocument();
    });

    it("reports the next page instead of slicing in memory", async () => {
        const user = userEvent.setup();
        const onPageChange = vi.fn();
        render(
            <DataTable
                data={pageOne}
                columns={columns}
                rowKey={(row) => row.id}
                pageSize={2}
                totalItems={7}
                page={1}
                onPageChange={onPageChange}
                onSortChange={vi.fn()}
            />,
        );

        await user.click(screen.getByRole("button", { name: /pr[óo]xima/i }));
        expect(onPageChange).toHaveBeenCalledWith(2);
        expect(screen.getByText("Charlie")).toBeInTheDocument();
    });

    it("renders the page it was given, without paginating it again", () => {
        render(
            <DataTable
                data={pageOne}
                columns={columns}
                rowKey={(row) => row.id}
                pageSize={2}
                totalItems={7}
                page={3}
                onPageChange={vi.fn()}
                onSortChange={vi.fn()}
            />,
        );
        expect(screen.getByText("Charlie")).toBeInTheDocument();
        expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    it("reports a header click and leaves the rows alone", async () => {
        const user = userEvent.setup();
        const onSortChange = vi.fn<(sort: DataTableSort<Person> | null) => void>();
        render(
            <DataTable
                data={pageOne}
                columns={columns}
                rowKey={(row) => row.id}
                totalItems={7}
                page={1}
                onPageChange={vi.fn()}
                onSortChange={onSortChange}
            />,
        );

        await user.click(screen.getByRole("button", { name: /ordenar por name/i }));

        expect(onSortChange).toHaveBeenCalledWith({ key: "name", direction: "asc" });
        expect(firstRowText()).toContain("Charlie");
    });

    it("cycles the reported sort asc → desc → null", async () => {
        const user = userEvent.setup();
        const onSortChange = vi.fn<(sort: DataTableSort<Person> | null) => void>();
        render(
            <DataTable
                data={pageOne}
                columns={columns}
                rowKey={(row) => row.id}
                totalItems={7}
                page={1}
                onPageChange={vi.fn()}
                onSortChange={onSortChange}
            />,
        );

        const header = screen.getByRole("button", { name: /ordenar por name/i });
        await user.click(header);
        await user.click(header);
        await user.click(header);

        expect(onSortChange.mock.calls.map(([sort]) => sort)).toEqual([
            { key: "name", direction: "asc" },
            { key: "name", direction: "desc" },
            null,
        ]);
    });

    it("reports the search term and does not filter the page in memory", async () => {
        const user = userEvent.setup();
        const onSearchChange = vi.fn();
        render(
            <DataTable
                data={pageOne}
                columns={columns}
                rowKey={(row) => row.id}
                searchable
                totalItems={7}
                page={1}
                onPageChange={vi.fn()}
                onSortChange={vi.fn()}
                onSearchChange={onSearchChange}
            />,
        );

        await user.type(screen.getByRole("searchbox"), "zzz");

        expect(onSearchChange).toHaveBeenLastCalledWith("zzz");
        expect(screen.getByText("Charlie")).toBeInTheDocument();
        expect(screen.getByText("Alice")).toBeInTheDocument();
    });
});

describe("DataTable — manual flags without server mode", () => {
    it("delegates sorting when manualSort is set on a full dataset", async () => {
        const user = userEvent.setup();
        const onSortChange = vi.fn();
        render(
            <DataTable
                data={pageOne}
                columns={columns}
                rowKey={(row) => row.id}
                manualSort
                onSortChange={onSortChange}
            />,
        );

        await user.click(screen.getByRole("button", { name: /ordenar por name/i }));
        expect(onSortChange).toHaveBeenCalled();
        expect(firstRowText()).toContain("Charlie");
    });

    it("delegates searching when manualSearch is set on a full dataset", async () => {
        const user = userEvent.setup();
        const onSearchChange = vi.fn();
        render(
            <DataTable
                data={pageOne}
                columns={columns}
                rowKey={(row) => row.id}
                searchable
                manualSearch
                onSearchChange={onSearchChange}
            />,
        );

        await user.type(screen.getByRole("searchbox"), "zzz");
        expect(onSearchChange).toHaveBeenLastCalledWith("zzz");
        expect(screen.getByText("Charlie")).toBeInTheDocument();
    });

    it("still sorts in memory when only onSortChange is given", async () => {
        const user = userEvent.setup();
        const onSortChange = vi.fn();
        render(
            <DataTable
                data={pageOne}
                columns={columns}
                rowKey={(row) => row.id}
                onSortChange={onSortChange}
            />,
        );

        await user.click(screen.getByRole("button", { name: /ordenar por name/i }));
        expect(onSortChange).toHaveBeenCalled();
        expect(firstRowText()).toContain("Alice");
    });
});

describe("DataTable — loading", () => {
    it("shows placeholder rows instead of the empty message on a first load", () => {
        render(
            <DataTable
                data={[]}
                columns={columns}
                rowKey={(row) => row.id}
                loading
                emptyMessage="Nenhum registro"
                totalItems={0}
                page={1}
                onPageChange={vi.fn()}
                onSortChange={vi.fn()}
            />,
        );

        expect(screen.getByTestId("tempest-datatable-body")).toHaveAttribute("aria-busy", "true");
        expect(screen.queryByText("Nenhum registro")).not.toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("keeps the current rows, marked busy, while the next page loads", () => {
        render(
            <DataTable
                data={pageOne}
                columns={columns}
                rowKey={(row) => row.id}
                loading
                totalItems={7}
                page={1}
                onPageChange={vi.fn()}
                onSortChange={vi.fn()}
            />,
        );

        expect(screen.getByText("Charlie")).toBeInTheDocument();
        expect(screen.getByTestId("tempest-datatable-body")).toHaveAttribute("aria-busy", "true");
    });

    it("shows the empty message once loading is over", () => {
        render(
            <DataTable
                data={[]}
                columns={columns}
                rowKey={(row) => row.id}
                emptyMessage="Nenhum registro"
                totalItems={0}
                page={1}
                onPageChange={vi.fn()}
                onSortChange={vi.fn()}
            />,
        );

        expect(screen.getByText("Nenhum registro")).toBeInTheDocument();
    });
});

describe("DataTable — development warnings", () => {
    it("warns when server mode has no controlled page", () => {
        render(
            <DataTable
                data={pageOne}
                columns={columns}
                rowKey={(row) => row.id}
                totalItems={7}
                onSortChange={vi.fn()}
            />,
        );
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("controlled `page`"));
    });

    it("warns when a controlled page has no onPageChange", () => {
        render(
            <DataTable
                data={pageOne}
                columns={columns}
                rowKey={(row) => row.id}
                page={1}
                onSortChange={vi.fn()}
            />,
        );
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("`onPageChange` is missing"));
    });

    it("warns when sorting is delegated with nowhere to report it", () => {
        render(<DataTable data={pageOne} columns={columns} rowKey={(row) => row.id} manualSort />);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("`onSortChange` is missing"));
    });

    it("stays quiet for a fully wired server table", () => {
        render(
            <DataTable
                data={pageOne}
                columns={columns}
                rowKey={(row) => row.id}
                totalItems={7}
                page={1}
                onPageChange={vi.fn()}
                onSortChange={vi.fn()}
            />,
        );
        expect(warn).not.toHaveBeenCalled();
    });

    it("stays quiet for the plain client-side table", () => {
        render(<DataTable data={pageOne} columns={columns} rowKey={(row) => row.id} />);
        expect(warn).not.toHaveBeenCalled();
    });
});
