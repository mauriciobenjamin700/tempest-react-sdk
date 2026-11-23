/**
 * Writes `text` to the clipboard through the first path the runtime allows.
 *
 * `navigator.clipboard.writeText` comes first, but an embedded browser is where
 * it most often fails: absent outside a secure context, and rejected by web
 * views that never grant the permission. The legacy `execCommand("copy")` on a
 * selected, off-screen `<textarea>` still works in many of those, so it is the
 * second try rather than a branch only for missing APIs. Its boolean return is
 * honoured: `false` means the browser refused, and the caller must not show
 * "copied" for a clipboard that did not change.
 *
 * The third step of the chain — a read-only field with the text already
 * selected, so the system's own long-press copy finishes the job — is UI, so it
 * lives in the components that call this (`InstallCopyLink`, `ShareActions`)
 * and is triggered by a `false` here.
 *
 * Internal: shared by `useClipboard`, `useShare().copyLink`, `InstallCopyLink`
 * and `ShareActions`, so the four agree on what "copied" means.
 *
 * @tempest-limits empty-catch — a rejected or throwing copy path is the signal to
 * try the next one, and the caller turns the final `false` into the visible
 * selection fallback.
 *
 * @param text - The text to copy.
 * @returns Whether either path reported success. `false` outside a browser.
 */
export async function writeToClipboard(text: string): Promise<boolean> {
    if (typeof document === "undefined") return false;
    try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        /* empty */
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    try {
        textarea.select();
        return typeof document.execCommand === "function" && document.execCommand("copy");
    } catch {
        return false;
    } finally {
        document.body.removeChild(textarea);
    }
}
