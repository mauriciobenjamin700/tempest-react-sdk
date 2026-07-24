import type { HTMLAttributes } from "react";
import { AlertTriangle, Check, CloudOff, RefreshCw, UploadCloud } from "lucide-react";
import { cn } from "@/utils/cn";
import type { OfflineSync, SyncTone } from "@/offline";
import { useSyncStatus } from "@/offline/use-offline-sync";
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
    /**
     * The dominant tone. Required when `sync` is not passed. Ignored when `sync`
     * is passed (the tone is derived from the engine).
     */
    tone?: SyncTone;
    /**
     * An `OfflineSync` engine to observe directly. When set, the badge wires
     * `useSyncStatus` internally, so `tone` and `pending` come from the engine.
     */
    sync?: OfflineSync<unknown>;
    /** Number of queued mutations, appended to the label when `> 0`. */
    pending?: number;
    /** Override the per-tone label text. */
    labels?: Partial<Record<SyncTone, string>>;
    /** Show the pending count next to the label. Default `true`. */
    showPending?: boolean;
    /** Render only the icon (no text). Default `false`. */
    iconOnly?: boolean;
}

type PresentationalProps = Omit<SyncStatusBadgeProps, "sync">;

function PresentationalBadge({
    tone = "idle",
    pending = 0,
    labels,
    showPending = true,
    iconOnly = false,
    className,
    ...props
}: PresentationalProps) {
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

function ConnectedBadge({ sync, ...rest }: PresentationalProps & { sync: OfflineSync<unknown> }) {
    const { tone, pending } = useSyncStatus(sync);
    return <PresentationalBadge {...rest} tone={tone} pending={pending} />;
}

/**
 * Compact pill showing offline-sync status: a tone-colored icon plus a label
 * and optional pending count.
 *
 * Two modes: pass `sync` to have the badge observe an engine via
 * `useSyncStatus` (zero wiring), or pass an explicit `tone` (+ `pending`) to
 * keep it presentational and testable without IndexedDB.
 *
 * @example
 * // Connected — auto-wires the engine:
 * <SyncStatusBadge sync={notesSync} />
 *
 * // Presentational — you own the state:
 * const { tone, pending } = useSyncStatus(notesSync);
 * <SyncStatusBadge tone={tone} pending={pending} />
 */
export function SyncStatusBadge({ sync, ...rest }: SyncStatusBadgeProps) {
    if (sync) return <ConnectedBadge sync={sync} {...rest} />;
    return <PresentationalBadge {...rest} />;
}
