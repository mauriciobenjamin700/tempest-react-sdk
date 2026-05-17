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
     */
    pingInterval?: number;
    /** Payload sent on each ping. Default: `JSON.stringify({ type: "ping" })`. */
    pingPayload?: string | ArrayBufferLike | Blob | ArrayBufferView;
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
    send: (payload: string | ArrayBufferLike | Blob | ArrayBufferView) => boolean;
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
            socket.onopen = null;
            socket.onmessage = null;
            socket.onclose = null;
            socket.onerror = null;
            socket.close();
        }
        setStatus("connecting");

        const ws = new WebSocket(url, protocols);
        socket = ws;

        ws.onopen = (event) => {
            retries = 0;
            setStatus("open");
            startPing();
            onOpen?.(event);
        };

        ws.onmessage = (event) => {
            const raw = typeof event.data === "string" ? event.data : "";
            onMessage?.({
                data: parser(raw),
                raw: event,
            });
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

    function send(payload: string | ArrayBufferLike | Blob | ArrayBufferView): boolean {
        if (socket?.readyState !== WebSocket.OPEN) return false;
        socket.send(payload);
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
        if (socket) {
            setStatus("closing");
            socket.close(code, reason);
            socket = null;
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
        send,
        close,
        reconnect,
        get status() {
            return status;
        },
    };
}
