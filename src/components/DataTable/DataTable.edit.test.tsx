import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { findA11yViolations, formatA11yViolations } from "../../../test/a11y";
import {
    DataTable,
    type DataTableBaseProps,
    type DataTableCellChange,
    type DataTableColumn,
} from "./DataTable";

interface Person {
    id: number;
    name: string;
    age: number;
}

const people: Person[] = [
    { id: 1, name: "Ada", age: 36 },
    { id: 2, name: "Grace", age: 45 },
];

/** Columns where only `name` is editable, so the read-only path stays exercised. */
function editableColumns(
    overrides: Partial<DataTableColumn<Person>> = {},
): DataTableColumn<Person>[] {
    return [
        { key: "name", header: "Nome", editable: true, ...overrides },
        { key: "age", header: "Idade" },
    ];
}

/**
 * Props this suite is allowed to override.
 *
 * Narrower than `Partial<DataTableProps>` on purpose: the props are a union of
 * the valid paging and sorting shapes, and `Partial` of a union flattens into
 * something none of its members accept. Editing has nothing to do with either
 * axis, so this suite only ever varies the shared half.
 */
type EditTableOverrides = Partial<DataTableBaseProps<Person>>;

function renderTable(
    props: EditTableOverrides = {},
    columns: DataTableColumn<Person>[] = editableColumns(),
) {
    const onCellChange = vi.fn<(change: DataTableCellChange<Person>) => Promise<void>>(
        async () => undefined,
    );
    const view = render(
        <DataTable<Person>
            data={people}
            columns={columns}
            rowKey={(row) => row.id}
            onCellChange={onCellChange}
            {...props}
        />,
    );
    return { view, onCellChange };
}

function trigger(name: string): HTMLElement {
    return screen.getByRole("button", { name });
}

describe("DataTable — inline editing is opt-in", () => {
    it("renders exactly as before when no column is editable", () => {
        const { container } = render(
            <DataTable<Person>
                data={people}
                columns={[
                    { key: "name", header: "Nome" },
                    { key: "age", header: "Idade" },
                ]}
                rowKey={(row) => row.id}
                onCellChange={() => undefined}
            />,
        );
        expect(container.querySelectorAll("button")).toHaveLength(0);
        expect(screen.getByText("Ada")).toBeInTheDocument();
    });

    it("keeps a column read-only when the table has no onCellChange", () => {
        render(
            <DataTable<Person>
                data={people}
                columns={editableColumns()}
                rowKey={(row) => row.id}
            />,
        );
        expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
    });

    it("leaves non-editable columns as plain cells", () => {
        renderTable();
        expect(screen.queryByRole("button", { name: /Idade/ })).not.toBeInTheDocument();
        expect(screen.getByText("36")).toBeInTheDocument();
    });
});

