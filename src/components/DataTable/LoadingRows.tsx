import { Skeleton } from "../Skeleton";
import styles from "./DataTable.module.css";

/** Props for {@link LoadingRows}. */
export interface LoadingRowsProps {
    /** How many placeholder cells to draw per row. */
    columns: number;
    /** How many placeholder rows to draw. */
    rows: number;
}

/**
 * Placeholder rows for a table that has nothing to show yet.
 *
 * A first load and an empty result are different statements, and the usual
 * shortcut — showing `emptyMessage` while the request is in flight — tells the
 * user "there is nothing here" and then contradicts itself a moment later.
 * Drawing rows at roughly the real height also keeps whatever sits below the
 * table from jumping when the data lands.
 *
 * The whole block is `aria-hidden`: it carries no information a screen reader can
 * use, and the busy state is already on the wrapper. It also stays out of
 * `role="status"`, which the table's announcement region already occupies —
 * two status regions on one table means the second one is what gets ignored.
 *
 * @param props - Grid size to fill.
 * @returns The placeholder block.
 */
export function LoadingRows({ columns, rows }: LoadingRowsProps) {
    return (
        <div className={styles.loading} aria-hidden="true">
            {Array.from({ length: rows }, (_, rowIndex) => (
                <div key={rowIndex} className={styles.loadingRow}>
                    {Array.from({ length: Math.max(columns, 1) }, (_, cellIndex) => (
                        <Skeleton key={cellIndex} variant="text" />
                    ))}
                </div>
            ))}
        </div>
    );
}
