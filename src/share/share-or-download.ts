import { share } from "./share";

/** Options for {@link shareOrDownloadBlob}. */
export interface ShareOrDownloadOptions {
    /** Title passed to the Web Share dialog. Defaults to the file name. */
    title?: string;
}

/**
 * Try the Web Share API with the given `Blob` as a file; fall back to a
 * download anchor when the browser cannot share files (desktop Firefox, older
 * iOS Safari, etc.).
 *
 * A companion to {@link share} for the common "export a generated artifact"
 * flow: on mobile it opens the native share sheet, and everywhere else it
 * triggers a plain download. Returns early when the user shares or cancels the
 * dialog; otherwise it downloads.
 *
 * @param blob - The binary payload to share or download.
 * @param fileName - The file name presented to the user.
 * @param options - Optional `title` for the share dialog.
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
    const file = new File([blob], fileName, { type: blob.type });
    const result = await share({ title: options.title ?? fileName, files: [file] });
    if (result.shared || result.cancelled) return;

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
