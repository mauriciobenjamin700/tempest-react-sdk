import { isApiError, isRetriableStatus } from "../http/errors";
import type { ApiClient } from "../http/types";
import {
    createEventStream,
    type CreateEventStreamOptions,
    type EventStreamController,
} from "./create-event-stream";
import {
    useEventStream,
    type UseEventStreamOptions,
    type UseEventStreamResult,
} from "./use-event-stream";

/** Body of `POST <prefix>/ticket` on the `tempest-fastapi-sdk` SSE router. */
export interface SseTicketResponse {
    /** Signed stream ticket, presented as a query param when opening the stream. */
    ticket: string;
    /** Seconds the ticket is accepted for opening a stream. */
    expires_in: number;
}

/** Where the ticket comes from and how the stream URL is built. */
export interface TicketEventStreamSource {
    /**
     * Authenticated client the ticket is requested through, so it carries the
     * `Authorization` header or the session cookie, the CSRF header, and the
     * 401 refresh-and-replay that a hand-rolled `fetch` would lose.
     */
    client: Pick<ApiClient, "post" | "url">;
    /** Router prefix, relative to the client's base URL. Default: `"/sse"`. */
    prefix?: string;
    /** Query param the stream reads the ticket from. Default: `"ticket"`. */
    ticketParam?: string;
}

export type CreateTicketEventStreamOptions<T> = TicketEventStreamSource &
    CreateEventStreamOptions<T>;

export type UseTicketEventStreamOptions<T> = TicketEventStreamSource & UseEventStreamOptions<T>;

/**
 * Whether a failure to obtain a ticket is worth another attempt.
 *
 * Only a failure the backoff can outlast is: no response at all, a timeout, a
 * rate limit, a `5xx`. A `401` reached the caller after the client already
 * tried its refresh, and a `403` (`ACCOUNT_INACTIVE`) is the backend saying no;
 * both are session decisions, and retrying them only delays the error state the
 * app has to show. Anything that is not an API error is a contract mismatch,
 * which a retry cannot fix either.
 *
 * @param error - What the ticket request threw.
 * @returns Whether to schedule a reconnect.
 */
export function isRetriableTicketError(error: unknown): boolean {
    return isApiError(error) && isRetriableStatus(error.status);
}

/**
 * Build the URL function that requests a ticket and points at the stream.
 *
 * A fresh ticket is requested for every connection rather than cached for its
 * `expires_in`. Every connection after the first follows a failure, and the
 * failure may have been the ticket itself; reusing it would spend the retries
 * on a credential that is already refused, while a new ticket costs one `POST`
 * per reconnect, which the backoff already spaces out.
 *
 * @param source - Client, router prefix and ticket param name.
 * @returns A function resolving the stream URL with a fresh ticket.
 * @throws TypeError When the ticket response has no `ticket` string.
 */
function ticketStreamUrl(source: TicketEventStreamSource): () => Promise<string> {
    const { client, prefix = "/sse", ticketParam = "ticket" } = source;
    return async () => {
        const response = await client.post<SseTicketResponse>(`${prefix}/ticket`);
        if (typeof response?.ticket !== "string" || response.ticket === "") {
            throw new TypeError(
                `createTicketEventStream: POST ${prefix}/ticket returned no "ticket" string.`,
            );
        }
        return client.url(`${prefix}/stream`, { [ticketParam]: response.ticket });
    };
}

/**
 * Open the ticket-authenticated stream of the `tempest-fastapi-sdk` SSE router.
 *
 * `POST <prefix>/ticket` through the authenticated client, then
 * `GET <prefix>/stream?ticket=…` — and again for every reconnect, because the
 * ticket only opens streams for `expires_in` seconds and a reconnect after that
 * with the old one is a `401`. A ticket request refused with a status no
 * backoff fixes (`401`, `403 ACCOUNT_INACTIVE`) stops the stream at
 * `status: "error"` and reaches `onUrlError`; pass `shouldRetryUrl` to replace
 * {@link isRetriableTicketError}.
 *
 * The access token never enters the URL: it travels as the client's header (or
 * cookie) on the ticket request, and the ticket in the URL opens that stream
 * and nothing else.
 *
 * @example
 * const stream = createTicketEventStream<Notification>({
 *     client: api,
 *     onMessage: ({ data }) => addNotification(data),
 *     onUrlError: (error) => toast.error(describeApiError(error)),
 * });
 *
 * @param options - Ticket source plus every {@link createEventStream} option.
 * @returns The stream controller.
 */
export function createTicketEventStream<T = unknown>(
    options: CreateTicketEventStreamOptions<T>,
): EventStreamController {
    const {
        client,
        prefix,
        ticketParam,
        shouldRetryUrl = isRetriableTicketError,
        ...rest
    } = options;
    return createEventStream<T>(ticketStreamUrl({ client, prefix, ticketParam }), {
        ...rest,
        shouldRetryUrl,
    });
}

/**
 * React form of {@link createTicketEventStream}: same ticket per connection,
 * lifecycle tied to the component like {@link useEventStream}.
 *
 * Changing `client`, `prefix` or `ticketParam` does not drop an open stream:
 * the next connection uses the new values, and `reconnect()` applies them now.
 * Reopening on identity would reconnect on every render for a client built
 * inline.
 *
 * @example
 * const { status } = useTicketEventStream<Notification>({
 *     client: api,
 *     enabled: isAuthenticated,
 *     schema: notificationSchema,
 *     onMessage: ({ data }) => addNotification(data),
 * });
 *
 * @param options - Ticket source plus every {@link useEventStream} option.
 * @returns Status, last message and `reconnect`.
 */
export function useTicketEventStream<T = unknown>(
    options: UseTicketEventStreamOptions<T>,
): UseEventStreamResult<T> {
    const {
        client,
        prefix,
        ticketParam,
        shouldRetryUrl = isRetriableTicketError,
        ...rest
    } = options;
    return useEventStream<T>(ticketStreamUrl({ client, prefix, ticketParam }), {
        ...rest,
        shouldRetryUrl,
    });
}
