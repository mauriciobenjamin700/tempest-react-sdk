import { useCallback, useEffect, useRef, useState } from "react";
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
    /** Last decoded frame received. */
    lastMessage: WebSocketMessage<T> | null;
    /** Send a payload through the active connection. Returns false when not open. */
    send: (payload: string | ArrayBufferLike | Blob | ArrayBufferView) => boolean;
    /** Force a reconnect, resetting the retry counter. */
    reconnect: () => void;
}

/**
 * React hook around {@link createWebSocket}. Manages the connection lifecycle
 * for the host component and tears it down on unmount.
 */
export function useWebSocket<T = unknown>(
    url: string,
    options: UseWebSocketOptions<T> = {},
): UseWebSocketResult<T> {
    const { enabled = true, onMessage, ...rest } = options;
    const [status, setStatus] = useState<WebSocketStatus>("idle");
    const [lastMessage, setLastMessage] = useState<WebSocketMessage<T> | null>(null);
    const controllerRef = useRef<WebSocketController | null>(null);

    const onMessageRef = useRef(onMessage);
    onMessageRef.current = onMessage;

    useEffect(() => {
        if (!enabled || !url) {
            setStatus("idle");
            return;
        }

        const controller = createWebSocket<T>(url, {
            ...rest,
            onStatusChange: setStatus,
            onMessage: (message) => {
                setLastMessage(message);
                onMessageRef.current?.(message);
            },
        });
        controllerRef.current = controller;

        return () => {
            controller.close();
            controllerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url, enabled]);

    const send = useCallback(
        (payload: string | ArrayBufferLike | Blob | ArrayBufferView): boolean => {
            return controllerRef.current?.send(payload) ?? false;
        },
        [],
    );

    const reconnect = useCallback((): void => {
        controllerRef.current?.reconnect();
    }, []);

    return { status, lastMessage, send, reconnect };
}
