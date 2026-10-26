import { TempestApiError } from "./errors";
import { uploadWithProgress } from "./upload-with-progress";
import type { UploadProgressEvent } from "./upload-with-progress";

/**
 * A pre-signed `POST` form, as `tempest-fastapi-sdk` >= 0.331.0 hands it out
 * (`presigned_post_policy` / `SubjectObjectStorage.presign_post`).
 *
 * Snake case on purpose: this is the wire shape, so it parses straight from the
 * response of the app's own route.
 */
export interface PresignedPost {
    /** Where the form is posted: the bucket on S3/MinIO, or the API itself on the local backend. */
    url: string;
    /** Form fields to send before the file, in this order — `key`, `policy`, signature and the rest. */
    fields: Record<string, string>;
    /** Largest file the policy accepts, in bytes. */
    max_bytes: number;
}

export interface UploadPresignedPostOptions {
    /** Called on every `progress` event of the upload. */
    onProgress?: (event: UploadProgressEvent) => void;
    /** Abort the upload; rejects with an `AbortError` `DOMException`. */
    signal?: AbortSignal;
    /** File name sent with the `file` part. Defaults to `file.name` for a `File`. */
    fileName?: string;
}

/**
 * S3 error codes mapped to the codes the local storage backend of
 * `tempest-fastapi-sdk` answers with, so one `code` reaches the UI whichever
 * backend the service is configured with.
 *
 * Statuses follow the local backend too: S3 answers `EntityTooLarge` with `400`,
 * the local backend `FILE_TOO_LARGE` with `413`. Measured against MinIO
 * `RELEASE.2025-04-22T22-12-26Z` from Chrome, cross-origin: the XML error body is
 * readable (MinIO sends CORS headers on errors), an expired policy and a broken
 * condition are both `AccessDenied` and differ only in the message
 * (`Policy expired` / `Policy Condition failed`).
 */
const S3_ERRORS: Readonly<Record<string, { status: number; code: string; detail: string }>> = {
    EntityTooLarge: {
        status: 413,
        code: "FILE_TOO_LARGE",
        detail: "Arquivo maior que o permitido.",
    },
    EntityTooSmall: {
        status: 400,
        code: "FILE_TOO_SMALL",
        detail: "Arquivo menor que o permitido.",
    },
    AccessDenied: {
        status: 403,
        code: "SIGNED_URL_INVALID",
        detail: "O link de envio não aceita este arquivo.",
    },
};

const EXPIRED_POLICY = /policy expired/i;

/**
 * Text of the first `<tag>` element in an S3 XML error body.
 *
 * @param xml - The response body.
 * @param tag - Element name.
 * @returns The element text, or `undefined` when absent.
 */
function xmlText(xml: string, tag: string): string | undefined {
    return new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)?.[1];
}

/**
 * Rewrite an S3 XML error into the local backend's code and status.
 *
 * A JSON envelope from the local backend already carries `code` and passes
 * through untouched, as does any failure without an XML body (network, abort).
 *
 * @param error - What the upload rejected with.
 * @returns The error to surface.
 */
function normalizeError(error: unknown): unknown {
    if (!(error instanceof TempestApiError) || typeof error.body !== "string") return error;
    const s3Code = xmlText(error.body, "Code");
    if (!s3Code) return error;
    const message = xmlText(error.body, "Message") ?? "";
    const mapped =
        s3Code === "AccessDenied" && EXPIRED_POLICY.test(message)
            ? {
                  status: 403,
                  code: "SIGNED_URL_EXPIRED",
                  detail: "O link de envio expirou.",
              }
            : (S3_ERRORS[s3Code] ?? { status: error.status, code: s3Code, detail: message });
    return new TempestApiError({
        status: mapped.status,
        code: mapped.code,
        detail: mapped.detail || error.detail,
        requestId: xmlText(error.body, "RequestId") ?? error.requestId,
        body: error.body,
    });
}

/**
 * Upload a file straight to storage through a pre-signed `POST` form, with the
 * size ceiling the policy enforces.
 *
 * The form is built the way S3 requires: every `post.fields` entry in order,
 * the file last in the `file` part — S3 ignores whatever follows the file.
 *
 * The request carries **no** credential and no custom header: no
 * `Authorization`, no CSRF token, no `X-Request-ID`, no cookies. `post.url` is
 * usually the storage host, outside the API's origin, and the signature in
 * `fields` is the whole authorization. Without custom headers the request is a
 * CORS "simple request", so it does not depend on the bucket's CORS rules
 * allowing a preflight.
 *
 * A file larger than `post.max_bytes` is refused before anything is sent, with
 * the same `413 FILE_TOO_LARGE` the server would answer. Server errors are
 * normalized into one `TempestApiError` whichever backend answered: the S3 XML
 * (`EntityTooLarge` → `FILE_TOO_LARGE`, `EntityTooSmall` → `FILE_TOO_SMALL`,
 * `AccessDenied` → `SIGNED_URL_INVALID`, or `SIGNED_URL_EXPIRED` when the policy
 * expired) or the local backend's JSON envelope, which already uses those codes.
 *
 * @example
 * const post = await api.post<PresignedPost>("/avatars/upload-form");
 * await uploadPresignedPost(post, file, { onProgress: (p) => setProgress(p.fraction) });
 *
 * @param post - The form the API handed out.
 * @param file - The file or blob to upload.
 * @param options - Progress callback, abort signal and file name.
 * @returns Resolves when storage accepted the file (`204` on S3).
 * @throws TempestApiError On a refused upload, with the normalized `code`.
 */
export async function uploadPresignedPost(
    post: PresignedPost,
    file: Blob,
    options: UploadPresignedPostOptions = {},
): Promise<void> {
    const { onProgress, signal, fileName } = options;
    if (file.size > post.max_bytes) {
        throw new TempestApiError({
            status: 413,
            code: "FILE_TOO_LARGE",
            detail: `Arquivo de ${file.size} bytes excede o limite de ${post.max_bytes} bytes.`,
        });
    }

    const form = new FormData();
    for (const [name, value] of Object.entries(post.fields)) form.append(name, value);
    if (fileName !== undefined) form.append("file", file, fileName);
    else form.append("file", file);

    try {
        await uploadWithProgress({
            url: post.url,
            body: form,
            method: "POST",
            requestId: () => "",
            withCredentials: false,
            onProgress,
            signal,
            parser: () => undefined,
        });
    } catch (error) {
        throw normalizeError(error);
    }
}
