/**
 * @tempest-limits file-lines, function-lines — reconnect with backoff, heartbeat,
 * the send queue that survives a disconnect and the listener set that must be re-
 * attached to each new socket — one connection's lifetime, one closure. The queue
 * and the reconnect timer are the same decision seen twice.
 */
export type WebSocketStatus = "idle" | "connecting" | "open" | "closing" | "closed" | "error";

export interface WebSocketMessage<T> {
    /** Parsed payload — JSON-decoded when possible, raw string otherwise. */
    data: T;
    /** The original `MessageEvent`. */
    raw: MessageEvent;
}

export interface CreateWebSocketOptions<T> {
    /** Subprotocol(s) forwarded to the `WebSocket` constructor. */
    protocols?: string | string[];
    /** Max reconnect attempts. Default: 10. Pass 0 to disable. */
    maxRetries?: number;
    /** Initial backoff (ms). Doubles each attempt, capped at `maxBackoff`. Default: 1000. */
    initialBackoff?: number;
    /** Maximum backoff (ms). Default: 30000. */
    maxBackoff?: number;
    /**
     * Ping interval (ms). When set, the client sends `pingPayload` periodically
     * to keep the socket alive. Default: 0 (disabled).
     *
     * Leave it off against a `tempest-fastapi-sdk` server: that server pings on
     * its own and answers a client-sent `{"type":"ping"}` with nothing, while a
     * strict handler rejects the unknown frame. What it needs from the client
     * is the `pong` reply, which `respondToPing` sends for you.
     */
    pingInterval?: number;
    /** Payload sent on each ping. Default: `JSON.stringify({ type: "ping" })`. */
    pingPayload?: string | Blob | BufferSource;
    /**
     * Reply to a server `{"type":"ping"}` with `pongPayload`. Default: true.
     *
     * `tempest-fastapi-sdk` closes a socket with code `4408` when no `pong`
     * arrives within `WS_HEARTBEAT_TIMEOUT_SECONDS`, so a client that stays
     * silent is dropped once per timeout. The ping is still forwarded to
     * `onMessage` — the reply is sent before your handler runs.
     */
    respondToPing?: boolean;
    /** Payload sent in reply to a server ping. Default: `JSON.stringify({ type: "pong" })`. */
    pongPayload?: string | Blob | BufferSource;
    /**
     * Buffer payloads sent while the socket is not open and flush them on the
     * next `open`. Default: false — `send()` returns false and drops.
     *
     * Without it, an action fired during reconnect backoff vanishes and the UI
     * cannot tell "never sent" from "sent and ignored".
     */
    queueWhileClosed?: boolean;
    /** Cap on buffered payloads when `queueWhileClosed` is on. Default: 100. */
    maxQueuedMessages?: number;
    /** Parse incoming frames. Default: JSON with raw-string fallback. */
    parser?: (raw: string) => T;
    onOpen?: (event: Event) => void;
    onMessage?: (message: WebSocketMessage<T>) => void;
    onClose?: (event: CloseEvent) => void;
    onError?: (event: Event) => void;
    onStatusChange?: (status: WebSocketStatus) => void;
}

export interface WebSocketController {
    /** Send a payload over the current connection. No-op when not open. */
    send: (payload: string | Blob | BufferSource) => boolean;
    /** Close the connection and stop reconnecting. */
    close: (code?: number, reason?: string) => void;
    /** Force an immediate reconnect, resetting the retry counter. */
    reconnect: () => void;
    /** Current connection status. */
    readonly status: WebSocketStatus;
}

function defaultParser<T>(raw: string): T {
    try {
        return JSON.parse(raw) as T;
    } catch {
        return raw as unknown as T;
    }
}

/**
 * Open a WebSocket with automatic exponential-backoff reconnect, optional
 * heartbeat pings, and typed JSON parsing.
 *
 * @param url - Full ws:// or wss:// URL.
 * @param options - Connection configuration and callbacks.
 * @returns Controller exposing `send`, `close`, `reconnect`, and `status`.
 */
