/** How deep the `cause` chain is followed before the rest is elided. */
const MAX_CAUSE_DEPTH = 5;

/**
 * The `code` and `message` a thrown value becomes on the wire.
 */
export interface AppErrorDescription {
    /** The error's `name` — `"UnreadableFileError"`, `"TypeError"` — or `"Error"`. */
    code: string;
    /** Header, cause chain, context and stack, in that order. */
    message: string;
}

/** The shape every thrown error shares, whichever realm built it. */
interface ErrorLike {
    name?: unknown;
    message: string;
    stack?: unknown;
    cause?: unknown;
}

/**
 * Whether a value carries an error's `message`, `instanceof` or not.
 *
 * `instanceof Error` is not enough: a `DOMException` — the `NotReadableError`
 * a picker raises for a file that only lives in the cloud — fails it in jsdom
 * and across realms, and was being rendered as `{}`, losing exactly the cause
 * a field report exists to carry.
 *
 * @param value - The thrown value.
 * @returns `true` for anything with a string `message`.
 */
function isErrorLike(value: unknown): value is ErrorLike {
    return (
        value instanceof Error ||
        (typeof value === "object" &&
            value !== null &&
            typeof (value as { message?: unknown }).message === "string")
    );
}

/**
 * The identifier a thrown value reports as, including a `DOMException`, which
 * is not always an `Error` instance across realms.
 *
 * @param value - The thrown value.
 * @returns Its `name`, or `"Error"`.
 */
function nameOf(value: unknown): string {
    if (value instanceof Error && value.name) return value.name;
    if (typeof value === "object" && value !== null && "name" in value) {
        const name = (value as { name: unknown }).name;
        if (typeof name === "string" && name) return name;
    }
    return "Error";
}

/**
 * One line naming the value: `Name: message` for an error.
 *
 * @param value - The thrown value or a cause.
 * @returns The line.
 */
function headline(value: unknown): string {
    if (isErrorLike(value)) return `${nameOf(value)}: ${value.message}`;
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}

/**
 * Follow `error.cause` into one line per link, bounded and cycle-safe.
 *
 * @param error - The top-level error.
 * @returns `caused by: …` lines, outermost first.
 */
function causeLines(error: unknown): string[] {
    const lines: string[] = [];
    const seen = new Set<unknown>([error]);
    let current: unknown = isErrorLike(error) ? error.cause : undefined;
    while (current !== undefined && current !== null) {
        if (seen.has(current)) {
            lines.push("caused by: [circular]");
            break;
        }
        if (lines.length === MAX_CAUSE_DEPTH) {
            lines.push("caused by: […]");
            break;
        }
        seen.add(current);
        lines.push(`caused by: ${headline(current)}`);
        current = isErrorLike(current) ? current.cause : undefined;
    }
    return lines;
}

/**
 * Render the caller's context as one JSON line.
 *
 * @param context - Extra facts, or nothing.
 * @returns The line, or `null` when there is no context.
 */
function contextLine(context: Record<string, unknown> | undefined): string | null {
    if (!context || Object.keys(context).length === 0) return null;
    try {
        return `context: ${JSON.stringify(context)}`;
    } catch {
        return "context: [unserializable]";
    }
}

/**
 * Turn any thrown value into the `code` + `message` pair the backend stores.
 *
 * The message is ordered by how much each part is worth when the backend cuts
 * it at 4000 characters: the headline, then the **`cause` chain** — where the
 * real failure usually is (`UnreadableFileError` caused by `NotReadableError`)
 * — then the caller's context, and the stack last, since it is the longest and
 * the first thing worth losing.
 *
 * @example
 * describeAppError(new Error("boom", { cause: new TypeError("x") }), { step: "crop" });
 * // { code: "Error", message: "Error: boom\ncaused by: TypeError: x\ncontext: {\"step\":\"crop\"}\n…" }
 *
 * @param error - Whatever was thrown — an `Error`, a `DOMException`, a string.
 * @param context - Extra facts to keep with it (file size, MIME, step).
 * @returns The wire `code` and `message`.
 */
export function describeAppError(
    error: unknown,
    context?: Record<string, unknown>,
): AppErrorDescription {
    const parts: string[] = [headline(error), ...causeLines(error)];
    const ctx = contextLine(context);
    if (ctx) parts.push(ctx);
    if (isErrorLike(error) && typeof error.stack === "string") parts.push(error.stack);
    return { code: nameOf(error), message: parts.join("\n") };
}
