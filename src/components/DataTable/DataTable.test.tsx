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
