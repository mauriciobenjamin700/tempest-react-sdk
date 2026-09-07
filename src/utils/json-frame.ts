import { isDevBuild } from "./dev-mode";
import { validateWithSchema, type SchemaIssue, type SchemaLike } from "./schema-like";

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

/** How one frame should be turned into `T`, and who hears about failures. */
export interface DecodeFrameOptions<T> {
    /** Caller-supplied decoder, which owns the frame completely. */
    parser?: (raw: string) => T;
    /** Caller-supplied handler for a frame that is not valid JSON. */
    onParseError?: (error: unknown, raw: string) => void;
    /** Caller-supplied schema the decoded payload must satisfy. */
    schema?: SchemaLike<T>;
    /** Caller-supplied handler for a payload the schema refused. */
    onValidationError?: (issues: SchemaIssue[], raw: string) => void;
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
 * Warn once per transport that a frame was dropped by the schema.
 *
 * A dropped frame with no `onValidationError` is otherwise completely silent —
 * the stream looks healthy and the payload simply never arrives, which is the
 * hardest shape of failure to notice. Development builds only, once, for the
 * same reason as {@link warnOnce}.
 *
 * @param transport - Label used in the message, e.g. `"createEventStream"`.
 * @param issues - The issues the schema reported, summarized into the message.
 * @returns Nothing.
 */
function warnValidationOnce(transport: string, issues: SchemaIssue[]): void {
    const key = `${transport}:schema`;
    if (!isDevBuild() || warned.has(key)) return;
    warned.add(key);
    const summary = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    console.warn(
        `[tempest-react-sdk] ${transport}: a frame did not match \`schema\` and was dropped ` +
            `(${summary}). Pass \`onValidationError\` to handle it yourself. This warning ` +
            `appears once.`,
    );
}

/**
 * Decode one frame, reporting whether it should be delivered.
 *
 * A caller-supplied `parser` owns the frame completely: its result is delivered
 * as it is, or validated when a `schema` was also supplied — decoding text,
 * binary-as-base64 or a protocol of its own is the point of that option.
 *
 * Without one, the frame is parsed as JSON. When that throws:
 *
 * - with `onParseError`, the callback fires and the frame is **not** delivered,
 *   because a consumer that asked to hear about failures did not ask to also
 *   receive the broken frame;
 * - with `schema` and no `onParseError`, the raw string goes to the schema,
 *   which refuses it — a caller who asked for validation never receives an
 *   unvalidated payload, and a frame the server sent empty is exactly this case;
 * - with neither, the raw string is delivered as `T` — the behaviour every
 *   version before this one had, kept so nothing breaks — and development builds
 *   warn once that it happened.
 *
 * With a `schema`, a payload the schema refuses is not delivered, and
 * `onValidationError` hears the issues. The value delivered is the schema's
 * **output**, so a schema that coerces or defaults is honoured.
 *
 * @param raw - The frame body as text.
 * @param transport - Label used in the development warnings.
 * @param options - Caller-supplied decoder, schema and failure handlers.
 * @returns Whether to deliver, and the payload.
 */
export function decodeFrame<T>(
    raw: string,
    transport: string,
    options: DecodeFrameOptions<T>,
): DecodedFrame<T> {
    const { parser, onParseError, schema, onValidationError } = options;

    /**
     * Put one decoded payload through the schema, when there is one.
     *
     * @param value - The payload as parsing produced it.
     * @returns Whether to deliver, and the payload the consumer should see.
     */
    function gate(value: unknown): DecodedFrame<T> {
        if (!schema) return { delivered: true, data: value as T };
        const result = validateWithSchema(schema, value);
        if (result.ok) return { delivered: true, data: result.data };
        if (onValidationError) onValidationError(result.issues, raw);
        else warnValidationOnce(transport, result.issues);
        return { delivered: false, data: undefined as T };
    }

    if (parser) return gate(parser(raw));
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        if (onParseError) {
            onParseError(error, raw);
            return { delivered: false, data: undefined as T };
        }
        if (schema) return gate(raw);
        warnOnce(transport);
        return { delivered: true, data: raw as unknown as T };
    }
    return gate(parsed);
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
