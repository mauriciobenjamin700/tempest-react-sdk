import type { ResumableUploadOptions, ResumableUploadProgress } from "../http/resumable-upload";
import type { OutboxEntry } from "./create-offline-sync";

/**
 * One file an outbox entry depends on, as the app's own store describes it.
 *
 * The blob lives in the app's store (the photo table, say), never in the
 * outbox: the outbox keeps the record snapshot only, so a queued edit does not
 * copy the file a second time.
 *
 * An attachment with a non-empty `uploadedUrl` is on the server already and is
 * not uploaded again — its `blob` may be gone by then (released in
 * {@link OutboxAttachments.onUploaded}). One without it is pending and must
 * carry its `blob`; a pending attachment with no blob fails the entry.
 */
export interface OutboxAttachment {
    /** Stable id of the file in the app's store. Also the default resume key. */
    id: string;
    /** The bytes to upload. Required while `uploadedUrl` is empty. */
    blob?: Blob | null;
    /** Where the file already is on the server, once uploaded. */
    uploadedUrl?: string | null;
}

/** An attachment that reached the server, as handed to `deliver`. */
export interface OutboxAttachmentRef {
    /** The attachment id from {@link OutboxAttachments.list}. */
    id: string;
    /** The upload URL — what the record on the server points at. */
    url: string;
}

/**
 * Per-attachment options for `createResumableUpload`, minus the file, which the
 * engine takes from the attachment. `key` defaults to
 * `outbox-attachment:<id>`, so an interrupted upload resumes from its offset on
 * the next run instead of starting over — the default fingerprint cannot tell
 * two `Blob`s of the same size apart, since a `Blob` read back from IndexedDB
 * has no name and no `lastModified`.
 */
export type OutboxAttachmentUploadOptions = Omit<ResumableUploadOptions, "file">;

/**
 * Files an outbox entry carries, uploaded by the engine before the entry is
 * delivered; see {@link OfflineSyncConfig.attachments}.
 *
 * @typeParam TPayload - Record snapshot carried by outbox entries.
 */
export interface OutboxAttachments<TPayload> {
    /**
     * The attachments of an entry, read from the app's store, in the order
     * `deliver` receives them. Called right before each delivery, and to compute
     * {@link SyncState.pendingBytes} — so it must not have side effects.
     *
     * @param entry - The entry about to be delivered (folded, under `coalesce`).
     */
    list: (
        entry: OutboxEntry<TPayload>,
    ) => readonly OutboxAttachment[] | Promise<readonly OutboxAttachment[]>;
    /**
     * Upload options for one pending attachment: the tus `endpoint`, the
     * credential getters, `chunkSize`, `metadata`. `file` is the attachment's
     * blob; `key` defaults to `outbox-attachment:<id>`. An `onProgress` given
     * here still fires, after the engine's own.
     *
     * @param attachment - The pending attachment.
     */
    upload: (
        attachment: OutboxAttachment & { blob: Blob },
    ) => OutboxAttachmentUploadOptions | Promise<OutboxAttachmentUploadOptions>;
    /**
     * Persist the URL of an attachment that finished uploading, so the next
     * {@link OutboxAttachments.list} reports it as `uploadedUrl` and it is not
     * sent again. Also the place to release the blob from the app's store, or
     * swap it for a thumbnail: once this resolves, the server has the file.
     *
     * Not called when the session ended (`clearOutbox()`/`resetWatermark()`)
     * while the upload was in flight — it would write into the next user's local
     * state. The resume record keeps the finished offset, so that upload
     * completes without resending a byte on the owner's next run.
     *
     * @param attachment - The attachment that was uploaded.
     * @param url - Its upload URL.
     */
    onUploaded: (
        attachment: OutboxAttachment & { blob: Blob },
        url: string,
    ) => void | Promise<void>;
}

/**
 * Hooks the engine passes to {@link uploadEntryAttachments}.
 */
export interface AttachmentRunHooks {
    /** Whether the session the run started under is still the current one. */
    isCurrent: () => boolean;
    /** Byte progress of the attachment in flight. */
    onProgress: (uploaded: number, total: number) => void;
    /** An attachment finished and its URL was persisted. */
    onUploaded: (bytes: number) => void;
}

/**
 * Whether an attachment is already on the server.
 *
 * @param attachment - The attachment.
 * @returns `true` when it carries a non-empty `uploadedUrl`.
 */
