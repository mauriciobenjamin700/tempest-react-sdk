import { useEffect, useRef, useState } from "react";
import { useLatestRef } from "@/hooks/use-latest-ref";
import {
    createEventStream,
    type CreateEventStreamOptions,
    type EventStreamMessage,
    type EventStreamStatus,
    type EventStreamUrl,
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
 * A string `url` reopens the stream when it changes. A function `url` does not:
 * an inline arrow is a new function every render, and keying on its identity
 * would reconnect on every render. The latest function is the one called on the
 * next connection, so call `reconnect()` when what it resolves to must change now.
 *
 * Pass `schema` to have every frame validated before it reaches `onMessage`,
 * instead of trusting the type argument: without it `data` is announced as `T`
 * on the strength of the generic alone, which is a promise about the server
 * that TypeScript cannot keep. It is read when the stream opens, so declare it
 * outside the component rather than building one inline per render.
 *
 * @example
 * useEventStream<Notification>(`${API}/notifications/stream`, {
 *     enabled: !!user,
 *     withCredentials: true,
 *     onMessage: ({ data }) => addNotification(data),
 * });
 *
 * @example
 * // Validated: a frame that does not match never reaches `onMessage`
 * const notificationSchema = z.object({ id: z.string(), message: z.string() });
 *
 * useEventStream<Notification>(`${API}/notifications/stream`, {
 *     schema: notificationSchema,
 *     onValidationError: (issues) => logger.warn("stream drift", { issues }),
 *     onMessage: ({ data }) => addNotification(data),
 * });
 */
export function useEventStream<T = unknown>(
    url: EventStreamUrl,
    options: UseEventStreamOptions<T> = {},
): UseEventStreamResult<T> {
    const { enabled = true, onMessage, ...rest } = options;
    const [status, setStatus] = useState<EventStreamStatus>("idle");
    const [lastMessage, setLastMessage] = useState<EventStreamMessage<T> | null>(null);
    const reconnectRef = useRef<(() => void) | null>(null);

    const onMessageRef = useLatestRef(onMessage);
    const urlRef = useLatestRef(url);
    const fixedUrl = typeof url === "string" ? url : null;

    useEffect(() => {
        if (!enabled || fixedUrl === "") {
            setStatus("idle");
            return;
        }

        const target: EventStreamUrl =
            fixedUrl ??
            (() => {
                const latest = urlRef.current;
                return typeof latest === "string" ? latest : latest();
            });
        const controller = createEventStream<T>(target, {
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
    }, [fixedUrl, enabled]);

    return {
        status,
        lastMessage,
        reconnect: () => reconnectRef.current?.(),
    };
}
