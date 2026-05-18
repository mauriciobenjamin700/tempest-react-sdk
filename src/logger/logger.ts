export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
    level: LogLevel;
    message: string;
    context?: Record<string, unknown>;
    timestamp: number;
}

export interface LoggerSink {
    (entry: LogEntry): void;
}

export interface Logger {
    debug: (message: string, context?: Record<string, unknown>) => void;
    info: (message: string, context?: Record<string, unknown>) => void;
    warn: (message: string, context?: Record<string, unknown>) => void;
    error: (message: string, context?: Record<string, unknown>) => void;
    /** Build a child logger that prefixes the namespace to each message. */
    child: (namespace: string) => Logger;
}

export interface CreateLoggerOptions {
    /** Lowest level recorded. Default: `"info"`. */
    level?: LogLevel;
    /** Output adapters. Default: a `console.*` sink. */
    sinks?: LoggerSink[];
    /** Initial namespace (prepended to every message). */
    namespace?: string;
}

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

function shouldLog(threshold: LogLevel, level: LogLevel): boolean {
    return LEVELS.indexOf(level) >= LEVELS.indexOf(threshold);
}

/** Default sink that writes to the browser console. */
export const consoleSink: LoggerSink = ({ level, message, context }) => {
    const method = level === "debug" ? "log" : level;
    if (context) {
        console[method](message, context);
    } else {
        console[method](message);
    }
};

/**
 * Create a structured leveled logger. Plug arbitrary sinks (Sentry, Datadog,
 * remote ingestion) by implementing the `LoggerSink` interface.
 */
export function createLogger(options: CreateLoggerOptions = {}): Logger {
    const threshold = options.level ?? "info";
    const sinks = options.sinks ?? [consoleSink];
    const namespace = options.namespace ?? "";

    function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
        if (!shouldLog(threshold, level)) return;
        const entry: LogEntry = {
            level,
            message: namespace ? `[${namespace}] ${message}` : message,
            context,
            timestamp: Date.now(),
        };
        for (const sink of sinks) {
            try {
                sink(entry);
            } catch {
                /* never let a sink break the app */
            }
        }
    }

    return {
        debug: (message, context) => emit("debug", message, context),
        info: (message, context) => emit("info", message, context),
        warn: (message, context) => emit("warn", message, context),
        error: (message, context) => emit("error", message, context),
        child: (childNamespace: string) =>
            createLogger({
                level: threshold,
                sinks,
                namespace: namespace ? `${namespace}:${childNamespace}` : childNamespace,
            }),
    };
}
