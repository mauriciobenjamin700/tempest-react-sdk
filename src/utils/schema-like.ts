/**
 * The SDK's answer to "the caller handed me a schema" — one normalizer behind
 * every option that takes one.
 *
 * Internal, and imported by path rather than through the `utils` barrel: the
 * function exists so `decodeFrame` and anything else that validates a payload
 * share one reading of the two shapes below, not so consumers can call it. The
 * types are public, because an option typed `SchemaLike<T>` is a name the
 * consumer has to be able to write down.
 *
 * Two shapes are accepted on purpose:
 *
 * - [Standard Schema](https://standardschema.dev) (`~standard`), which zod
 *   (>=3.24), valibot and arktype all implement, so the SDK validates against
 *   any of them without depending on one;
 * - `.safeParse`, because the SDK's own zod range starts at `^3.23.0`, which
 *   predates `~standard`, and because it is the method every zod user already
 *   knows.
 */

/** One field-level complaint from a schema validation. */
export interface SchemaIssue {
    /** Dotted path to the offending field, or `"<root>"` for the value itself. */
    path: string;
    /** What the validator said was wrong. */
    message: string;
}

/** A path segment as Standard Schema reports it: a key, or an object holding one. */
type IssuePathSegment = PropertyKey | { readonly key: PropertyKey };

/** One issue as either supported shape reports it. */
interface RawIssue {
    readonly message: string;
    readonly path?: readonly IssuePathSegment[] | undefined;
}

/** A schema exposing the [Standard Schema](https://standardschema.dev) interface. */
export interface StandardSchemaLike<T> {
    readonly "~standard": {
        readonly validate: (
            value: unknown,
        ) =>
            | { readonly value: T; readonly issues?: undefined }
            | { readonly issues: readonly RawIssue[] }
            | Promise<
                  | { readonly value: T; readonly issues?: undefined }
                  | { readonly issues: readonly RawIssue[] }
              >;
    };
}

/** A schema exposing zod's `.safeParse`, including versions older than `~standard`. */
export interface SafeParseSchemaLike<T> {
    readonly safeParse: (
        value: unknown,
    ) =>
        | { readonly success: true; readonly data: T }
        | { readonly success: false; readonly error: { readonly issues: readonly RawIssue[] } };
}

/** Anything the SDK can validate a payload against. */
export type SchemaLike<T> = StandardSchemaLike<T> | SafeParseSchemaLike<T>;

/** Outcome of validating one value against a {@link SchemaLike}. */
export type SchemaValidation<T> = { ok: true; data: T } | { ok: false; issues: SchemaIssue[] };

/**
 * The issue reported when a schema answers asynchronously.
 *
 * A frame is decoded inside the transport's `message` handler and delivered from
 * it, so there is nowhere to await: awaiting would deliver frames in whatever
 * order their validations settled, which is worse than refusing. Reported as a
 * validation failure rather than thrown, so it arrives through the same
 * `onValidationError` the caller already registered.
 */
const ASYNC_ISSUE: SchemaIssue = {
    path: "<root>",
    message:
        "the schema validated asynchronously, and a frame is decoded synchronously — " +
        "there is nowhere to await it. Use a synchronous schema, or validate inside your " +
        "own handler.",
};

/**
 * Format a Standard Schema issue path as a dotted string.
 *
 * @param path - The reported path, if any.
 * @returns The dotted path, or `"<root>"` when the value itself is at fault.
 */
function formatPath(path: readonly IssuePathSegment[] | undefined): string {
    if (!path || path.length === 0) return "<root>";
    return path
        .map((segment) =>
            typeof segment === "object" && segment !== null ? String(segment.key) : String(segment),
        )
        .join(".");
}

/**
 * Normalize one issue from either supported shape.
 *
 * @param issue - The issue as the validator reported it.
 * @returns The issue with a dotted path.
 */
function toIssue(issue: RawIssue): SchemaIssue {
    return { path: formatPath(issue.path), message: issue.message };
}

/**
 * Validate a value against a schema, whichever of the two shapes it has.
 *
 * @param schema - A Standard Schema or a `.safeParse` schema.
 * @param value - The value to validate.
 * @returns The validated output, or the issues explaining why it was refused.
 */
export function validateWithSchema<T>(schema: SchemaLike<T>, value: unknown): SchemaValidation<T> {
    if ("~standard" in schema) {
        const result = schema["~standard"].validate(value);
        if (typeof (result as { then?: unknown }).then === "function") {
            return { ok: false, issues: [ASYNC_ISSUE] };
        }
        const settled = result as
            | { readonly value: T; readonly issues?: undefined }
            | { readonly issues: readonly RawIssue[] };
        if (settled.issues) return { ok: false, issues: settled.issues.map(toIssue) };
        return { ok: true, data: settled.value };
    }
    const result = schema.safeParse(value);
    if (result.success) return { ok: true, data: result.data };
    return { ok: false, issues: result.error.issues.map(toIssue) };
}