describe("DataTable — editing a cell", () => {
    it("opens an editor, commits on Enter and calls onCellChange", async () => {
        const user = userEvent.setup();
        const { onCellChange } = renderTable();

        await user.click(trigger("Editar Nome: Ada"));
        const input = screen.getByRole("textbox", { name: "Nome, linha 1" });
        await user.clear(input);
        await user.type(input, "Ada Lovelace{Enter}");

        expect(onCellChange).toHaveBeenCalledWith({
            row: people[0],
            key: "name",
            value: "Ada Lovelace",
            previous: "Ada",
            rowIndex: 0,
        });
        await waitFor(() => expect(trigger("Editar Nome: Ada Lovelace")).toBeInTheDocument());
    });

    it("returns focus to the trigger after committing", async () => {
        const user = userEvent.setup();
        renderTable();

        await user.click(trigger("Editar Nome: Ada"));
        await user.keyboard("{Enter}");
        expect(trigger("Editar Nome: Ada")).toHaveFocus();
    });

    it("discards the draft on Escape", async () => {
        const user = userEvent.setup();
        const { onCellChange } = renderTable();

        await user.click(trigger("Editar Nome: Ada"));
        await user.type(screen.getByRole("textbox"), " Byron{Escape}");

        expect(onCellChange).not.toHaveBeenCalled();
        expect(trigger("Editar Nome: Ada")).toHaveFocus();
    });

    it("commits when the user clicks away, instead of eating the edit", async () => {
        const user = userEvent.setup();
        const { onCellChange } = renderTable();

        await user.click(trigger("Editar Nome: Ada"));
        await user.type(screen.getByRole("textbox"), " Byron");
        await user.click(screen.getByText("Idade"));

        expect(onCellChange).toHaveBeenCalledWith(expect.objectContaining({ value: "Ada Byron" }));
    });

    it("does not call onCellChange when nothing was typed", async () => {
        const user = userEvent.setup();
        const { onCellChange } = renderTable();

        await user.click(trigger("Editar Nome: Ada"));
        await user.keyboard("{Enter}");
        expect(onCellChange).not.toHaveBeenCalled();
    });

    it("parses a number column, and honours a custom parse", async () => {
        const user = userEvent.setup();
        const numeric = renderTable({}, [
            { key: "age", header: "Idade", editable: true, editorType: "number" },
        ]);

        await user.click(trigger("Editar Idade: 36"));
        const spin = screen.getByRole("spinbutton", { name: "Idade, linha 1" });
        await user.clear(spin);
        await user.type(spin, "37{Enter}");
        expect(numeric.onCellChange).toHaveBeenCalledWith(expect.objectContaining({ value: 37 }));

        const custom = renderTable({}, [
            {
                key: "name",
                header: "Nome",
                editable: true,
                parse: (raw) => raw.toUpperCase(),
            },
        ]);
        await user.click(screen.getAllByRole("button", { name: "Editar Nome: Ada" })[0]!);
        await user.type(screen.getByRole("textbox"), "x{Enter}");
        expect(custom.onCellChange).toHaveBeenCalledWith(
            expect.objectContaining({ value: "ADAX" }),
        );
    });

    it("uses formatEdit for the draft and the trigger label", async () => {
        const user = userEvent.setup();
        renderTable({}, [
            {
                key: "age",
                header: "Idade",
                editable: true,
                formatEdit: (row) => `${row.age} anos`,
            },
        ]);
        await user.click(trigger("Editar Idade: 36"));
        const input = screen.getByRole("textbox");
        expect(input).toHaveValue("36 anos");
        await user.keyboard("{Enter}");
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("names an empty cell with just the prefix, and can fill it in", async () => {
        const user = userEvent.setup();
        const { onCellChange } = renderTable({
            data: [{ id: 9, name: null as unknown as string, age: 1 }],
        });
        await user.click(trigger("Editar Nome:"));
        await user.type(screen.getByRole("textbox"), "Hedy{Enter}");
        expect(onCellChange).toHaveBeenCalledWith(
            expect.objectContaining({ value: "Hedy", previous: null }),
        );
    });
});

describe("DataTable — Tab walks the editable cells", () => {
    const twoEditable: DataTableColumn<Person>[] = [
        { key: "name", header: "Nome", editable: true },
        { key: "age", header: "Idade", editable: true },
    ];

    it("moves to the next editable cell, committing on the way", async () => {
        const user = userEvent.setup();
        const { onCellChange } = renderTable({}, twoEditable);

        await user.click(trigger("Editar Nome: Ada"));
        await user.type(screen.getByRole("textbox"), " B{Tab}");

        expect(onCellChange).toHaveBeenCalledWith(expect.objectContaining({ key: "name" }));
        expect(screen.getByRole("textbox", { name: "Idade, linha 1" })).toHaveFocus();
    });

    it("wraps into the next row at the end of a row", async () => {
        const user = userEvent.setup();
        renderTable({}, twoEditable);

        await user.click(trigger("Editar Idade: 36"));
        await user.keyboard("{Tab}");
        expect(screen.getByRole("textbox", { name: "Nome, linha 2" })).toHaveFocus();
    });

    it("walks backwards with Shift+Tab", async () => {
        const user = userEvent.setup();
        renderTable({}, twoEditable);

        await user.click(trigger("Editar Idade: 36"));
        await user.keyboard("{Shift>}{Tab}{/Shift}");
        expect(screen.getByRole("textbox", { name: "Nome, linha 1" })).toHaveFocus();
    });

    it("closes and restores focus past the last editable cell", async () => {
        const user = userEvent.setup();
        renderTable({}, twoEditable);

        await user.click(trigger("Editar Idade: 45"));
        await user.keyboard("{Tab}");
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
        expect(trigger("Editar Idade: 45")).toHaveFocus();
    });
});

describe("DataTable — validation", () => {
    it("blocks the commit, keeps the editor open and ties the message to the input", async () => {
        const user = userEvent.setup();
        const { onCellChange } = renderTable({}, [
            {
                key: "name",
                header: "Nome",
                editable: true,
                validate: (value) => (String(value).length < 3 ? "Mínimo de 3 letras." : null),
            },
        ]);

        await user.click(trigger("Editar Nome: Ada"));
        const input = screen.getByRole("textbox");
        await user.clear(input);
        await user.type(input, "Al{Enter}");

        expect(onCellChange).not.toHaveBeenCalled();
        expect(input).toHaveAttribute("aria-invalid", "true");
        const message = screen.getByRole("alert");
        expect(message).toHaveTextContent("Mínimo de 3 letras.");
        expect(input).toHaveAttribute("aria-describedby", message.id);
        expect(input).toHaveValue("Al");
    });

    it("clears the message once a valid value is committed", async () => {
        const user = userEvent.setup();
        renderTable({}, [
            {
                key: "name",
                header: "Nome",
                editable: true,
                validate: (value) => (String(value).length < 3 ? "Mínimo de 3 letras." : null),
            },
        ]);

        await user.click(trigger("Editar Nome: Ada"));
        const input = screen.getByRole("textbox");
        await user.clear(input);
        await user.type(input, "Al{Enter}");
        expect(screen.getByRole("alert")).toBeInTheDocument();

        await user.type(input, "an{Enter}");
        await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    });

    /**
     * After a rejected commit the editor is still open and still focused. Clicking
     * away must not re-submit the same value it already refused, but it must not
     * swallow a *new* edit either — the two halves of the `settled` flag.
     */
    it("does not re-submit a rejected draft on blur, but does submit a fresh one", async () => {
        const user = userEvent.setup();
        const validate = vi.fn((value: unknown) =>
            String(value).length < 5 ? "Curto demais." : null,
        );
        const { onCellChange } = renderTable({}, editableColumns({ validate }));

        await user.click(trigger("Editar Nome: Ada"));
        const input = screen.getByRole("textbox");
        await user.clear(input);
        await user.type(input, "Al{Enter}");
        expect(validate).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("alert")).toHaveTextContent("Curto demais.");

        await user.click(screen.getByText("Idade"));
        expect(validate).toHaveBeenCalledTimes(1);
        expect(onCellChange).not.toHaveBeenCalled();

        await user.type(input, "ice");
        await user.click(screen.getByText("Idade"));
        expect(onCellChange).toHaveBeenCalledWith(expect.objectContaining({ value: "Alice" }));
    });

    it("drops the message when the editor is cancelled", async () => {
        const user = userEvent.setup();
        renderTable({}, [
            {
                key: "name",
                header: "Nome",
                editable: true,
                validate: () => "nunca",
            },
        ]);

        await user.click(trigger("Editar Nome: Ada"));
        await user.type(screen.getByRole("textbox"), "x{Enter}");
        expect(screen.getByRole("alert")).toBeInTheDocument();
        await user.keyboard("{Escape}");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
});

describe("DataTable — optimistic update and rollback", () => {
    it("shows the new value immediately and announces the save", async () => {
        const user = userEvent.setup();
        let release: (() => void) | null = null;
        const onCellChange = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    release = resolve;
                }),
        );
        render(
            <DataTable<Person>
                data={people}
                columns={editableColumns()}
                rowKey={(row) => row.id}
                onCellChange={onCellChange}
            />,
        );

        await user.click(trigger("Editar Nome: Ada"));
        await user.type(screen.getByRole("textbox"), " B{Enter}");

        const pending = trigger("Editar Nome: Ada B");
        expect(pending).toHaveAttribute("aria-busy", "true");

        release!();
        await waitFor(() => expect(trigger("Editar Nome: Ada B")).not.toHaveAttribute("aria-busy"));
        expect(document.querySelector("[data-tempest-announcer='polite']")).toHaveTextContent(
            "Nome salvo",
        );
    });

    it("rolls back to the old value and shows why, instead of reverting silently", async () => {
        const user = userEvent.setup();
        const onCellChange = vi.fn(async () => {
            throw new Error("O servidor recusou: nome duplicado.");
        });
        render(
            <DataTable<Person>
                data={people}
                columns={editableColumns()}
                rowKey={(row) => row.id}
                onCellChange={onCellChange}
            />,
        );

        await user.click(trigger("Editar Nome: Ada"));
        await user.type(screen.getByRole("textbox"), " B{Enter}");

        await waitFor(() =>
            expect(screen.getByRole("alert")).toHaveTextContent(
                "O servidor recusou: nome duplicado.",
            ),
        );
        const restored = trigger("Editar Nome: Ada");
        expect(restored).toHaveAttribute("aria-describedby", screen.getByRole("alert").id);
    });

    it("falls back to its own message when the rejection carries none", async () => {
        const user = userEvent.setup();
        const onCellChange = vi.fn(async () => {
            throw new Error("");
        });
        render(
            <DataTable<Person>
                data={people}
                columns={editableColumns()}
                rowKey={(row) => row.id}
                onCellChange={onCellChange}
            />,
        );

        await user.click(trigger("Editar Nome: Ada"));
        await user.type(screen.getByRole("textbox"), " B{Enter}");
        await waitFor(() =>
            expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível salvar Nome."),
        );
    });

    it("lets the app replace the failure copy", async () => {
        const user = userEvent.setup();
        const onCellChange = vi.fn(async () => {
            throw new Error("");
        });
        render(
            <DataTable<Person>
                data={people}
                columns={editableColumns()}
                rowKey={(row) => row.id}
                onCellChange={onCellChange}
                editLabels={{ saveFailed: (column) => `${column} não foi salvo.` }}
            />,
        );

        await user.click(trigger("Editar Nome: Ada"));
        await user.type(screen.getByRole("textbox"), " B{Enter}");
        await waitFor(() =>
            expect(screen.getByRole("alert")).toHaveTextContent("Nome não foi salvo."),
        );
    });

    /**
     * The trigger's name is built from the cell's rendered content, so a column that
     * upper-cases its value is named `"Editar Nome: ADA"` — matching what is on screen,
     * which is what WCAG 2.5.3 asks for and what voice control needs.
     */
    it("keeps a custom cell renderer in sync with the optimistic value", async () => {
        const user = userEvent.setup();
        renderTable({}, [
            {
                key: "name",
                header: "Nome",
                editable: true,
                render: (row) => <em>{row.name.toUpperCase()}</em>,
            },
        ]);

        await user.click(trigger("Editar Nome: ADA"));
        await user.type(screen.getByRole("textbox"), " B{Enter}");
        await waitFor(() => expect(screen.getByText("ADA B")).toBeInTheDocument());
        expect(trigger("Editar Nome: ADA B")).toBeInTheDocument();
    });

    it("reports the row index in the full dataset, not the page", async () => {
        const user = userEvent.setup();
        const { onCellChange } = renderTable({ pageSize: 1 });

        await user.click(screen.getByRole("button", { name: "Próxima página" }));
        await user.click(trigger("Editar Nome: Grace"));
        await user.type(screen.getByRole("textbox"), "!{Enter}");

        expect(onCellChange).toHaveBeenCalledWith(expect.objectContaining({ rowIndex: 1 }));
    });
});

describe("DataTable — accessibility in edit mode", () => {
    it("has no axe violations closed, open, or showing an error", async () => {
        const user = userEvent.setup();
        const view = render(
            <DataTable<Person>
                data={people}
                columns={[
                    {
                        key: "name",
                        header: "Nome",
                        editable: true,
                        validate: () => "Nome inválido.",
                    },
                    { key: "age", header: "Idade", editable: true, editorType: "number" },
                ]}
                rowKey={(row) => row.id}
                onCellChange={() => undefined}
                searchable
            />,
        );

        expect(formatA11yViolations(await findA11yViolations(view.baseElement))).toBe("");

        await user.click(trigger("Editar Nome: Ada"));
        expect(formatA11yViolations(await findA11yViolations(view.baseElement))).toBe("");

        await user.type(screen.getByRole("textbox", { name: "Nome, linha 1" }), "x{Enter}");
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(formatA11yViolations(await findA11yViolations(view.baseElement))).toBe("");
    });
});
