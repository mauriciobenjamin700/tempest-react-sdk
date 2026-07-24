import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DataTable, type DataTableColumn } from "./DataTable";

type Person = { id: number; name: string; age: number };

const people: Person[] = [
    { id: 1, name: "Charlie", age: 30 },
    { id: 2, name: "Alice", age: 42 },
    { id: 3, name: "Bob", age: 25 },
];

const columns: DataTableColumn<Person>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "age", header: "Age", sortable: true },
];

function firstBodyRowCells(): string[] {
    const rows = screen.getAllByRole("row");
    // rows[0] is the header row.
    const cells = within(rows[1]).getAllByRole("cell");
    return cells.map((cell) => cell.textContent ?? "");
}

describe("DataTable", () => {
    it("renders rows from data", () => {
        render(<DataTable data={people} columns={columns} rowKey={(row) => row.id} />);
        expect(screen.getByText("Charlie")).toBeInTheDocument();
        expect(screen.getByText("Alice")).toBeInTheDocument();
        expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    it("sorts ascending then descending when a sortable header is clicked", async () => {
        const user = userEvent.setup();
        render(<DataTable data={people} columns={columns} rowKey={(row) => row.id} />);

        // Unsorted: first row is the original first entry.
        expect(firstBodyRowCells()[0]).toContain("Charlie");

        const nameHeader = screen.getByRole("button", { name: /ordenar por name/i });
        await user.click(nameHeader);
        // asc → Alice first.
        expect(firstBodyRowCells()[0]).toContain("Alice");

        await user.click(nameHeader);
        // desc → Charlie first.
        expect(firstBodyRowCells()[0]).toContain("Charlie");
    });

    it("filters rows via the search input", async () => {
        const user = userEvent.setup();
        render(<DataTable data={people} columns={columns} searchable rowKey={(row) => row.id} />);

        const input = screen.getByRole("searchbox");
        await user.type(input, "ali");

        expect(screen.getByText("Alice")).toBeInTheDocument();
        expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
        expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    });

    it("paginates and shows different rows on page 2", async () => {
        const user = userEvent.setup();
        const many: Person[] = Array.from({ length: 12 }, (_, i) => ({
            id: i + 1,
            name: `Person ${String(i + 1).padStart(2, "0")}`,
            age: 20 + i,
        }));

        render(<DataTable data={many} columns={columns} pageSize={10} rowKey={(row) => row.id} />);

        expect(screen.getByText("Person 01")).toBeInTheDocument();
        expect(screen.queryByText("Person 11")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: /próxima página/i }));

        expect(screen.getByText("Person 11")).toBeInTheDocument();
        expect(screen.queryByText("Person 01")).not.toBeInTheDocument();
    });
});

