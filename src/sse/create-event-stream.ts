export type EventStreamStatus = "idle" | "connecting" | "open" | "closed" | "error";

export interface EventStreamMessage<T> {
    /** Server-named event (default `"message"`). */
    event: string;
    /** Parsed payload — JSON-decoded when possible, raw string otherwise. */
    data: T;
    /** Server-supplied id, if any. */
    id?: string;
    /** Raw `MessageEvent` for advanced cases. */
    raw: MessageEvent;
}

export interface CreateEventStreamOptions<T> {
    /** Send cookies with the EventSource handshake. Default: false. */
    withCredentials?: boolean;
    /** Subscribe to named events in addition to `message`. */
    namedEvents?: readonly string[];
    /** Treat these named events as heartbeat-only (no callback). Default: `["ping"]`. */
    heartbeatEvents?: readonly string[];
    /** Max reconnect attempts. Default: 10. Pass 0 to disable reconnect. */
    maxRetries?: number;
    /** Initial backoff in ms; doubles per attempt, capped at `maxBackoff`. Default: 1000. */
    initialBackoff?: number;
    /** Maximum backoff in ms. Default: 30000. */
    maxBackoff?: number;
    /** Parse `event.data`. Defaults to JSON with raw-string fallback. */
    parser?: (raw: string) => T;
    onOpen?: () => void;
    onMessage?: (message: EventStreamMessage<T>) => void;
    onError?: (error: Event) => void;
    onStatusChange?: (status: EventStreamStatus) => void;
}

export interface EventStreamController {
    close: () => void;
    /** Force an immediate reconnect, resetting the retry counter. */
    reconnect: () => void;
    /** Current connection status. */
    readonly status: EventStreamStatus;
}

function defaultParser<T>(raw: string): T {
    try {
        return JSON.parse(raw) as T;
    } catch {
        return raw as unknown as T;
    }
}

/**
 * Open a Server-Sent Events stream with automatic exponential-backoff reconnect.
 *
 * Heartbeat events (default `"ping"`) keep the socket alive without firing
 * `onMessage`. Pass `withCredentials: true` when the backend authenticates via
 * cookies. Call `close()` from the returned controller to tear down.
 *
 * @param url - Full SSE endpoint URL.
 * @param options - Stream configuration and callbacks.
 * @returns A controller exposing `close`, `reconnect` and the current `status`.
 */
export function createEventStream<T = unknown>(
    url: string,
    options: CreateEventStreamOptions<T> = {},
): EventStreamController {
    const {
        withCredentials = false,
        namedEvents = [],
        heartbeatEvents = ["ping"],
        maxRetries = 10,
        initialBackoff = 1000,
        maxBackoff = 30000,
        parser = defaultParser<T>,
        onOpen,
        onMessage,
        onError,
        onStatusChange,
    } = options;

    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retries = 0;
    let status: EventStreamStatus = "idle";
    let closed = false;

    function setStatus(next: EventStreamStatus): void {
        if (status === next) return;
        status = next;
        onStatusChange?.(next);
    }

    function emit(eventName: string, event: MessageEvent): void {
        if (heartbeatEvents.includes(eventName)) return;
        onMessage?.({
            event: eventName,
            data: parser(event.data),
            id: event.lastEventId || undefined,
            raw: event,
        });
    }

    function scheduleReconnect(): void {
        if (closed) return;
        if (retries >= maxRetries) {
            setStatus("error");
            return;
        }
        const delay = Math.min(initialBackoff * 2 ** retries, maxBackoff);
        retries += 1;
        retryTimer = setTimeout(connect, delay);
    }

    function connect(): void {
        if (closed) return;
        if (source) source.close();
        setStatus("connecting");

        const es = new EventSource(url, { withCredentials });
        source = es;

        es.onopen = () => {
            retries = 0;
            setStatus("open");
            onOpen?.();
        };

        es.onmessage = (event) => emit("message", event);
        for (const name of namedEvents) {
            es.addEventListener(name, (event) => emit(name, event as MessageEvent));
        }
        for (const name of heartbeatEvents) {
            es.addEventListener(name, () => {
                /* heartbeat — keep socket alive */
            });
        }

        es.onerror = (event) => {
            onError?.(event);
            es.close();
            source = null;
            setStatus("closed");
            scheduleReconnect();
        };
    }

    function close(): void {
        closed = true;
        if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
        }
        retries = 0;
        if (source) {
            source.close();
            source = null;
        }
        setStatus("closed");
    }

    function reconnect(): void {
        if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
        }
        retries = 0;
        closed = false;
        connect();
    }

    connect();

    return {
        close,
        reconnect,
        get status() {
            return status;
        },
    };
}
