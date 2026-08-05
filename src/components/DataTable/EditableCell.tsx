/**
 * @tempest-limits props-count, function-lines — an editable cell has to be announced
 * as well as rendered: columnLabel and rowNumber build the accessible name, labels
 * holds the button copy, and error/errorId wire the message to the input. The rest
 * is the edit lifecycle (editing, refocus, saving, onOpen, onCommit, onCancel) that
 * DataTable drives from outside.
 */
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { VisuallyHidden } from "../VisuallyHidden";
import type { CellCommitMove, DataTableEditLabels } from "./edit-labels";
import styles from "./DataTable.module.css";

interface CellEditorProps {
    /** Text the editor opens with. */
    initial: string;
    /** `<input type>` for the editor. */
    type: string;
    /** Accessible name. */
    label: string;
    /** Id of the message element, when there is one. */
    describedBy?: string;
    /** Whether the current draft was rejected by validation. */
    invalid: boolean;
    /** Commit the draft. The parent decides whether the editor closes. */
    onCommit: (raw: string, move: CellCommitMove) => void;
    /** Discard the draft. */
    onCancel: () => void;
}

/**
 * The `<input>` half of an editable cell.
 *
 * A separate component so it **mounts fresh** every time a cell opens: the draft
 * then starts from the current value through `useState`'s initialiser, with no
 * effect syncing props into state and no render where the draft is stale.
 *
 * `Tab` is intercepted rather than left to the browser. Default tab order would
 * walk into the next row's trigger button, which is one keystroke away from the
 * next *editor* — and in a table the reader is editing, moving cell to cell is the
 * expected behaviour. `Escape` discards; `Enter` commits and closes; blur commits,
 * because clicking away from a half-typed cell and losing the typing is a data-loss
 * bug users report as "the table ate my edit".
 *
 * `autoFocus` is safe here in a way it is not on page load: the editor only exists
 * because the user just clicked the cell or pressed `Tab` into it, so focus is
 * following the interaction rather than stealing it.
 *
 * The `settled` flag stops a keyboard commit from being repeated by the blur that
 * follows it. Typing clears the flag again, because after a commit the parent
 * rejected — the only case where the editor is still open and focused — the draft is
 * live once more, and dropping *that* edit on blur would be the same data loss the
 * blur-commits rule exists to prevent.
 */
function CellEditor({
    initial,
    type,
    label,
    describedBy,
    invalid,
    onCommit,
    onCancel,
}: CellEditorProps) {
    const [draft, setDraft] = useState<string>(initial);
    const settled = useRef(false);

    function finish(move: CellCommitMove): void {
        settled.current = true;
        onCommit(draft, move);
    }

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
        if (event.key === "Enter") {
            event.preventDefault();
            finish("none");
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            settled.current = true;
            onCancel();
            return;
        }
        if (event.key === "Tab") {
            event.preventDefault();
            finish(event.shiftKey ? "previous" : "next");
        }
    }

    return (
        <input
            autoFocus
            className={cn(styles.cellEditor, invalid && styles.cellEditorInvalid)}
            type={type}
            value={draft}
            aria-label={label}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => {
                settled.current = false;
                setDraft(event.target.value);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => {
                if (settled.current) return;
                finish("none");
            }}
        />
    );
}

export interface EditableCellProps {
    /** Rendered value, used when the cell is closed. */
    children: ReactNode;
    /** Plain-text value, for the editor's initial draft and the trigger's name. */
    text: string;
    /** Header text of this column, for accessible names. */
    columnLabel: string;
    /** 1-based row number on the current page. */
    rowNumber: number;
    /** `<input type>` for the editor. */
    inputType: string;
    /** Whether this cell owns the open editor. */
    editing: boolean;
    /** Return focus to the trigger when the editor closes (Enter/Escape, not Tab). */
    refocus: boolean;
    /** A save is in flight for this cell. */
    saving: boolean;
    /** Validation or save error to surface, or null. */
    error: string | null;
    /** Stable id used for `aria-describedby` on the input and the trigger. */
    errorId: string;
    /** Copy for the affordances. */
    labels: DataTableEditLabels;
    /** Open the editor. */
    onOpen: () => void;
    /** Commit a draft. */
    onCommit: (raw: string, move: CellCommitMove) => void;
    /** Close without committing. */
    onCancel: () => void;
}

/**
 * One cell of a {@link DataTable} column marked `editable`.
 *
 * Closed, it is a button carrying the value — a plain `<td>` with a click handler
 * would be invisible to a keyboard and unnamed to a screen reader, and a
 * `tabIndex`-only cell announces no role. Open, it is an `<input>`.
 *
 * The button's name comes from its **contents**: a visually hidden "Editar {coluna}:"
 * in front of whatever the column rendered. An `aria-label` built from the raw value
 * would read "850000" over a cell showing `R$ 8.500,00`, which fails WCAG 2.5.3 (Label
 * in Name) and leaves voice control unable to address the cell by what it says.
 *
 * The error message is a `role="alert"` tied to the input (and to the trigger once
 * the editor closes) through `aria-describedby`, so a rejected save is announced and
 * then still reachable — an optimistic update that rolls back silently leaves the
 * user believing the edit stuck.
 */
export function EditableCell({
    children,
    text,
    columnLabel,
    rowNumber,
    inputType,
    editing,
    refocus,
    saving,
    error,
    errorId,
    labels,
    onOpen,
    onCommit,
    onCancel,
}: EditableCellProps) {
    const trigger = useRef<HTMLButtonElement | null>(null);
    const wasEditing = useRef(false);

    useEffect(() => {
        if (!editing && wasEditing.current && refocus) trigger.current?.focus();
        wasEditing.current = editing;
    }, [editing, refocus]);

    return (
        <span className={styles.cellWrap}>
            {editing ? (
                <CellEditor
                    initial={text}
                    type={inputType}
                    label={labels.editor(columnLabel, rowNumber)}
                    describedBy={error ? errorId : undefined}
                    invalid={error !== null}
                    onCommit={onCommit}
                    onCancel={onCancel}
                />
            ) : (
                <button
                    ref={trigger}
                    type="button"
                    className={cn(styles.cellButton, error && styles.cellButtonInvalid)}
                    aria-describedby={error ? errorId : undefined}
                    aria-busy={saving || undefined}
                    onClick={onOpen}
                >
                    <VisuallyHidden>{labels.editCell(columnLabel)}</VisuallyHidden> {children}
                </button>
            )}
            {error && (
                <span className={styles.cellError} id={errorId} role="alert">
                    {error}
                </span>
            )}
        </span>
    );
}