describe("DataTable — sorting edges", () => {
    it("cycles asc → desc → unsorted on a third click", async () => {
        render(<DataTable data={people} columns={columns} />);
        const header = screen.getByRole("button", { name: /Ordenar por Name/ });

        await userEvent.click(header);
        expect(firstBodyRowCells()[0]).toBe("Alice");
        await userEvent.click(header);
        expect(firstBodyRowCells()[0]).toBe("Charlie");
        await userEvent.click(header);
        expect(firstBodyRowCells()[0]).toBe("Charlie");
    });

    it("switching columns restarts at ascending", async () => {
        render(<DataTable data={people} columns={columns} />);
        await userEvent.click(screen.getByRole("button", { name: /Ordenar por Name/ }));
        await userEvent.click(screen.getByRole("button", { name: /Ordenar por Age/ }));
        expect(firstBodyRowCells()).toEqual(["Bob", "25"]);
    });

    it("honours initialSort", () => {
        render(
            <DataTable
                data={people}
                columns={columns}
                initialSort={{ key: "age", direction: "desc" }}
            />,
        );
        expect(firstBodyRowCells()).toEqual(["Alice", "42"]);
    });

    it("orders nulls before values, and equal values stably", () => {
        type Row = { name: string | null; flag?: boolean };
        const rows: Row[] = [{ name: "b" }, { name: null }, { name: null }, { name: "a" }];
        render(
            <DataTable<Row>
                data={rows}
                columns={[{ key: "name", header: "Name", sortable: true }]}
                initialSort={{ key: "name", direction: "asc" }}
            />,
        );
        const cells = screen
            .getAllByRole("row")
            .slice(1)
            .map((r) => r.textContent);
        expect(cells[0]).toBe("");
        expect(cells[1]).toBe("");
    });

    it("sorts Date and boolean columns by their natural order", () => {
        type Row = { when: Date; done: boolean };
        const rows: Row[] = [
            { when: new Date("2026-03-01"), done: true },
            { when: new Date("2026-01-01"), done: false },
        ];
        const { unmount } = render(
            <DataTable<Row>
                data={rows}
                columns={[
                    {
                        key: "when",
                        header: "When",
                        sortable: true,
                        render: (r) => r.when.toISOString().slice(0, 10),
                    },
                    { key: "done", header: "Done", sortable: true, render: (r) => String(r.done) },
                ]}
                initialSort={{ key: "when", direction: "asc" }}
            />,
        );
        expect(firstBodyRowCells()[0]).toBe("2026-01-01");
        unmount();

        render(
            <DataTable<Row>
                data={rows}
                columns={[
                    {
                        key: "when",
                        header: "When",
                        sortable: true,
                        render: (r) => r.when.toISOString().slice(0, 10),
                    },
                    { key: "done", header: "Done", sortable: true, render: (r) => String(r.done) },
                ]}
                initialSort={{ key: "done", direction: "asc" }}
            />,
        );
        expect(firstBodyRowCells()[1]).toBe("false");
    });

    it("labels a non-string header by its key", () => {
        render(
            <DataTable
                data={people}
                columns={[{ key: "name", header: <em>Nome</em>, sortable: true }]}
            />,
        );
        expect(screen.getByRole("button", { name: "Ordenar por name" })).toBeInTheDocument();
    });

    it("renders a non-sortable header as plain content", () => {
        render(<DataTable data={people} columns={[{ key: "name", header: "Name" }]} />);
        expect(screen.queryByRole("button", { name: /Ordenar/ })).not.toBeInTheDocument();
    });
});

describe("DataTable — search and empty state", () => {
    it("ignores the search term when searchable is off", async () => {
        render(<DataTable data={people} columns={columns} />);
        expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
        expect(screen.getAllByRole("row")).toHaveLength(people.length + 1);
    });

    it("searches only the explicit searchKeys", async () => {
        render(<DataTable data={people} columns={columns} searchable searchKeys={["name"]} />);
        await userEvent.type(screen.getByRole("searchbox"), "42");
        expect(screen.getByText("Nenhum registro encontrado.")).toBeInTheDocument();
    });

    it("auto-detects string/number columns when searchKeys is omitted", async () => {
        render(<DataTable data={people} columns={columns} searchable />);
        await userEvent.type(screen.getByRole("searchbox"), "42");
        expect(firstBodyRowCells()).toEqual(["Alice", "42"]);
    });

    it("skips non-primitive columns when auto-detecting search keys", async () => {
        type Row = { name: string; tags: string[] };
        const rows: Row[] = [
            { name: "Alice", tags: ["x"] },
            { name: "Bob", tags: ["y"] },
        ];
        render(
            <DataTable<Row>
                data={rows}
                columns={[
                    { key: "name", header: "Name" },
                    { key: "tags", header: "Tags", render: (r) => r.tags.join(",") },
                ]}
                searchable
            />,
        );
        await userEvent.type(screen.getByRole("searchbox"), "y");
        expect(screen.getByText("Nenhum registro encontrado.")).toBeInTheDocument();
    });

    it("treats a whitespace-only term as no filter", async () => {
        render(<DataTable data={people} columns={columns} searchable />);
        await userEvent.type(screen.getByRole("searchbox"), "   ");
        expect(screen.getAllByRole("row")).toHaveLength(people.length + 1);
    });

    it("shows a custom empty message", () => {
        render(<DataTable data={[]} columns={columns} emptyMessage="Sem pessoas" />);
        expect(screen.getByText("Sem pessoas")).toBeInTheDocument();
    });

    it("hides pagination when everything fits on one page", () => {
        render(<DataTable data={people} columns={columns} />);
        expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    });

    it("clamps the page when filtering shrinks the dataset", async () => {
        const many: Person[] = Array.from({ length: 6 }, (_, i) => ({
            id: i,
            name: `P${i}`,
            age: 20 + i,
        }));
        render(<DataTable data={many} columns={columns} pageSize={2} searchable />);
        await userEvent.click(screen.getByRole("button", { name: "3" }));
        await userEvent.type(screen.getByRole("searchbox"), "P1");
        expect(firstBodyRowCells()).toEqual(["P1", "21"]);
    });
});
