import { useEffect, useRef, useState } from "react";
import {
    createEventStream,
    type CreateEventStreamOptions,
    type EventStreamMessage,
    type EventStreamStatus,
} from "./create-event-stream";

export interface UseEventStreamOptions<T> extends Omit<
    CreateEventStreamOptions<T>,
    "onStatusChange"
> {
    /** When false, the stream is not opened. Useful for "wait for auth". Default: true. */
    enabled?: boolean;
}

export interface UseEventStreamResult<T> {
    status: EventStreamStatus;
    /** Last message received (excluding heartbeats). */
    lastMessage: EventStreamMessage<T> | null;
    /** Force a reconnect. */
    reconnect: () => void;
}

/**
 * React hook wrapper around {@link createEventStream}. Connection lifecycle is
 * tied to the component (and the `url`/`enabled` dependencies); the stream
 * closes on unmount.
 *
 * @example
 * useEventStream<Notification>(`${API}/notifications/stream`, {
 *     enabled: !!user,
 *     withCredentials: true,
 *     onMessage: ({ data }) => addNotification(data),
 * });
 */
export function useEventStream<T = unknown>(
    url: string,
    options: UseEventStreamOptions<T> = {},
): UseEventStreamResult<T> {
    const { enabled = true, onMessage, ...rest } = options;
    const [status, setStatus] = useState<EventStreamStatus>("idle");
    const [lastMessage, setLastMessage] = useState<EventStreamMessage<T> | null>(null);
    const reconnectRef = useRef<(() => void) | null>(null);

    const onMessageRef = useRef(onMessage);
    onMessageRef.current = onMessage;

    useEffect(() => {
        if (!enabled || !url) {
            setStatus("idle");
            return;
        }

        const controller = createEventStream<T>(url, {
            ...rest,
            onStatusChange: setStatus,
            onMessage: (message) => {
                setLastMessage(message);
                onMessageRef.current?.(message);
            },
        });
        reconnectRef.current = controller.reconnect;

        return () => {
            controller.close();
            reconnectRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url, enabled]);

    return {
        status,
        lastMessage,
        reconnect: () => reconnectRef.current?.(),
    };
}
