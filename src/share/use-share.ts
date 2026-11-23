import { useCallback, useEffect, useMemo, useRef } from "react";

import { isShareSupported, share as webShare } from "./share";
import type { SharePayload, ShareResult } from "./share";
import { shareText } from "./share-text";
import { writeToClipboard } from "./write-to-clipboard";

/**
 * How a {@link UseShareResult.share} call ended.
 *
 * - `"shared"` — the system sheet closed with a target picked.
 * - `"cancelled"` — the person closed the sheet (`AbortError`). Not an error:
 *   show nothing.
 * - `"unsupported"` — this browser has no Web Share API. Offer `wa.me` or
 *   "copy link" instead.
 * - `"failed"` — the browser refused for another reason, most often an expired
 *   user activation (`NotAllowedError`). The error goes to
 *   {@link UseShareOptions.onError}.
 */
export type ShareOutcome = "shared" | "cancelled" | "unsupported" | "failed";

/** What to share through {@link UseShareResult.share}. */
export interface ShareContent {
    /** Title of the share sheet. */
    title?: string;
    /** Message text. With an image attached, the `url` is folded into it. */
    text?: string;
    /** Link to share. */
    url?: string;
    /**
     * Preview image sent as a file when the device accepts files
     * (`navigator.canShare({ files })`). Fetched with `fetch`, so a cross-origin
     * URL needs CORS. Any failure — network, non-2xx, timeout, a file the device
     * refuses — shares the same content without the image.
     */
    imageUrl?: string;
    /**
     * File name of the image. Defaults to the last path segment of `imageUrl`
     * when it has an extension, otherwise `preview.<ext>` from the response
     * type. The extension matters: Chromium decides by it whether a file is
     * shareable.
     */
    imageFileName?: string;
}

/** Options of {@link useShare}. */
export interface UseShareOptions {
    /**
     * How long `share` waits for the image before sharing without it, in ms.
     * Default `3000`.
     */
    imageTimeoutMs?: number;
    /** Called with the error of every `"failed"` share, for telemetry. */
    onError?: (error: unknown) => void;
}

/** What {@link useShare} returns. */
export interface UseShareResult {
    /** Whether this browser has the Web Share API (`navigator.share`). */
    canShare: boolean;
    /** Whether the device accepts an image file in the share sheet. */
    canShareFiles: boolean;
    /** Open the system share sheet. Never rejects; see {@link ShareOutcome}. */
    share: (content: ShareContent) => Promise<ShareOutcome>;
    /**
     * Copy `url` through the Clipboard API, then `execCommand("copy")`.
     * Resolves `false` when both are refused — render the link in a selected,
     * read-only field so the system's long-press copy finishes the job, as
     * `ShareActions` does.
     */
    copyLink: (url: string) => Promise<boolean>;
    /**
     * Start downloading `imageUrl` ahead of the click. Call it on hover, focus or
     * pointer down; a no-op where files cannot be shared.
     */
    prefetchImage: (imageUrl: string) => void;
}

const DEFAULT_IMAGE_TIMEOUT_MS = 3000;

const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
};

/**
 * Whether the device would accept an image in the share sheet, asked with an
 * empty PNG: `canShare` judges a file by its type and extension, not its bytes,
 * so the answer comes before any download.
 *
 * @tempest-limits empty-catch — a `canShare` that throws on a file payload is a
 * device that cannot share files.
 *
 * @returns `true` when `navigator.canShare({ files })` accepts an image.
 */
function detectFileSharing(): boolean {
    if (!isShareSupported() || typeof navigator.canShare !== "function") return false;
    try {
        const probe = new File([], "preview.png", { type: "image/png" });
        return navigator.canShare({ files: [probe] });
    } catch {
        return false;
    }
}

/**
 * Download an image as a `Blob`.
 *
 * @param imageUrl - The image address.
 * @returns The body, or `null` on any failure.
 */
async function fetchImage(imageUrl: string): Promise<Blob | null> {
    try {
        const response = await fetch(imageUrl);
        return response.ok ? await response.blob() : null;
    } catch {
        return null;
    }
}

/**
 * Name the shared image file.
 *
 * @param imageUrl - The image address.
 * @param type - MIME type of the downloaded body.
 * @param explicit - The caller's name, when given.
 * @returns A file name with an extension.
 */
function imageFileName(imageUrl: string, type: string, explicit: string | undefined): string {
    if (explicit) return explicit;
    const base = typeof location === "undefined" ? "http://localhost/" : location.href;
    const segment = new URL(imageUrl, base).pathname.split("/").pop() ?? "";
    if (/\.[a-z0-9]+$/i.test(segment)) return decodeURIComponent(segment);
    return `preview.${IMAGE_EXTENSIONS[type] ?? "png"}`;
}

/**
 * Resolve `promise`, or `null` once `ms` have passed.
 *
 * @param promise - The pending download.
 * @param ms - The deadline.
 * @returns Whichever settles first.
 */
function withDeadline<T>(promise: Promise<T | null>, ms: number): Promise<T | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
    });
    return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Drop the fields that are `undefined` or empty, so the share sheet gets only
 * what the caller set.
 *
 * @param payload - The raw payload.
 * @returns The payload without empty fields.
 */