export function createWebSocket<T = unknown>(
    url: string,
    options: CreateWebSocketOptions<T> = {},
): WebSocketController {
    const {
        protocols,
        maxRetries = 10,
        initialBackoff = 1000,
        maxBackoff = 30000,
        pingInterval = 0,
        pingPayload = JSON.stringify({ type: "ping" }),
        respondToPing = true,
        pongPayload = JSON.stringify({ type: "pong" }),
        queueWhileClosed = false,
        maxQueuedMessages = 100,
        parser = defaultParser<T>,
        onOpen,
        onMessage,
        onClose,
        onError,
        onStatusChange,
    } = options;

    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let retries = 0;
    let status: WebSocketStatus = "idle";
    let closed = false;
    const outbox: Array<string | Blob | BufferSource> = [];

    /** True for a decoded frame that is the server's heartbeat ping. */
    function isServerPing(data: unknown): boolean {
        return (
            typeof data === "object" &&
            data !== null &&
            (data as { type?: unknown }).type === "ping"
        );
    }

    /** Send everything buffered while the socket was down, oldest first. */
    function flushOutbox(ws: WebSocket): void {
        while (outbox.length > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(outbox.shift()!);
        }
    }

    function setStatus(next: WebSocketStatus): void {
        if (status === next) return;
        status = next;
        onStatusChange?.(next);
    }

    function clearPing(): void {
        if (pingTimer) {
            clearInterval(pingTimer);
            pingTimer = null;
        }
    }

    function startPing(): void {
        if (!pingInterval || pingInterval <= 0) return;
        clearPing();
        pingTimer = setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) {
                socket.send(pingPayload);
            }
        }, pingInterval);
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
        if (socket) {
            const previous = socket;
            previous.onmessage = null;
            previous.onclose = null;
            previous.onerror = null;
            if (previous.readyState !== WebSocket.CONNECTING) previous.onopen = null;
            closeSocket(previous);
        }
        setStatus("connecting");

        const ws = new WebSocket(url, protocols);
        socket = ws;

        ws.onopen = (event) => {
            retries = 0;
            setStatus("open");
            startPing();
            flushOutbox(ws);
            onOpen?.(event);
        };

        ws.onmessage = (event) => {
            const raw = typeof event.data === "string" ? event.data : "";
            const data = parser(raw);
            if (respondToPing && isServerPing(data) && ws.readyState === WebSocket.OPEN) {
                ws.send(pongPayload);
            }
            onMessage?.({ data, raw: event });
        };

        ws.onerror = (event) => {
            onError?.(event);
        };

        ws.onclose = (event) => {
            clearPing();
            onClose?.(event);
            socket = null;
            setStatus("closed");
            if (!closed && !event.wasClean) {
                scheduleReconnect();
            }
        };
    }

    function send(payload: string | Blob | BufferSource): boolean {
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(payload);
            return true;
        }
        if (!queueWhileClosed || closed) return false;
        if (outbox.length >= maxQueuedMessages) outbox.shift();
        outbox.push(payload);
        return true;
    }

    function close(code?: number, reason?: string): void {
        closed = true;
        if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
        }
        clearPing();
        retries = 0;
        outbox.length = 0;
        if (socket) {
            setStatus("closing");
            closeSocket(socket, code, reason);
            socket = null;
        }
        setStatus("closed");
    }

    /**
     * Close a socket without the "closed before the connection is established"
     * console warning.
     *
     * A socket still in `CONNECTING` cannot be closed cleanly — the browser
     * logs that warning on every attempt. React's StrictMode mounts, unmounts
     * and remounts each component in development, so the first socket is
     * always torn down mid-handshake and the message shows up in every dev
     * session of every app using the hook. Deferring the close to `onopen`
     * costs one round trip and keeps the console usable.
     */
    function closeSocket(ws: WebSocket, code?: number, reason?: string): void {
        if (ws.readyState === WebSocket.CONNECTING) {
            ws.onopen = () => ws.close(code, reason);
            ws.onmessage = null;
            ws.onerror = null;
            ws.onclose = null;
            return;
        }
        ws.close(code, reason);
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
        send,
        close,
        reconnect,
        get status() {
            return status;
        },
    };
}
