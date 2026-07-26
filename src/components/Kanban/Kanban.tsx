/* eslint-disable react-hooks/refs -- `getItemProps` is called during render and its
   handlers close over `useSortable`'s mirror refs, so the rule reports the call site
   here. The refs are only written from event handlers and read from a window
   listener; the two reads that were genuinely render-time (the drag group in the
   rendered class/aria, and the group lookup inside `commit`) were fixed instead of
   silenced — see the hook's docstring. */
import { useMemo } from "react";
import type { ReactNode } from "react";
import { useSortable } from "@/hooks/use-sortable";
import { cn } from "@/utils/cn";
import styles from "./Kanban.module.css";

/** One card on the board. */
export interface KanbanCard {
    /** Stable identifier, unique across the whole board. */
    id: string;
    /** Card body. A string renders as the card's title. */
    content: ReactNode;
}

/** One column of the board. */
export interface KanbanColumn {
    /** Stable identifier, used as the drop group. */
    id: string;
    /** Column heading. */
    title: ReactNode;
    /** Cards in display order. */
    cards: KanbanCard[];
    /**
     * Refuses drops into this column. The cards inside can still be picked up and
     * moved elsewhere — a "done" column that no longer accepts work, for instance.
     */
    locked?: boolean;
}

/** Where a card ended up. */
export interface KanbanMove {
    cardId: string;
    fromColumn: string;
    toColumn: string;
    /** Index within the destination column. */
    toIndex: number;
}

export interface KanbanProps {
    columns: KanbanColumn[];
    /**
     * Called once per committed move — on pointer release or on a keyboard drop.
     * You own the data: apply the move and pass the new `columns` back.
     */
    onMove: (move: KanbanMove) => void;
    /** Renders a card. Defaults to its `content`. */
    renderCard?: (card: KanbanCard, column: KanbanColumn) => ReactNode;
    /** Text shown in a column with no cards. */
    emptyLabel?: ReactNode;
    /** Announced per card, so a screen reader user learns the keyboard contract. */
    cardRoleDescription?: string;
    /**
     * Accessible name of the board. A `listbox` without a name is unusable with a
     * screen reader, so this has a default rather than being optional in practice.
     */
    label?: string;
    /** Blocks all dragging. */
    disabled?: boolean;
    className?: string;
}

/**
 * Kanban board: columns of cards, reorderable within a column and movable across
 * columns, by pointer **or** keyboard.
 *
 * The drag machine is `useSortable` — the board does not reimplement it. Cards are
 * indexed globally across columns so a single sortable can span the whole board;
 * the component translates that flat index back into `{ column, index }` for
 * `onMove`, which is the shape an app actually needs.
 *
 * Nothing is mutated here: `onMove` reports the intent once and the parent applies
 * it. That keeps the board a controlled value and avoids a re-render per pointer
 * frame.
 *
 * ARIA shape: **one `listbox` per column**, named by the column title, containing
 * only `option` cards. A single board-wide listbox does not survive the markup a
 * board needs — `listbox` requires `option`/`group` children, and the column header
 * and card wrapper in between break that ownership. Per-column listboxes also read
 * better: a screen reader announces which column it is in and how many cards it
 * holds. The column header is a plain `div`, not a `<header>`, because outside a
 * sectioning element every `<header>` becomes a page-level banner landmark — with
 * three columns that is three duplicate banners. An **empty** column is not marked
 * as a listbox at all: a listbox with zero options fails `aria-required-children`,
 * and "no cards" is exactly zero options.
 *
 * Known limitation: a **keyboard** move can only target positions that hold a card,
 * because the move walks the flat index space of existing cards. Dropping into an
 * empty column works by pointer; by keyboard it does not. Moving a card to a column
 * that already has one card, then reordering, is the workaround until column-switch
 * keys land.
 *
 * @example
 * ```tsx
 * const [columns, setColumns] = useState<KanbanColumn[]>([
 *   { id: "todo", title: "A fazer", cards: [{ id: "1", content: "Corrigir login" }] },
 *   { id: "doing", title: "Fazendo", cards: [] },
 *   { id: "done", title: "Feito", cards: [], locked: true },
 * ]);
 *
 * <Kanban
 *   columns={columns}
 *   onMove={({ cardId, fromColumn, toColumn, toIndex }) =>
 *     setColumns((current) => applyKanbanMove(current, { cardId, fromColumn, toColumn, toIndex }))
 *   }
 * />
 * ```
 */
