import { useEffect, useRef, useState } from "react";
import { useLatestRef } from "@/hooks/use-latest-ref";
import {
    createEventStream,
    type CreateEventStreamOptions,
    type EventStreamMessage,
    type EventStreamStatus,
    type EventStreamUrl,
    type SessionKey,
} from "./create-event-stream";

export interface UseEventStreamOptions<T> extends Omit<
    CreateEventStreamOptions<T>,
    "onStatusChange" | "sessionKey"
> {
    /** When false, the stream is not opened. Useful for "wait for auth". Default: true. */
    enabled?: boolean;
    /**
     * The session the stream belongs to — the signed-in user's id, typically.
     *
     * A change closes the stream, clears `lastMessage` and, while `enabled`,
     * opens a new connection for the new session (a fresh ticket, for
     * {@link useTicketEventStream}). Without it, a tab that switches accounts
     * without passing through `enabled: false` keeps the previous user's
     * stream open and delivers its events under the new user: the server does
     * not end an open stream on logout or revocation, so the client has to.
     *
     * A frame that arrives between the render that changed the key and the
     * effect that closes the stream is dropped as well. Default: `undefined`,
     * which never changes, so the stream follows `url` and `enabled` alone.
     */
    sessionKey?: SessionKey;
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
 * tied to the component (and the `url`/`enabled`/`sessionKey` dependencies);
 * the stream closes on unmount.
 *
 * Pass `sessionKey` (the signed-in user's id) whenever the stream carries one
 * user's data: a change of account then closes the previous user's stream and
 * clears `lastMessage`, even when `enabled` never went `false` in between.
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
    const { enabled = true, sessionKey, onMessage, ...rest } = options;
    const [status, setStatus] = useState<EventStreamStatus>("idle");
    const [lastMessage, setLastMessage] = useState<EventStreamMessage<T> | null>(null);
    const reconnectRef = useRef<(() => void) | null>(null);
    const lastSessionRef = useRef<SessionKey>(sessionKey);

    const onMessageRef = useLatestRef(onMessage);
    const urlRef = useLatestRef(url);
    const sessionKeyRef = useLatestRef(sessionKey);
    const fixedUrl = typeof url === "string" ? url : null;

    useEffect(() => {
        if (!Object.is(lastSessionRef.current, sessionKey)) {
            lastSessionRef.current = sessionKey;
            setLastMessage(null);
        }
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
            sessionKey: () => sessionKeyRef.current,
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
    }, [fixedUrl, enabled, sessionKey]);

    return {
        status,
        lastMessage,
        reconnect: () => reconnectRef.current?.(),
    };
}
