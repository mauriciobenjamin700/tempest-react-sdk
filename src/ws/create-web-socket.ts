/**
 * @tempest-limits file-lines, function-lines — reconnect with backoff, heartbeat,
 * the handshake and silence timers that detect a link which never fails out loud,
 * the send queue that survives a disconnect and the listener set that must be re-
 * attached to each new socket — one connection's lifetime, one closure. The queue
 * and the reconnect timer are the same decision seen twice.
 */
import {
    backoffDelay,
    isRejectionCloseCode,
    shouldRetryClose,
    type WebSocketLostReason,
} from "./resilience";

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
     * Fraction of each backoff delay added at random, 0–1. Default: 0.3.
     *
     * Matters when the *server* is what went down: every client retries on the
     * same schedule, so the box comes back up into a synchronized stampede. Pass
     * `0` for a fixed schedule.
     */
    jitter?: number;
    /**
     * How long one handshake may stay in `CONNECTING` before the attempt is
     * abandoned and retried (ms). Default: 8000. Pass 0 to disable.
     *
     * A `WebSocket` that cannot reach its server does not necessarily fail: it
     * sits in `CONNECTING` firing neither `open` nor `close` nor `error`. A retry
     * chain built only on those events stops on its first hung attempt and never
     * moves again — and hung, rather than refused, is precisely how a bad mobile
     * link behaves, which is the case reconnection exists for.
     */
    handshakeTimeout?: number;
    /**
     * Silence tolerated on an open socket before the link is treated as dead (ms).
     * Default: 0 (off).
     *
     * The socket only reports a connection that closes cleanly. A link that dies
     * mid-flight leaves `readyState` at `OPEN` on this side with nothing ever
     * arriving again, so silence is the only symptom available. The timer is
     * re-armed by **any** inbound frame, not just by pings — traffic is traffic.
     *
     * Set it to a comfortable multiple of the server's ping interval (2.5× is a
     * good default) so one dropped ping is not mistaken for an outage. When the
     * server announces its own interval in the handshake, feed that back with
     * {@link WebSocketController.setSilenceTimeout} instead of hard-coding the
     * value on both ends.
     */
    silenceTimeout?: number;
    /**
     * Suspend the retry schedule while `navigator.onLine` is false, and resume on
     * the `online` event. Default: true.
     *
     * Burning retries against a radio that is switched off is how a phone
     * exhausts its budget inside a tunnel and gives up exactly when it comes out
     * the other side.
     */
    waitForOnline?: boolean;
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
    /**
     * A retry has been scheduled. `attempt` is 1-based, `total` is `maxRetries`.
     *
     * Reconnecting is not an error and reads badly as one: announcing every
     * attempt puts a fresh "the connection dropped" in front of someone whose
     * session is in the middle of coming back on its own. Show a quiet
     * reconnecting state here and treat {@link CreateWebSocketOptions.onLost} as
     * the failure.
     */
    onReconnecting?: (attempt: number, total: number) => void;
    /**
     * The socket is back up after at least one retry.
     *
     * Nothing is resumed for you: a server that keys state by connection sees a
     * brand-new client, so this is where the caller re-subscribes, re-joins or
     * refetches whatever the gap invalidated.
     */
    onReconnected?: () => void;
    /**
     * No further attempt will be made — `"rejected"` when the server refused the
     * client outright (close code 4400–4499, minus the 4408 heartbeat timeout),
     * `"exhausted"` when the schedule ran out.
     *
     * This is the one that deserves UI, because it is the only state the caller
     * can act on: offer a "try again" that calls
     * {@link WebSocketController.reconnect}.
     */
    onLost?: (reason: WebSocketLostReason) => void;
}