function isUploaded(
    attachment: OutboxAttachment,
): attachment is OutboxAttachment & { uploadedUrl: string } {
    return typeof attachment.uploadedUrl === "string" && attachment.uploadedUrl !== "";
}

/**
 * Upload the pending attachments of an entry, one at a time, in list order.
 *
 * `createResumableUpload` is loaded on first use, so an engine without
 * attachments does not carry the tus client. A `start()` that resolves `null` —
 * the upload was paused or aborted, not refused — fails the entry like a
 * refusal does: delivering the record without its file would point it at
 * nothing.
 *
 * @typeParam TPayload - Record snapshot carried by outbox entries.
 * @param config - The app's attachment hooks.
 * @param entry - The entry about to be delivered.
 * @param hooks - Session check and progress reporting.
 * @returns The refs of every attachment, or `null` when the session ended and
 *   the run must stop without delivering.
 * @throws Whatever the upload or `onUploaded` threw, or an `Error` when an
 *   upload stopped short or a pending attachment has no blob.
 */
export async function uploadEntryAttachments<TPayload>(
    config: OutboxAttachments<TPayload>,
    entry: OutboxEntry<TPayload>,
    hooks: AttachmentRunHooks,
): Promise<OutboxAttachmentRef[] | null> {
    const attachments = await config.list(entry);
    const refs: OutboxAttachmentRef[] = [];
    for (const attachment of attachments) {
        if (isUploaded(attachment)) {
            refs.push({ id: attachment.id, url: attachment.uploadedUrl });
            continue;
        }
        const blob = attachment.blob;
        if (!blob) throw new Error(`Attachment ${attachment.id} has no blob and no uploadedUrl.`);
        const pending = { ...attachment, blob };
        const options = await config.upload(pending);
        if (!hooks.isCurrent()) return null;
        const { createResumableUpload } = await import("../http/resumable-upload");
        const result = await createResumableUpload({
            ...options,
            key: options.key ?? `outbox-attachment:${attachment.id}`,
            file: blob,
            onProgress: (progress: ResumableUploadProgress) => {
                hooks.onProgress(progress.loaded, progress.total);
                options.onProgress?.(progress);
            },
        }).start();
        if (!hooks.isCurrent()) return null;
        if (result === null)
            throw new Error(`Upload of attachment ${attachment.id} stopped before completing.`);
        await config.onUploaded(pending, result.url);
        hooks.onUploaded(blob.size);
        refs.push({ id: attachment.id, url: result.url });
    }
    return refs;
}

/**
 * Bytes still to upload across the queued entries, for
 * {@link SyncState.pendingBytes}.
 *
 * Attachments are counted once by id, since several queued edits of one record
 * list the same files. An entry whose `list` throws — the app's store refusing
 * to read while nobody is signed in, say — adds nothing: this is a display
 * number, and the delivery that needs the list reports the error itself.
 *
 * @typeParam TPayload - Record snapshot carried by outbox entries.
 * @param config - The app's attachment hooks.
 * @param entries - The queued entries.
 * @returns The sum of the pending blobs' sizes.
 */
export async function pendingAttachmentBytes<TPayload>(
    config: OutboxAttachments<TPayload>,
    entries: readonly OutboxEntry<TPayload>[],
): Promise<number> {
    const sizes = new Map<string, number>();
    for (const entry of entries) {
        let attachments: readonly OutboxAttachment[];
        try {
            attachments = await config.list(entry);
        } catch {
            continue;
        }
        for (const attachment of attachments) {
            if (!isUploaded(attachment) && attachment.blob)
                sizes.set(attachment.id, attachment.blob.size);
        }
    }
    let total = 0;
    for (const size of sizes.values()) total += size;
    return total;
}

/**
 * Whether the browser has made this origin's storage persistent.
 *
 * Read only — the engine never asks for persistence itself, because Firefox
 * answers `navigator.storage.persist()` with a permission prompt, and a prompt
 * out of nowhere during a background sync is a prompt the user denies.
 *
 * @returns `true`/`false` from `navigator.storage.persisted()`, or `null` where
 *   the API is missing (SSR, tests, older browsers) or the call fails.
 */
export async function readStoragePersisted(): Promise<boolean | null> {
    if (typeof navigator === "undefined" || typeof navigator.storage?.persisted !== "function") {
        return null;
    }
    try {
        return await navigator.storage.persisted();
    } catch {
        return null;
    }
}
