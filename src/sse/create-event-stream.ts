/**
 * @tempest-limits function-lines — the body is the SSE line protocol — accumulate
 * `data:` lines until a blank line, track `id:` for Last-Event-ID, honour `retry:` —
 * plus the reconnect that uses the id it just tracked.
 */
import { decodeFrame } from "../utils/json-frame";
import type { SchemaIssue, SchemaLike } from "../utils/schema-like";
export type EventStreamStatus = "idle" | "connecting" | "open" | "closed" | "error";

/**
 * Where the stream connects: a fixed URL, or a function resolved again before
 * every connection, the first one and each reconnect.
 *
 * The function form exists for short-lived credentials carried in the URL,
 * such as the `?ticket=` of the `tempest-fastapi-sdk` SSE router. `EventSource`
 * cannot send headers, so the credential has to ride in the query, and one that
 * expires makes a fixed URL a trap: the reconnect after the expiry presents the
 * same dead credential, gets a `401`, and burns every retry on it while the user
 * is still signed in.
 */
export type EventStreamUrl = string | (() => string | Promise<string>);

export interface EventStreamMessage<T> {
    /** Server-named event (default `"message"`). */
    event: string;
    /** Parsed payload — validated when `schema` is set, JSON-decoded when possible, raw string otherwise. */
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
    /**
     * A frame arrived that is not valid JSON, and no `parser` was supplied.
     *
     * Registering this drops the frame instead of delivering it: the previous
     * behaviour handed `onMessage` the raw `string` announced as your message
     * type, so the failure surfaced later, at the first property access, with
     * nothing left pointing at the parse. Leave it out and that behaviour is
     * kept, with a one-time warning in development builds.
     */
    onParseError?: (error: unknown, raw: string) => void;
    /**
     * Schema every decoded frame must satisfy, from zod, valibot, arktype or
     * anything else exposing `~standard` or `.safeParse`.
     *
     * Without it nothing changes: the payload reaches `onMessage` announced as
     * `T` on the strength of the type argument alone, which is a promise about
     * the server that TypeScript cannot keep. With it, a frame that does not
     * match is **not** delivered — the same rule `onParseError` already follows —
     * and `onValidationError` hears why. The value delivered is the schema's
     * output, so coercions and defaults are honoured.
     *
     * When `parser` is also supplied, it decodes first and the schema validates
     * what it returned.
     *
     * The validation must be synchronous. A frame is decoded inside the
     * `message` handler and delivered from it, so an async schema would deliver
     * frames in whatever order their validations settled; that case is reported
     * through `onValidationError` instead of awaited.
     */
    schema?: SchemaLike<T>;
    /**
     * A frame was decoded but the `schema` refused it, so it was dropped.
     *
     * The one signal that does not depend on how the app's bundler resolves
     * `process`: the one-time development warning behind `onParseError` needs
     * `isDevBuild()` to be able to answer, and this callback is the app's own.
     */
    onValidationError?: (issues: SchemaIssue[], raw: string) => void;
    /**
     * The URL function threw or rejected, so no connection was attempted.
     *
     * `onError` cannot carry this: it receives the `EventSource` `Event`, and a
     * URL that never resolved never had an `EventSource`.
     */
    onUrlError?: (error: unknown) => void;
    /**
     * Whether a URL-resolution failure is worth another attempt. Default: always.
     *
     * Return `false` for failures no backoff can fix — a `401` or a `403` when
     * fetching a ticket is a session decision, not a network blip — and the stream
     * stops at `status: "error"` instead of spending `maxRetries` on it.
     */
    shouldRetryUrl?: (error: unknown) => boolean;
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

/**
 * Open a Server-Sent Events stream with automatic exponential-backoff reconnect.
 *
 * Heartbeat events (default `"ping"`) keep the socket alive without firing
 * `onMessage`. Pass `withCredentials: true` when the backend authenticates via
 * cookies. Call `close()` from the returned controller to tear down.
 *
 * When `url` is a function it is called before every connection, so a
 * reconnect presents a fresh credential instead of the one that expired. A
 * resolution still pending when `close()` or `reconnect()` runs is discarded.
 *
 * @param url - Full SSE endpoint URL, or a function returning it per connection.
 * @param options - Stream configuration and callbacks.
 * @returns A controller exposing `close`, `reconnect` and the current `status`.
 */
export function createEventStream<T = unknown>(
    url: EventStreamUrl,
    options: CreateEventStreamOptions<T> = {},
): EventStreamController {
    const {
        withCredentials = false,
        namedEvents = [],
        heartbeatEvents = ["ping"],
        maxRetries = 10,
        initialBackoff = 1000,
        maxBackoff = 30000,
        parser,
        onOpen,
        onMessage,
        onError,
        onParseError,
        schema,
        onValidationError,
        onUrlError,
        shouldRetryUrl = () => true,
        onStatusChange,
    } = options;

    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retries = 0;
    let status: EventStreamStatus = "idle";
    let closed = false;
    let attempt = 0;

    function setStatus(next: EventStreamStatus): void {
        if (status === next) return;
        status = next;
        onStatusChange?.(next);
    }

    function emit(eventName: string, event: MessageEvent): void {
        if (heartbeatEvents.includes(eventName)) return;
        const decoded = decodeFrame<T>(
            typeof event.data === "string" ? event.data : "",
            "createEventStream",
            { parser, onParseError, schema, onValidationError },
        );
        if (!decoded.delivered) return;
        onMessage?.({
            event: eventName,
            data: decoded.data,
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

    function failUrl(error: unknown): void {
        onUrlError?.(error);
        if (!shouldRetryUrl(error)) {
            setStatus("error");
            return;
        }
        setStatus("closed");
        scheduleReconnect();
    }

    function connect(): void {
        if (closed) return;
        if (source) {
            source.close();
            source = null;
        }
        setStatus("connecting");
        attempt += 1;
        if (typeof url === "string") {
            open(url);
            return;
        }
        const current = attempt;
        Promise.resolve()
            .then(url)
            .then(
                (resolved) => {
                    if (!closed && current === attempt) open(resolved);
                },
                (error: unknown) => {
                    if (!closed && current === attempt) failUrl(error);
                },
            );
    }

    function open(target: string): void {
        const es = new EventSource(target, { withCredentials });
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
