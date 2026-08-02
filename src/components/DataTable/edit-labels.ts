/** Where a commit should send focus next. */
export type CellCommitMove = "none" | "next" | "previous";

/** Copy for the inline-editing affordances. Every entry has a PT-BR default. */
export interface DataTableEditLabels {
    /**
     * Visually hidden prefix that turns a cell's own content into the button's name.
     *
     * A prefix and not a whole label: the accessible name has to *contain* the visible
     * text (WCAG 2.5.3, Label in Name), and a label built from the raw value would say
     * "850000" over a cell that reads `R$ 8.500,00` — which breaks voice control and
     * makes the screen reader disagree with the screen.
     *
     * A single space is appended when it is rendered, so the name reads
     * `"Editar Salário: R$ 8.500,00"`. Do not add one yourself.
     */
    editCell: (column: string) => string;
    /** Accessible name of the editor input. */
    editor: (column: string, rowNumber: number) => string;
    /** Announced (politely) once a cell saved. */
    saved: (column: string) => string;
    /** Shown in the cell when the save was rejected and no reason was thrown. */
    saveFailed: (column: string) => string;
}

/**
 * PT-BR defaults, matching the rest of the component copy in the SDK.
 *
 * In their own module rather than next to `EditableCell` so that file exports
 * components and nothing else, which is what keeps Fast Refresh working for
 * anyone editing the component.
 */
export const DEFAULT_EDIT_LABELS: DataTableEditLabels = {
    editCell: (column) => `Editar ${column}:`,
    editor: (column, rowNumber) => `${column}, linha ${rowNumber}`,
    saved: (column) => `${column} salvo`,
    saveFailed: (column) => `Não foi possível salvar ${column}.`,
};
