export interface SharePayload {
    title?: string;
    text?: string;
    url?: string;
    /** Files to share (supported only on a subset of browsers). */
    files?: File[];
}

export interface ShareResult {
    /** True when `navigator.share` resolved successfully. */
    shared: boolean;
    /** True when the platform did not support the requested payload. */
    unsupported: boolean;
    /** True when the user cancelled the share dialog. */
    cancelled: boolean;
    error?: unknown;
}

/**
 * Wrap the Web Share API with a uniform result object. Falls through to
 * `unsupported: true` when the browser lacks `navigator.share`, leaving the
 * caller free to render a custom fallback (copy-link, social buttons).
 */
export async function share(payload: SharePayload): Promise<ShareResult> {
    if (typeof navigator === "undefined" || !("share" in navigator)) {
        return { shared: false, unsupported: true, cancelled: false };
    }
    if (payload.files && !navigator.canShare?.({ files: payload.files })) {
        return { shared: false, unsupported: true, cancelled: false };
    }
    try {
        await navigator.share(payload);
        return { shared: true, unsupported: false, cancelled: false };
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            return { shared: false, unsupported: false, cancelled: true };
        }
        return { shared: false, unsupported: false, cancelled: false, error };
    }
}

/** True when the Web Share API is available in this environment. */
export function isShareSupported(): boolean {
    return typeof navigator !== "undefined" && "share" in navigator;
}
