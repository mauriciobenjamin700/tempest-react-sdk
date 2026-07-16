import type { HTMLAttributes } from "react";
import { AlertTriangle, Check, CloudOff, RefreshCw, UploadCloud } from "lucide-react";
import { cn } from "@/utils/cn";
import type { SyncTone } from "@/offline";
import styles from "./SyncStatusBadge.module.css";

const DEFAULT_LABELS: Record<SyncTone, string> = {
    idle: "Sincronizado",
    syncing: "Sincronizando…",
    pending: "Pendente",
    offline: "Offline",
    error: "Erro",
};

const ICONS: Record<SyncTone, typeof Check> = {
    idle: Check,
    syncing: RefreshCw,
    pending: UploadCloud,
    offline: CloudOff,
    error: AlertTriangle,
};

export interface SyncStatusBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
    /** The dominant tone. Feed from `useSyncStatus(sync).tone`. */
    tone: SyncTone;
    /** Number of queued mutations, appended to the label when `> 0`. */
    pending?: number;
    /** Override the per-tone label text. */
    labels?: Partial<Record<SyncTone, string>>;
    /** Show the pending count next to the label. Default `true`. */
    showPending?: boolean;
    /** Render only the icon (no text). Default `false`. */
    iconOnly?: boolean;
}

/**
 * Compact pill showing offline-sync status: a tone-colored icon plus a label
 * and optional pending count. Presentational — drive it from
 * `useSyncStatus(sync)` so it stays decoupled from the engine and testable
 * without IndexedDB.
 *
 * @example
 * const { tone, pending } = useSyncStatus(notesSync);
 * <SyncStatusBadge tone={tone} pending={pending} />
 */
export function SyncStatusBadge({
    tone,
    pending = 0,
    labels,
    showPending = true,
    iconOnly = false,
    className,
    ...props
}: SyncStatusBadgeProps) {
    const Icon = ICONS[tone];
    const label = labels?.[tone] ?? DEFAULT_LABELS[tone];
    const showCount = showPending && pending > 0 && (tone === "pending" || tone === "error");
    return (
        <span
            className={cn(styles.badge, styles[tone], className)}
            role="status"
            aria-live="polite"
            title={label}
            {...props}
        >
            <Icon
                className={cn(styles.icon, tone === "syncing" && styles.spin)}
                size={14}
                aria-hidden="true"
            />
            {!iconOnly && <span className={styles.label}>{label}</span>}
            {showCount && <span className={styles.count}>{pending}</span>}
        </span>
    );
}
