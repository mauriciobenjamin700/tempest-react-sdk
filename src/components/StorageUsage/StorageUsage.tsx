import { useId, useState, type HTMLAttributes } from "react";
import { cn } from "@/utils/cn";
import { formatBytes } from "@/utils/numbers";
import { Alert } from "../Alert";
import { Button } from "../Button";
import styles from "./StorageUsage.module.css";

/** Every text the component renders, overridable through `labels`. */
export interface StorageUsageLabels {
    /** Heading and accessible name of the meter. */
    title: string;
    /** Usage line, given the formatted `usage` and `quota`. */
    used: (usage: string, quota: string) => string;
    /** Pending line, given the formatted `pendingBytes` (only called when `> 0`). */
    pending: (pending: string) => string;
    /** Shown instead of the pending line when `pendingBytes` is `0`. */
    nothingPending: string;
    /** Shown instead of the meter when `usage` or `quota` is unknown. */
    unsupported: string;
    /** Warning shown when `usage / quota` reaches `warnAt`. */
    overLimit: string;
    /** Warning shown when storage is not persisted and there are pending bytes. */
    notPersisted: string;
    /** Label of the "make storage persistent" button. */
    persistAction: string;
}

const DEFAULT_LABELS: StorageUsageLabels = {
    title: "Armazenamento",
    used: (usage, quota) => `${usage} de ${quota} usados`,
    pending: (pending) => `${pending} pendentes de envio`,
    nothingPending: "Nada pendente de envio",
    unsupported: "Este navegador não informa o uso de armazenamento.",
    overLimit: "Armazenamento quase cheio. Sincronize antes de registrar mais dados.",
    notPersisted:
        "O armazenamento não é permanente: o navegador pode apagar os dados ainda não enviados.",
    persistAction: "Tornar armazenamento permanente",
};

export interface StorageUsageProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
    /** Bytes used by this origin, or `null` when the browser does not report it. */
    usage: number | null;
    /** Bytes available to this origin, or `null` when the browser does not report it. */
    quota: number | null;
    /**
     * Bytes written locally and not yet uploaded, or `null`/omitted when the app
     * does not track them. Omitted hides the pending line.
     */
    pendingBytes?: number | null;
    /**
     * Whether the browser granted persistent storage. `null`/omitted means
     * unknown, and no persistence warning or action is shown.
     */
    persisted?: boolean | null;
    /**
     * `usage / quota` ratio, in `[0, 1]`, from which the meter turns red and the
     * over-limit warning shows. Default `0.8`.
     */
    warnAt?: number;
    /**
     * Called by the "make storage persistent" button, shown only while
     * `persisted === false`. While a returned promise is pending the button
     * shows its loading state. Typically `useStorageEstimate().requestPersist`.
     */
    onRequestPersist?: () => unknown;
    /** Override any rendered text. */
    labels?: Partial<StorageUsageLabels>;
}

/**
 * Show how much browser storage the app uses, how much of it is still waiting to
 * be uploaded, and warn when either should worry the user.
 *
 * The component is presentational on purpose: it never reads `navigator.storage`
 * itself. The numbers come from the app — usually `useStorageEstimate()` for
 * `usage`/`quota`/`persisted`, and the sync engine for `pendingBytes` — and the
 * threshold is the app's decision, because what "almost full" means depends on
 * how big the next write is, which only the app knows.
 *
 * The bar is a `role="meter"`, not a `progressbar`: it is a gauge of a level,
 * not the progress of a task. `aria-valuetext` carries the same "X de Y usados"
 * the eye reads, since a bare percentage of an unknown quota tells a screen
 * reader user less than the bytes do.
 *
 * Warnings use `role="status"` (polite), not the `role="alert"` an `Alert`
 * defaults to: this component usually mounts on a settings or sync screen with
 * the warning already true, and an assertive announcement on every mount would
 * interrupt whatever the reader was saying.
 *
 * `usage` or `quota` `null` (Safari before 17, insecure context, SSR) replaces
 * the meter with a sentence instead of rendering an empty bar that reads as 0%.
 *
 * @example
 * const storage = useStorageEstimate();
 * <StorageUsage
 *     usage={storage.usage}
 *     quota={storage.quota}
 *     persisted={storage.persisted}
 *     pendingBytes={pendingBytes}
 *     warnAt={0.9}
 *     onRequestPersist={storage.requestPersist}
 * />
 */
export function StorageUsage({
    usage,
    quota,
    pendingBytes,
    persisted,
    warnAt = 0.8,
    onRequestPersist,
    labels,
    className,
    ...props
}: StorageUsageProps) {
    const text: StorageUsageLabels = { ...DEFAULT_LABELS, ...labels };
    const titleId = useId();
    const [persisting, setPersisting] = useState<boolean>(false);

    const known = usage !== null && quota !== null && quota > 0;
    const ratio: number = known ? usage / quota : 0;
    const percent: number = Math.round(Math.min(ratio, 1) * 100);
    const overLimit = known && ratio >= warnAt;
    const hasPending = typeof pendingBytes === "number" && pendingBytes > 0;
    const atRisk = persisted === false && hasPending;
    const usedText: string = known ? text.used(formatBytes(usage), formatBytes(quota)) : "";
    const tracksPending = typeof pendingBytes === "number";

    /**
     * Run the app's persist request, keeping the button busy until a returned
     * thenable settles. A rejection is left to propagate to the app's own
     * unhandled-rejection reporting instead of being swallowed here. The check
     * is for a `then` method rather than `instanceof Promise`, so a promise from
     * another realm or a library thenable still drives the loading state.
     */
    function requestPersist(): void {
        const outcome: unknown = onRequestPersist?.();
        const thenable = outcome as { then?: unknown } | null | undefined;
        if (typeof thenable?.then !== "function") return;
        setPersisting(true);
        void Promise.resolve(outcome).finally(() => setPersisting(false));
    }

    return (
        <div className={cn(styles.root, className)} {...props}>
            <div className={styles.header}>
                <span id={titleId} className={styles.title}>
                    {text.title}
                </span>
                {known && <span className={styles.percent}>{percent}%</span>}
            </div>
            {known ? (
                <div
                    role="meter"
                    aria-labelledby={titleId}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    aria-valuetext={usedText}
                    className={styles.track}
                >
                    <div
                        className={cn(styles.fill, overLimit && styles.fillOver)}
                        style={{ width: `${percent}%` }}
                    />
                </div>
            ) : (
                <p className={styles.detail}>{text.unsupported}</p>
            )}
            {(known || tracksPending) && (
                <p className={styles.detail}>
                    {usedText}
                    {known && tracksPending && <span aria-hidden="true"> · </span>}
                    {tracksPending &&
                        (hasPending
                            ? text.pending(formatBytes(pendingBytes))
                            : text.nothingPending)}
                </p>
            )}
            {overLimit && <Alert role="status" variant="danger" description={text.overLimit} />}
            {atRisk && <Alert role="status" variant="warning" description={text.notPersisted} />}
            {persisted === false && onRequestPersist && (
                <div className={styles.actions}>
                    <Button
                        size="sm"
                        variant="outline"
                        loading={persisting}
                        onClick={requestPersist}
                    >
                        {text.persistAction}
                    </Button>
                </div>
            )}
        </div>
    );
}