export interface WebSocketController {
    /** Send a payload over the current connection. No-op when not open. */
    send: (payload: string | Blob | BufferSource) => boolean;
    /** Close the connection and stop reconnecting. */
    close: (code?: number, reason?: string) => void;
    /** Force an immediate reconnect, resetting the retry counter. */
    reconnect: () => void;
    /**
     * Change the silence watchdog at runtime, in ms. `0` disables it.
     *
     * For the common case where the server announces its heartbeat interval in
     * the first frame, so the tolerated silence is not hard-coded on both ends:
     *
     * ```ts
     * onMessage: ({ data }) => {
     *   if (data.type === "welcome") socket.setSilenceTimeout(data.heartbeat_seconds * 2500);
     * }
     * ```
     */
    setSilenceTimeout: (ms: number) => void;
    /**
     * Resolves on the first successful open, rejects when the socket is lost
     * before ever opening.
     *
     * Joining and dropping are different events: a call that never connected has
     * to be reported, while one that dropped mid-session should reconnect
     * quietly. Await this for the join, handle
     * {@link CreateWebSocketOptions.onLost} for the drop. Pair it with
     * `maxRetries: 0` when the first attempt should fail fast instead of
     * spending the whole schedule on a server that is not there.
     */
    opened: Promise<void>;
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
 * Open a WebSocket that survives a bad network: exponential backoff with jitter,
 * a handshake timeout, a silence watchdog, optional heartbeat pings and typed
 * JSON parsing.
 *
 * Three failure modes are covered that an event-driven retry loop misses on its
 * own, because none of them fire an event: a handshake that hangs instead of
 * failing, an open socket whose link died mid-flight, and a device with its
 * radio off burning the retry budget. See `handshakeTimeout`, `silenceTimeout`
 * and `waitForOnline`.
 *
 * @param url - Full ws:// or wss:// URL.
 * @param options - Connection configuration and callbacks.
 * @returns Controller exposing `send`, `close`, `reconnect`, `setSilenceTimeout`,
 *   `opened` and `status`.
 *
 * @example
 * const socket = createWebSocket(url, {
 *   silenceTimeout: 75_000,
 *   onReconnecting: (n, total) => setBanner(`Reconectando ${n}/${total}…`),
 *   onReconnected: () => refetchEverything(),
 *   onLost: (reason) => setBanner(reason === "rejected" ? "Acesso negado" : "Sem conexão"),
 * });
 * await socket.opened;
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
        jitter = 0.3,
        handshakeTimeout = 8000,
        silenceTimeout = 0,
        waitForOnline = true,
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
        onReconnecting,
        onReconnected,
        onLost,
    } = options;

    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let handshakeTimer: ReturnType<typeof setTimeout> | null = null;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    let onlineListener: (() => void) | null = null;
    let silenceWindow = silenceTimeout;
    let retries = 0;
    let status: WebSocketStatus = "idle";
    let closed = false;
    let everOpened = false;
    const outbox: Array<string | Blob | BufferSource> = [];

    let settleOpen: (() => void) | null = null;
    let failOpen: ((error: Error) => void) | null = null;
    const opened = new Promise<void>((resolve, reject) => {
        settleOpen = resolve;
        failOpen = reject;
    });
    opened.catch(() => undefined);

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

    function clearHandshake(): void {
        if (handshakeTimer) {
            clearTimeout(handshakeTimer);
            handshakeTimer = null;
        }
    }

    function clearSilence(): void {
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
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

    /**
     * Restart the silence timer, because something just arrived.
     *
     * Armed off any inbound frame rather than off pongs alone: a busy exchange
     * already proves the link is carrying data, and a protocol whose pings the
     * client never sees would otherwise reconnect in the middle of working
     * traffic.
     */
    function armSilence(): void {
        clearSilence();
        if (closed || silenceWindow <= 0) return;
        silenceTimer = setTimeout(onSilence, silenceWindow);
    }

    /**
     * Treat a socket that went quiet as dead and start reconnecting.
     *
     * Handlers are detached before closing so the synthetic `close` does not also
     * schedule a retry — that would advance the backoff twice for one failure and
     * halve the time the connection is given to recover.
     */
    function onSilence(): void {
        clearSilence();
        if (closed || !socket) return;
        detach(socket);
        socket = null;
        setStatus("closed");
        scheduleReconnect();
    }

    /**
     * Abandon a handshake that never resolved either way.
     *
     * The socket is closed while still `CONNECTING`, which is the one case the
     * console warns about — and the right trade here, because the alternative is
     * deferring the close to an `open` event that by definition is not coming.
     */
    function abandonHandshake(ws: WebSocket): void {
        clearHandshake();
        if (closed || ws.readyState !== WebSocket.CONNECTING) return;
        detach(ws);
        if (socket === ws) socket = null;
        setStatus("closed");
        scheduleReconnect();
    }

    /** Drop every handler and close, so the socket can die without being heard. */
    function detach(ws: WebSocket): void {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
            ws.close();
        } catch {
            /* already unusable — nothing to release and nothing to report */
        }
    }

    /** Stop for good, telling the caller which of the two dead ends it is. */
    function lose(reason: WebSocketLostReason): void {
        clearSilence();
        clearHandshake();
        clearNetworkWait();
        if (reason === "rejected") closed = true;
        setStatus("error");
        if (!everOpened && failOpen) {
            const reject = failOpen;
            failOpen = null;
            settleOpen = null;
            reject(new Error(`websocket_${reason}`));
        }
        onLost?.(reason);
    }

    /**
     * Queue the next attempt, or wait for the network when there is none.
     *
     * While the browser reports no connectivity the schedule is suspended and the
     * `online` event drives the next attempt instead, so a device in a tunnel
     * does not spend its whole budget before coming out the other side.
     */
    function scheduleReconnect(): void {
        if (closed) return;
        if (retries >= maxRetries) {
            lose("exhausted");
            return;
        }
        const delay = backoffDelay(retries, { initialBackoff, maxBackoff, jitter });
        retries += 1;
        onReconnecting?.(retries, maxRetries);

        if (waitForOnline && typeof navigator !== "undefined" && navigator.onLine === false) {
            waitForNetwork();
            return;
        }
        retryTimer = setTimeout(connect, delay);
    }

    function waitForNetwork(): void {
        if (onlineListener || typeof window === "undefined") return;
        const listener = (): void => {
            clearNetworkWait();
            if (!closed) connect();
        };
        onlineListener = listener;
        window.addEventListener("online", listener);
    }

    function clearNetworkWait(): void {
        if (!onlineListener || typeof window === "undefined") return;
        window.removeEventListener("online", onlineListener);
        onlineListener = null;
    }

    /**
     * Open a socket, replacing whatever is there.
     *
     * The handshake timer is cleared first because it belongs to the socket
     * being replaced, and it holds a reference to it: left armed, it fires later
     * against a connection nobody is waiting for, clears the *new* socket's
     * timer on its way through, and schedules a retry that drops a connection
     * still in flight. `reconnect()` on a hung socket is the path that reaches
     * it.
     */
    function connect(): void {
        if (closed) return;
        retryTimer = null;
        clearHandshake();
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

        if (handshakeTimeout > 0) {
            handshakeTimer = setTimeout(() => abandonHandshake(ws), handshakeTimeout);
        }

        ws.onopen = (event) => {
            clearHandshake();
            const recovered = retries > 0;
            retries = 0;
            everOpened = true;
            setStatus("open");
            startPing();
            armSilence();
            flushOutbox(ws);
            if (settleOpen) {
                const resolve = settleOpen;
                settleOpen = null;
                failOpen = null;
                resolve();
            }
            onOpen?.(event);
            if (recovered) onReconnected?.();
        };

        ws.onmessage = (event) => {
            armSilence();
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

        /**
         * Classify the close before deciding anything.
         *
         * Three outcomes, in order: a refusal never gets better by trying again;
         * a died-in-flight or temporarily-unavailable close is retried; an
         * ordinary goodbye (a clean 1000) is the session ending on purpose and
         * deserves no error. The one exception is a goodbye on a socket that
         * never opened — the server hung up during the handshake, which the
         * caller awaiting `opened` has to hear about.
         */
        ws.onclose = (event) => {
            clearHandshake();
            clearPing();
            clearSilence();
            onClose?.(event);
            socket = null;
            setStatus("closed");
            if (closed) return;
            if (isRejectionCloseCode(event.code)) {
                lose("rejected");
                return;
            }
            if (shouldRetryClose(event.code, event.wasClean)) {
                scheduleReconnect();
                return;
            }
            if (!everOpened) lose("rejected");
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
        clearHandshake();
        clearSilence();
        clearNetworkWait();
        retries = 0;
        outbox.length = 0;
        if (failOpen) {
            const reject = failOpen;
            failOpen = null;
            settleOpen = null;
            reject(new Error("websocket_closed"));
        }
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
        clearNetworkWait();
        retries = 0;
        closed = false;
        connect();
    }

    function setSilenceTimeout(ms: number): void {
        silenceWindow = Number.isFinite(ms) && ms > 0 ? ms : 0;
        if (socket?.readyState === WebSocket.OPEN) armSilence();
        else clearSilence();
    }

    connect();

    return {
        send,
        close,
        reconnect,
        setSilenceTimeout,
        opened,
        get status() {
            return status;
        },
    };
}
