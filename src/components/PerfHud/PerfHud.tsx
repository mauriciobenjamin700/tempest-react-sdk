import type { CSSProperties, HTMLAttributes } from "react";
import { formatDurationMs } from "@/perf/format";
import type {
    BatteryStatus,
    CpuPressureState,
    InputTiming,
    InteractionReport,
    PerfSnapshot,
} from "@/perf/monitor-types";
import { cn } from "@/utils/cn";
import styles from "./PerfHud.module.css";

/** Every text the HUD renders, overridable through `labels`. */
export interface PerfHudLabels {
    /** Accessible name of the panel and text of its toggle. */
    title: string;
    battery: string;
    charging: string;
    discharging: string;
    /** Drain rate, given the formatted `%/h`. */
    drain: (rate: string) => string;
    /** Shown while fewer than two level changes were seen on battery. */
    drainPending: string;
    cpu: string;
    pressure: Record<CpuPressureState, string>;
    lastInput: string;
    inputDelay: string;
    processing: string;
    presentation: string;
    interactions: string;
    /** Long-frame line of a report, given the formatted duration and count. */
    longFrames: (duration: string, count: number) => string;
    failed: string;
    /** Shown in place of a value the browser does not expose. */
    unavailable: string;
    /** Shown while no interaction was traced yet. */
    empty: string;
}

const DEFAULT_LABELS: PerfHudLabels = {
    title: "Desempenho",
    battery: "Bateria",
    charging: "carregando",
    discharging: "na bateria",
    drain: (rate) => `${rate} %/h`,
    drainPending: "medindo consumo…",
    cpu: "CPU",
    pressure: { nominal: "normal", fair: "moderada", serious: "alta", critical: "crítica" },
    lastInput: "Último toque",
    inputDelay: "espera",
    processing: "handler",
    presentation: "pintura",
    interactions: "Interações",
    longFrames: (duration, count) => `${duration} travado em ${count} frame(s) longo(s)`,
    failed: "falhou",
    unavailable: "indisponível neste navegador",
    empty: "Nenhuma interação medida ainda.",
};

const PRESSURE_TONE: Record<CpuPressureState, string> = {
    nominal: styles.toneOk ?? "",
    fair: styles.toneOk ?? "",
    serious: styles.toneWarn ?? "",
    critical: styles.toneDanger ?? "",
};

const CORNER_CLASS = {
    "bottom-right": "bottomRight",
    "bottom-left": "bottomLeft",
    "top-right": "topRight",
    "top-left": "topLeft",
} as const;

export interface PerfHudProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
    /** The live state, usually `usePerfMonitor(monitor)`. */
    snapshot: PerfSnapshot;
    /**
     * Where the panel sits. A corner keeps it `position: fixed` over the app;
     * `"inline"` renders it in the flow, for a debug page. Default
     * `"bottom-right"`.
     */
    position?: "bottom-right" | "bottom-left" | "top-right" | "top-left" | "inline";
    /** How many interactions to list. Default `5`. */
    maxReports?: number;
    /** Start expanded. Default `false`. */
    defaultOpen?: boolean;
    /** Override any rendered text. */
    labels?: Partial<PerfHudLabels>;
}

/**
 * Percentage of `total` a value takes, clamped to `[0, 100]`.
 *
 * @param value Part.
 * @param total Whole.
 * @returns A CSS percentage.
 */
function percent(value: number, total: number): string {
    if (total <= 0) return "0%";
    return `${Math.min(100, Math.max(0, (value / total) * 100))}%`;
}

/**
 * Battery line.
 *
 * @param props The status and labels.
 * @returns The rendered row.
 */
function BatteryRow({
    battery,
    supported,
    labels,
}: {
    battery: BatteryStatus | null;
    supported: boolean;
    labels: PerfHudLabels;
}) {
    let value = labels.unavailable;
    if (battery) {
        const state = battery.charging ? labels.charging : labels.discharging;
        const drain = battery.charging
            ? ""
            : ` · ${
                  battery.drainPerHour === null
                      ? labels.drainPending
                      : labels.drain(battery.drainPerHour.toFixed(1))
              }`;
        value = `${Math.round(battery.level * 100)}% ${state}${drain}`;
    } else if (supported) {
        value = "…";
    }
    return (
        <div className={styles.row}>
            <dt className={styles.key}>{labels.battery}</dt>
            <dd className={styles.value}>{value}</dd>
        </div>
    );
}

/**
 * Input latency split into its three phases.
 *
 * @param props The gesture and labels.
 * @returns The rendered block.
 */
function InputBlock({ input, labels }: { input: InputTiming; labels: PerfHudLabels }) {
    const total = input.inputDelayMs + input.processingMs + input.presentationMs;
    const phases = [
        { key: labels.inputDelay, ms: input.inputDelayMs, tone: styles.phaseDelay },
        { key: labels.processing, ms: input.processingMs, tone: styles.phaseProcessing },
        { key: labels.presentation, ms: input.presentationMs, tone: styles.phasePresentation },
    ];
    return (
        <section className={styles.section} aria-label={labels.lastInput}>
            <p className={styles.heading}>
                {labels.lastInput} · {input.type}{" "}
                <span className={styles.total}>{formatDurationMs(input.durationMs)}</span>
            </p>
            <div className={styles.stack} aria-hidden="true">
                {phases.map((phase) => (
                    <span
                        key={phase.key}
                        className={cn(styles.stackPart, phase.tone)}
                        style={{ width: percent(phase.ms, total) }}
                    />
                ))}
            </div>
            <ul className={styles.legend}>
                {phases.map((phase) => (
                    <li key={phase.key}>
                        <span className={cn(styles.swatch, phase.tone)} aria-hidden="true" />
                        {phase.key} {formatDurationMs(phase.ms)}
                    </li>
                ))}
            </ul>
        </section>
    );
}