function compact(payload: SharePayload): SharePayload {
    return Object.fromEntries(
        Object.entries(payload).filter(([, value]) => value !== undefined && value !== ""),
    ) as SharePayload;
}

/**
 * Map the result of the low-level `share()` onto a {@link ShareOutcome}.
 *
 * @param result - What `share()` returned.
 * @returns The outcome.
 */
function outcomeOf(result: ShareResult): ShareOutcome {
    if (result.shared) return "shared";
    if (result.cancelled) return "cancelled";
    if (result.unsupported) return "unsupported";
    return "failed";
}

/**
 * Share a link — with a preview image when the device takes one — through the
 * system share sheet, and copy it as the fallback.
 *
 * Built on {@link share} (the uniform wrapper over `navigator.share`), this is
 * the flow every app rewrites around it:
 *
 * 1. **Capability, not user agent.** `canShare` is `navigator.share` existing;
 *    `canShareFiles` is `navigator.canShare({ files })` accepting an image. A
 *    desktop Chrome on Windows has the sheet and gets it; a phone browser
 *    without it does not. Sniffing "mobile" gets both wrong.
 * 2. **The image is downloaded only when it can be sent.** Where `canShareFiles`
 *    is `false` no request is made. Where it is `true`, the image travels as a
 *    `File` and the `url` is folded into `text`, because most targets keep a
 *    file's caption and drop the separate link.
 * 3. **The image never blocks the share.** A failed download, a non-2xx, a type
 *    the device refuses or a download slower than `imageTimeoutMs` shares the
 *    same content without the image.
 * 4. **The click's user activation is finite.** `navigator.share` must run
 *    while the click's transient activation is alive — 5 s in Chromium
 *    (measured: alive after a 4.5 s `fetch`, gone after 5.5 s); WebKit is
 *    stricter. That is why the image waits at most `imageTimeoutMs` (3 s), and
 *    why `prefetchImage` exists: start the download on hover, focus or pointer
 *    down, and the click finds it ready.
 * 5. **Cancelling is not an error.** `AbortError` resolves `"cancelled"`.
 *
 * `share` never rejects. `copyLink` runs the Clipboard API → `execCommand`
 * chain shared with `useClipboard` and `InstallCopyLink`.
 *
 * @example
 * const { canShare, share, copyLink } = useShare();
 * const outcome = await share({
 *     title: "Carona Picos → Teresina",
 *     text: "Sexta, 07:05 · 3 vagas",
 *     url: "https://app.example/s/42",
 *     imageUrl: "https://app.example/s/42/og.png",
 * });
 * if (outcome === "unsupported") await copyLink("https://app.example/s/42");
 *
 * @param options - `imageTimeoutMs` and `onError`.
 * @returns Capabilities, `share`, `copyLink` and `prefetchImage`.
 */
export function useShare(options: UseShareOptions = {}): UseShareResult {
    const optionsRef = useRef<UseShareOptions>(options);
    useEffect(() => {
        optionsRef.current = options;
    }, [options]);
    const images = useRef<Map<string, Promise<Blob | null>>>(new Map());
    const canShare = useMemo<boolean>(() => isShareSupported(), []);
    const canShareFiles = useMemo<boolean>(() => detectFileSharing(), []);

    const loadImage = useCallback((imageUrl: string): Promise<Blob | null> => {
        const cached = images.current.get(imageUrl);
        if (cached) return cached;
        const pending = fetchImage(imageUrl).then((blob) => {
            if (!blob) images.current.delete(imageUrl);
            return blob;
        });
        images.current.set(imageUrl, pending);
        return pending;
    }, []);

    const prefetchImage = useCallback(
        (imageUrl: string): void => {
            if (canShareFiles && imageUrl) void loadImage(imageUrl);
        },
        [canShareFiles, loadImage],
    );

    const share = useCallback(
        async (content: ShareContent): Promise<ShareOutcome> => {
            if (!isShareSupported()) return "unsupported";
            const { title, text, url, imageUrl } = content;
            const plain = compact({ title, text, url });
            let result: ShareResult | null = null;
            if (canShareFiles && imageUrl) {
                const timeout = optionsRef.current.imageTimeoutMs ?? DEFAULT_IMAGE_TIMEOUT_MS;
                const blob = await withDeadline(loadImage(imageUrl), timeout);
                if (blob) {
                    const type = blob.type || "image/png";
                    const name = imageFileName(imageUrl, type, content.imageFileName);
                    const file = new File([blob], name, { type });
                    result = await webShare(
                        compact({ title, text: shareText(text, url), files: [file] }),
                    );
                    if (result.unsupported) result = null;
                }
            }
            result ??= await webShare(plain);
            const outcome = outcomeOf(result);
            if (outcome === "failed") optionsRef.current.onError?.(result.error);
            return outcome;
        },
        [canShareFiles, loadImage],
    );

    return { canShare, canShareFiles, share, copyLink: writeToClipboard, prefetchImage };
}
