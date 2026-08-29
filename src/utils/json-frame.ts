import { isDevBuild } from "./dev-mode";

/**
 * The one decoder behind `createWebSocket`, `useWebSocket` and
 * `createEventStream`.
 *
 * Internal, and imported by path rather than through the `utils` barrel: it
 * exists so the three transports share one answer to "the frame is not JSON",
 * not so consumers can call it.
 *
 * That question used to have three identical copies of the same wrong answer —
 * `return raw as unknown as T`, which hands the consumer a `string` announced as
 * `T`. The failure never surfaced at the parse; it surfaced later, on the first
 * `message.id`, with nothing left to say the frame had not been JSON.
 */

/** Outcome of decoding one frame. */
export interface DecodedFrame<T> {
    /** Whether the message should reach `onMessage`. */
    delivered: boolean;
    /** The decoded payload. Only meaningful when `delivered` is `true`. */
    data: T;
}

const warned = new Set<string>();

/**
 * Warn once per transport that a frame arrived which was not JSON.
 *
 * Once, because a stream sending text frames sends many, and a console line per
 * frame buries the one that mattered. Development builds only.
 *
 * @param transport - Label used in the message, e.g. `"createWebSocket"`.
 * @returns Nothing.
 */
function warnOnce(transport: string): void {
    if (!isDevBuild() || warned.has(transport)) return;
    warned.add(transport);
    console.warn(
        `[tempest-react-sdk] ${transport}: a frame was not valid JSON, so the raw string is ` +
            `being delivered as if it were your message type. Pass \`parser\` to decode it, or ` +
            `\`onParseError\` to drop it and handle the failure. This warning appears once.`,
    );
}

/**
 * Decode one frame, reporting whether it should be delivered.
 *
 * A caller-supplied `parser` owns the frame completely and its result is always
 * delivered — decoding text, binary-as-base64 or a protocol of its own is the
 * point of that option.
 *
 * Without one, the frame is parsed as JSON. When that throws:
 *
 * - with `onParseError`, the callback fires and the frame is **not** delivered,
 *   because a consumer that asked to hear about failures did not ask to also
 *   receive the broken frame;
 * - without it, the raw string is delivered as `T` — the behaviour every version
 *   before this one had, kept so nothing breaks — and development builds warn
 *   once that it happened.
 *
 * @param raw - The frame body as text.
 * @param parser - Caller-supplied decoder, if any.
 * @param onParseError - Caller-supplied failure handler, if any.
 * @param transport - Label used in the development warning.
 * @returns Whether to deliver, and the payload.
 */
export function decodeFrame<T>(
    raw: string,
    parser: ((raw: string) => T) | undefined,
    onParseError: ((error: unknown, raw: string) => void) | undefined,
    transport: string,
): DecodedFrame<T> {
    if (parser) return { delivered: true, data: parser(raw) };
    try {
        return { delivered: true, data: JSON.parse(raw) as T };
    } catch (error) {
        if (onParseError) {
            onParseError(error, raw);
            return { delivered: false, data: undefined as T };
        }
        warnOnce(transport);
        return { delivered: true, data: raw as unknown as T };
    }
}

/**
 * Forget which transports have already warned.
 *
 * Exists for tests, which would otherwise see the first case swallow the
 * warning for every case after it.
 *
 * @returns Nothing.
 */
export function resetFrameWarnings(): void {
    warned.clear();
}