/**
 * One traced interaction as a waterfall of its steps.
 *
 * @param props The report and labels.
 * @returns The rendered item.
 */
function ReportItem({ report, labels }: { report: InteractionReport; labels: PerfHudLabels }) {
    return (
        <li className={styles.report}>
            <div className={styles.reportHead}>
                <span className={styles.reportName}>{report.name}</span>
                {report.failed ? <span className={styles.failed}>{labels.failed}</span> : null}
                <span className={styles.total}>{formatDurationMs(report.totalMs)}</span>
            </div>
            {report.cpu.longFrameMs !== null && report.cpu.longFrames ? (
                <p className={styles.note}>
                    {labels.longFrames(
                        formatDurationMs(report.cpu.longFrameMs),
                        report.cpu.longFrames,
                    )}
                </p>
            ) : null}
            <ol className={styles.spans}>
                {report.spans.map((span, index) => (
                    <li
                        key={`${span.path}-${index}`}
                        className={styles.span}
                        style={{ "--perf-hud-depth": span.depth } as CSSProperties}
                    >
                        <span className={styles.spanName}>{span.name}</span>
                        <span className={styles.track} aria-hidden="true">
                            <span
                                className={cn(styles.bar, span.failed && styles.barFailed)}
                                style={{
                                    left: percent(span.startMs, report.totalMs),
                                    width: percent(span.durationMs, report.totalMs),
                                }}
                            />
                        </span>
                        <span className={styles.spanTime}>{formatDurationMs(span.durationMs)}</span>
                    </li>
                ))}
            </ol>
        </li>
    );
}

/**
 * Development overlay with the live numbers of a `createPerfMonitor()`:
 * battery level and drain rate, CPU pressure, the latency of the last gesture
 * split into input delay / handler / paint, and a waterfall of the last traced
 * interactions.
 *
 * Presentational: it reads nothing from the browser. The data comes from
 * `usePerfMonitor(monitor)`, so the same monitor that feeds production
 * telemetry feeds the HUD, and the app decides when to mount it (typically
 * only in development or behind a feature flag).
 *
 * Collapsed by default to a one-line summary inside a native `<details>`, so
 * it stays keyboard-operable without script and does not cover the app.
 * Every value the browser withholds (battery and pressure on Safari/Firefox)
 * reads "indisponível" instead of a fake zero. Bars are decorative
 * (`aria-hidden`); each one has its number written next to it.
 *
 * @example
 * ```tsx
 * import { PerfHud, createPerfMonitor, usePerfMonitor } from "tempest-react-sdk";
 *
 * const perf = createPerfMonitor();
 *
 * export function DevOverlay() {
 *     const snapshot = usePerfMonitor(perf);
 *     return import.meta.env.DEV ? <PerfHud snapshot={snapshot} /> : null;
 * }
 * ```
 */
export function PerfHud({
    snapshot,
    position = "bottom-right",
    maxReports = 5,
    defaultOpen = false,
    labels,
    className,
    ...props
}: PerfHudProps) {
    const text: PerfHudLabels = { ...DEFAULT_LABELS, ...labels };
    const last = snapshot.reports[0];
    const input = snapshot.inputs[0];
    const summary = [
        snapshot.battery ? `${Math.round(snapshot.battery.level * 100)}%` : null,
        snapshot.pressure ? `${text.cpu} ${text.pressure[snapshot.pressure]}` : null,
        last ? `${last.name} ${formatDurationMs(last.totalMs)}` : null,
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <aside
            aria-label={text.title}
            className={cn(
                styles.root,
                position === "inline" ? styles.inline : styles.floating,
                position !== "inline" && styles[CORNER_CLASS[position]],
                className,
            )}
            {...props}
        >
            <details open={defaultOpen}>
                <summary className={styles.summary}>
                    <span className={styles.title}>{text.title}</span>
                    {summary ? <span className={styles.summaryText}>{summary}</span> : null}
                </summary>
                <div className={styles.body}>
                    <dl className={styles.facts}>
                        <BatteryRow
                            battery={snapshot.battery}
                            supported={snapshot.support.battery}
                            labels={text}
                        />
                        <div className={styles.row}>
                            <dt className={styles.key}>{text.cpu}</dt>
                            <dd
                                className={cn(
                                    styles.value,
                                    snapshot.pressure && PRESSURE_TONE[snapshot.pressure],
                                )}
                            >
                                {snapshot.pressure
                                    ? text.pressure[snapshot.pressure]
                                    : snapshot.support.pressure
                                      ? "…"
                                      : text.unavailable}
                            </dd>
                        </div>
                    </dl>
                    {input ? <InputBlock input={input} labels={text} /> : null}
                    <section className={styles.section} aria-label={text.interactions}>
                        <p className={styles.heading}>{text.interactions}</p>
                        {snapshot.reports.length === 0 ? (
                            <p className={styles.note}>{text.empty}</p>
                        ) : (
                            <ul className={styles.reports}>
                                {snapshot.reports.slice(0, maxReports).map((report) => (
                                    <ReportItem
                                        key={`${report.name}-${report.startTime}`}
                                        report={report}
                                        labels={text}
                                    />
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </details>
        </aside>
    );
}