export function Kanban({
    columns,
    onMove,
    renderCard,
    emptyLabel = "Nenhum card",
    cardRoleDescription = "Card do quadro — Espaço pega, setas movem, Espaço solta",
    label = "Quadro",
    disabled = false,
    className,
}: KanbanProps) {
    /**
     * Flat view of every card, in column order.
     *
     * `useSortable` works on a single index space, so the board flattens itself and
     * keeps the mapping back to `{ column, index }` here — the only place that has
     * to know both shapes.
     */
    const flat = useMemo(
        () =>
            columns.flatMap((column, columnIndex) =>
                column.cards.map((card, cardIndex) => ({ card, column, columnIndex, cardIndex })),
            ),
        [columns],
    );

    const sortable = useSortable({
        itemCount: flat.length,
        disabled,
        roleDescription: cardRoleDescription,
        onReorder: ({ from, to, fromGroup, toGroup }) => {
            const source = flat[from];
            if (!source) return;

            const destinationId = toGroup ?? fromGroup ?? source.column.id;
            const destination = columns.find((column) => column.id === destinationId);
            if (!destination || destination.locked) return;

            const target = flat[to];
            const toIndex =
                target && target.column.id === destinationId
                    ? target.cardIndex
                    : destination.cards.length;

            onMove({
                cardId: source.card.id,
                fromColumn: source.column.id,
                toColumn: destinationId,
                toIndex,
            });
        },
    });

    /**
     * First flat index of each column.
     *
     * Derived instead of counted with a mutable `flatIndex++` during render: a
     * render-scoped counter mutated inside the map is exactly the pattern the React
     * Compiler rules reject, and for good reason — a partial or replayed render
     * would resume from a half-advanced counter.
     */
    const columnOffsets = useMemo(() => {
        const offsets: number[] = [];
        let start = 0;
        for (const column of columns) {
            offsets.push(start);
            start += column.cards.length;
        }
        return offsets;
    }, [columns]);

    return (
        <div className={cn(styles.board, className)} aria-label={label} ref={sortable.setContainer}>
            {columns.map((column, columnIndex) => {
                const isDropTarget = sortable.overGroup === column.id && !column.locked;
                return (
                    <div
                        key={column.id}
                        className={cn(
                            styles.column,
                            isDropTarget && styles.columnActive,
                            column.locked && styles.columnLocked,
                        )}
                    >
                        <div className={styles.columnHeader}>
                            <span className={styles.columnTitle}>{column.title}</span>
                            <span className={styles.count}>{column.cards.length}</span>
                        </div>

                        <div
                            className={styles.cards}
                            {...(column.cards.length > 0 ? sortable.getListProps() : {})}
                            aria-label={typeof column.title === "string" ? column.title : column.id}
                        >
                            {column.cards.map((card, cardIndex) => {
                                const index = columnOffsets[columnIndex] + cardIndex;
                                const isActive = sortable.activeIndex === index;
                                const isOver = sortable.overIndex === index && !isActive;
                                return (
                                    <div
                                        key={card.id}
                                        {...sortable.getItemProps(index, column.id)}
                                        className={cn(
                                            styles.card,
                                            isActive && styles.cardActive,
                                            isOver && styles.cardOver,
                                        )}
                                    >
                                        {renderCard ? renderCard(card, column) : card.content}
                                    </div>
                                );
                            })}

                            {column.cards.length === 0 ? (
                                <div
                                    {...sortable.getEmptyGroupProps(column.id)}
                                    className={styles.empty}
                                >
                                    {emptyLabel}
                                </div>
                            ) : null}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Apply a {@link KanbanMove} to a column list, returning new arrays.
 *
 * Exported because every consumer needs the same reducer.
 *
 * `toIndex` is the position of the card that was dropped **onto**, read from the
 * board as it looked before the move. Inserting at that same index *after* removing
 * the dragged card lands where the user aimed in both directions — moving down, the
 * removal shifts the target up by one and the insertion lands after it; moving up,
 * nothing shifted. Compensating for the shift (the "obvious" `toIndex - 1`) is what
 * turns a one-step move down into a no-op.
 *
 * @param columns - Current board.
 * @param move - The move reported by `onMove`.
 * @returns A new column list, or the same reference when the move cannot apply.
 */
export function applyKanbanMove(columns: KanbanColumn[], move: KanbanMove): KanbanColumn[] {
    const fromColumn = columns.find((column) => column.id === move.fromColumn);
    const card = fromColumn?.cards.find((candidate) => candidate.id === move.cardId);
    if (!fromColumn || !card) return columns;

    const insertAt = move.toIndex;

    return columns.map((column) => {
        if (column.id === move.fromColumn && column.id === move.toColumn) {
            const without = column.cards.filter((candidate) => candidate.id !== move.cardId);
            without.splice(insertAt, 0, card);
            return { ...column, cards: without };
        }
        if (column.id === move.fromColumn) {
            return { ...column, cards: column.cards.filter((c) => c.id !== move.cardId) };
        }
        if (column.id === move.toColumn) {
            const next = column.cards.slice();
            next.splice(insertAt, 0, card);
            return { ...column, cards: next };
        }
        return column;
    });
}
