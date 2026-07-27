import { useId, useMemo, useState, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/utils/cn";

import { Checkbox } from "../Checkbox";
import { VisuallyHidden } from "../VisuallyHidden";
import {
    applyMove,
    filterItems,
    movableIds,
    splitSides,
    transferStrings,
    type TransferItem,
    type TransferSide,
} from "./transfer-state";
import styles from "./Transfer.module.css";

/** DOM attributes this component redefines. */
type OverriddenDomProps = "children" | "onChange" | "defaultValue";

export interface TransferProps extends Omit<HTMLAttributes<HTMLDivElement>, OverriddenDomProps> {
    /** The whole catalogue. Both panes are derived from it. */
    items: readonly TransferItem[];
    /** Ids on the target side. Controlled. */
    value: readonly string[];
    /** Next value, always in catalogue order. */
    onChange: (value: string[]) => void;
    /** Heading of the left pane. Default `"Disponíveis"`. */
    sourceTitle?: ReactNode;
    /** Heading of the right pane. Default `"Selecionados"`. */
    targetTitle?: ReactNode;
    /** Show a search box above each pane. Default `true` past 8 items. */
    searchable?: boolean;
    /** Custom row body. Gets the item and which side it is on. */
    renderItem?: (item: TransferItem, side: TransferSide) => ReactNode;
    /** Locale for labels. Default `"pt-BR"`. */
    locale?: "pt-BR" | "en";
    /** Height of each pane's scroll area, any CSS length. Default `"16rem"`. */
    height?: string;
    /** Block every move. */
    disabled?: boolean;
}

/**
 * Two panes and a set of move controls: pick a subset out of a catalogue.
 *
 * Controlled on **ids of the target side only**. The panes are derived on every
 * render, never stored, because two stored lists drift the moment the catalogue
 * changes under them — a permission removed upstream lingers in whichever pane
 * held it, and an id in both panes is a bug nobody can see.
 *
 * @example
 * const [roles, setRoles] = useState<string[]>([]);
 *
 * <Transfer
 *     items={allRoles}
 *     value={roles}
 *     onChange={setRoles}
 *     sourceTitle="Papéis disponíveis"
 *     targetTitle="Papéis do usuário"
 * />
 */
export function Transfer({
    items,
    value,
    onChange,
    sourceTitle,
    targetTitle,
    searchable,
    renderItem,
    locale = "pt-BR",
    height = "16rem",
    disabled = false,
    className,
    ...rest
}: TransferProps) {
    const strings = transferStrings(locale);
    const baseId = useId();
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [queries, setQueries] = useState<{ source: string; target: string }>({
        source: "",
        target: "",
    });
    const [announcement, setAnnouncement] = useState("");

    const { source, target } = useMemo(() => splitSides(items, value), [items, value]);
    const withSearch = searchable ?? items.length > 8;

    /**
     * What each pane is showing right now — the filter included.
     *
     * Every control acts on this, not on the pane's full contents: filtering to
     * "sao" and pressing "move all" has to move what you are looking at. Moving
     * rows the filter hid is the kind of surprise that makes people stop trusting
     * the bulk button.
     */
    const visible: Record<TransferSide, TransferItem[]> = {
        source: withSearch ? filterItems(source, queries.source) : [...source],
        target: withSearch ? filterItems(target, queries.target) : [...target],
    };

    const panes: Array<{ side: TransferSide; title: ReactNode; items: TransferItem[] }> = [
        { side: "source", title: sourceTitle ?? strings.sourceTitle, items: source },
        { side: "target", title: targetTitle ?? strings.targetTitle, items: target },
    ];

    /**
     * Move ids and drop them from the checked set.
     *
     * Clearing the checks is the point: after a move the rows are on the other
     * side, and leaving them checked means the next click on the opposite button
     * sends them straight back — which reads as the component undoing itself.
     */
    const move = (moving: readonly string[], to: TransferSide): void => {
        if (disabled || moving.length === 0) return;
        const next = applyMove({ value, moving, to, items });
        const changed = to === "target" ? next.length - value.length : value.length - next.length;
        onChange(next);
        setChecked((current) => {
            const remaining = new Set(current);
            for (const id of moving) remaining.delete(id);
            return remaining;
        });
        if (changed > 0) {
            const sideName = to === "target" ? strings.targetTitle : strings.sourceTitle;
            setAnnouncement(strings.moved(changed, String(sideName).toLowerCase()));
        }
    };

    const toggle = (id: string): void => {
        setChecked((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    /** Ids checked **and visible** on one side — what the move buttons act on. */
    const checkedOn = (side: TransferSide): string[] =>
        movableIds(visible[side]).filter((id) => checked.has(id));

    const checkedSource = checkedOn("source");
    const checkedTarget = checkedOn("target");

    return (
        <div className={cn(styles.wrapper, className)} {...rest}>
            {panes.map((pane) => {
                const shown = visible[pane.side];
                const movable = movableIds(shown);
                const checkedHere = movable.filter((id) => checked.has(id));
                const allChecked = movable.length > 0 && checkedHere.length === movable.length;
                const titleId = `${baseId}-${pane.side}-title`;

                return (
                    <section key={pane.side} className={styles.pane} aria-labelledby={titleId}>
                        <div className={styles.paneHeader}>
                            <div className={styles.paneTitle}>
                                <Checkbox
                                    checked={allChecked}
                                    indeterminate={checkedHere.length > 0 && !allChecked}
                                    disabled={disabled || movable.length === 0}
                                    aria-label={
                                        typeof pane.title === "string"
                                            ? pane.title
                                            : String(pane.side)
                                    }
                                    onChange={() =>
                                        setChecked((current) => {
                                            const next = new Set(current);
                                            for (const id of movable) {
                                                if (allChecked) next.delete(id);
                                                else next.add(id);
                                            }
                                            return next;
                                        })
                                    }
                                />
                                <h3 className={styles.title} id={titleId}>
                                    {pane.title}
                                </h3>
                            </div>
                            <span className={styles.count}>
                                {strings.selected(checkedHere.length, pane.items.length)}
                            </span>
                        </div>

                        {withSearch && (
                            <input
                                type="search"
                                className={styles.search}
                                value={queries[pane.side]}
                                placeholder={strings.search}
                                aria-label={`${strings.search}: ${
                                    typeof pane.title === "string" ? pane.title : pane.side
                                }`}
                                onChange={(event) =>
                                    setQueries((current) => ({
                                        ...current,
                                        [pane.side]: event.target.value,
                                    }))
                                }
                            />
                        )}

                        <ul className={styles.list} style={{ height }}>
                            {shown.length === 0 ? (
                                <li className={styles.empty}>
                                    {queries[pane.side] ? strings.noMatches : strings.empty}
                                </li>
                            ) : (
                                shown.map((item) => (
                                    <li key={item.id} className={styles.row}>
                                        <Checkbox
                                            checked={checked.has(item.id)}
                                            disabled={disabled || item.disabled}
                                            label={
                                                renderItem
                                                    ? renderItem(item, pane.side)
                                                    : item.label
                                            }
                                            onChange={() => toggle(item.id)}
                                            onDoubleClick={() =>
                                                move(
                                                    [item.id],
                                                    pane.side === "source" ? "target" : "source",
                                                )
                                            }
                                        />
                                    </li>
                                ))
                            )}
                        </ul>
                    </section>
                );
            })}

            <div className={styles.controls}>
                <button
                    type="button"
                    className={styles.control}
                    disabled={disabled || movableIds(visible.source).length === 0}
                    aria-label={strings.allToTarget}
                    title={strings.allToTarget}
                    onClick={() => move(movableIds(visible.source), "target")}
                >
                    »
                </button>
                <button
                    type="button"
                    className={styles.control}
                    disabled={disabled || checkedSource.length === 0}
                    aria-label={strings.toTarget}
                    title={strings.toTarget}
                    onClick={() => move(checkedSource, "target")}
                >
                    ›
                </button>
                <button
                    type="button"
                    className={styles.control}
                    disabled={disabled || checkedTarget.length === 0}
                    aria-label={strings.toSource}
                    title={strings.toSource}
                    onClick={() => move(checkedTarget, "source")}
                >
                    ‹
                </button>
                <button
                    type="button"
                    className={styles.control}
                    disabled={disabled || movableIds(visible.target).length === 0}
                    aria-label={strings.allToSource}
                    title={strings.allToSource}
                    onClick={() => move(movableIds(visible.target), "source")}
                >
                    «
                </button>
            </div>

            <VisuallyHidden aria-live="polite" role="status">
                {announcement}
            </VisuallyHidden>
        </div>
    );
}
