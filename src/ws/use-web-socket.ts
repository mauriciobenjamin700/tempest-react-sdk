import { useCallback, useEffect, useRef, useState } from "react";
import { useLatestRef } from "@/hooks/use-latest-ref";
import {
    createWebSocket,
    type CreateWebSocketOptions,
    type WebSocketController,
    type WebSocketMessage,
    type WebSocketStatus,
} from "./create-web-socket";

export interface UseWebSocketOptions<T> extends Omit<CreateWebSocketOptions<T>, "onStatusChange"> {
    /** When false, the socket is not opened. Default: true. */
    enabled?: boolean;
}

export interface UseWebSocketResult<T> {
    status: WebSocketStatus;
    /**
     * Last decoded frame received.
     *
     * A snapshot, not a stream: two frames arriving in the same tick collapse
     * into a single render and only the later one is ever visible. One server
     * action often emits several frames in a row, so anything that must see
     * every message has to use `onMessage`, which fires once per frame. Read
     * `lastMessage` for "what is the current state" rendering only.
     */
    lastMessage: WebSocketMessage<T> | null;
    /** Send a payload through the active connection. Returns false when not open. */
    send: (payload: string | Blob | BufferSource) => boolean;
    /** Force a reconnect, resetting the retry counter. */
    reconnect: () => void;
    /**
     * Change the silence watchdog at runtime, in ms. `0` disables it.
     *
     * For a server that announces its own heartbeat interval in the first frame,
     * so the tolerated silence is not hard-coded on both ends.
     */
    setSilenceTimeout: (ms: number) => void;
}

/**
 * React hook around {@link createWebSocket}. Manages the connection lifecycle
 * for the host component and tears it down on unmount.
 *
 * Every callback is read through a ref, so `onOpen` / `onMessage` / `onClose` /
 * `onError` / `onReconnecting` / `onReconnected` / `onLost` always run the
 * latest closure — an inline arrow function is fine and never reopens the
 * socket. Connection-shaping options (`protocols`, `maxRetries`,
 * `initialBackoff`, `maxBackoff`, `jitter`, `handshakeTimeout`,
 * `silenceTimeout`, `waitForOnline`, `pingInterval`, `queueWhileClosed`) are
 * baked into the connection, so changing one reopens it with the new value
 * rather than being silently ignored.
 *
 * @param url - Full ws:// or wss:// URL.
 * @param options - Connection configuration and callbacks.
 * @returns Status, last frame, and the `send` / `reconnect` controls.
 */
export function useWebSocket<T = unknown>(
    url: string,
    options: UseWebSocketOptions<T> = {},
): UseWebSocketResult<T> {
    const {
        enabled = true,
        protocols,
        maxRetries,
        initialBackoff,
        maxBackoff,
        jitter,
        handshakeTimeout,
        silenceTimeout,
        waitForOnline,
        pingInterval,
        respondToPing,
        queueWhileClosed,
        maxQueuedMessages,
    } = options;
    const [status, setStatus] = useState<WebSocketStatus>("idle");
    const [lastMessage, setLastMessage] = useState<WebSocketMessage<T> | null>(null);
    const controllerRef = useRef<WebSocketController | null>(null);

    const optionsRef = useLatestRef(options);

    const protocolsKey = Array.isArray(protocols) ? protocols.join(",") : (protocols ?? "");

    useEffect(() => {
        if (!enabled || !url) {
            setStatus("idle");
            return;
        }

        /*
         * Presence is read once, when the socket opens, and decides whether the
         * forwarder is passed at all. A forwarder is always truthy, so wrapping
         * an absent `parser` — or an absent `onParseError` — would tell
         * `decodeFrame` the caller had supplied one and silently pick the wrong
         * branch.
         */
        const hasParser = optionsRef.current.parser !== undefined;
        const hasParseError = optionsRef.current.onParseError !== undefined;

        const controller = createWebSocket<T>(url, {
            protocols: optionsRef.current.protocols,
            maxRetries,
            initialBackoff,
            maxBackoff,
            jitter,
            handshakeTimeout,
            silenceTimeout,
            waitForOnline,
            pingInterval,
            pingPayload: optionsRef.current.pingPayload,
            respondToPing,
            pongPayload: optionsRef.current.pongPayload,
            queueWhileClosed,
            maxQueuedMessages,
            parser: hasParser ? (raw) => optionsRef.current.parser?.(raw) as T : undefined,
            onParseError: hasParseError
                ? (error, raw) => optionsRef.current.onParseError?.(error, raw)
                : undefined,
            onStatusChange: setStatus,
            onOpen: (event) => optionsRef.current.onOpen?.(event),
            onClose: (event) => optionsRef.current.onClose?.(event),
            onError: (event) => optionsRef.current.onError?.(event),
            onReconnecting: (attempt, total) => optionsRef.current.onReconnecting?.(attempt, total),
            onReconnected: () => optionsRef.current.onReconnected?.(),
            onLost: (reason) => optionsRef.current.onLost?.(reason),
            onMessage: (message) => {
                setLastMessage(message);
                optionsRef.current.onMessage?.(message);
            },
        });
        controllerRef.current = controller;

        return () => {
            controller.close();
            controllerRef.current = null;
        };
    }, [
        url,
        enabled,
        protocolsKey,
        maxRetries,
        initialBackoff,
        maxBackoff,
        jitter,
        handshakeTimeout,
        silenceTimeout,
        waitForOnline,
        pingInterval,
        respondToPing,
        queueWhileClosed,
        maxQueuedMessages,
        optionsRef,
    ]);

    const send = useCallback((payload: string | Blob | BufferSource): boolean => {
        return controllerRef.current?.send(payload) ?? false;
    }, []);

    const reconnect = useCallback((): void => {
        controllerRef.current?.reconnect();
    }, []);

    const setSilenceTimeout = useCallback((ms: number): void => {
        controllerRef.current?.setSilenceTimeout(ms);
    }, []);

    return { status, lastMessage, send, reconnect, setSilenceTimeout };
}
