import { isShareSupported, share } from "./share";

/** Options for {@link shareOrDownloadBlob}. */
export interface ShareOrDownloadOptions {
    /** Title passed to the Web Share dialog. Defaults to the file name. */
    title?: string;
    /**
     * Text shared alongside the file (an analysis result next to the photo,
     * a caption next to the report). Sent in the same share sheet as the file.
     */
    text?: string;
    /**
     * When the browser has the Web Share API but cannot share files, share
     * `text` on its own before downloading the file. Defaults to `true` when
     * `text` is set; ignored without `text`.
     */
    textOnlyFallback?: boolean;
}

/**
 * Trigger a plain download of `blob` through a temporary `<a download>`.
 *
 * @param blob - The binary payload to download.
 * @param fileName - The file name presented to the user.
 */
function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

/**
 * Try the Web Share API with the given `Blob` as a file; fall back to a
 * download anchor when the browser cannot share files (desktop Firefox, older
 * iOS Safari, etc.).
 *
 * A companion to {@link share} for the common "export a generated artifact"
 * flow: on mobile it opens the native share sheet, and everywhere else it
 * triggers a plain download. Returns early when the user shares or cancels the
 * file share dialog; otherwise it downloads.
 *
 * The order is file + text → text only → download. The text-only step runs
 * only when the browser exposes `navigator.share` but `canShare({ files })`
 * refuses the file, and it never replaces the download: whatever happens to
 * the text-only sheet (shared, cancelled, failed), the file still downloads.
 * The caller asked for a file to reach the user; a browser that cannot share
 * files would have downloaded it before `text` existed, so the text-only
 * sheet is an addition on top of that baseline, never a substitute that
 * silently drops the artifact. A file share that fails with a real error
 * (not `unsupported`, not `AbortError`) skips the text-only step and goes
 * straight to the download: the failed call has usually consumed the user
 * activation, so a second sheet would be rejected too. An empty `text` counts
 * as no text.
 *
 * @param blob - The binary payload to share or download.
 * @param fileName - The file name presented to the user.
 * @param options - Optional `title`, `text` and `textOnlyFallback`.
 * @returns A promise that resolves once the share or download completes.
 *
 * @example
 * const zip = new Blob([bytes], { type: "application/zip" });
 * await shareOrDownloadBlob(zip, "export.zip");
 */
export async function shareOrDownloadBlob(
    blob: Blob,
    fileName: string,
    options: ShareOrDownloadOptions = {},
): Promise<void> {
    const title = options.title ?? fileName;
    const { text } = options;
    const file = new File([blob], fileName, { type: blob.type });
    const result = await share(text ? { title, text, files: [file] } : { title, files: [file] });
    if (result.shared || result.cancelled) return;

    if (text && (options.textOnlyFallback ?? true) && result.unsupported && isShareSupported()) {
        await share({ title, text });
    }
    downloadBlob(blob, fileName);
}
