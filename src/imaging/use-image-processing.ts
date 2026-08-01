/**
 * React bindings for image work.
 *
 * Two things components get wrong every time: they leak object URLs (an
 * `URL.createObjectURL` without its `revokeObjectURL` holds the whole blob
 * in memory for the page's lifetime), and they set state after unmounting
 * when a slow resize finishes late. Both live here instead of in each
 * component.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { compressToTarget, type CompressedImage } from "./compress";
import type { CompressOptions, ImageSource, ProcessedImage, ResizeOptions } from "./types";
import { resizeImage } from "./transform";

/** What {@link useImagePreview} returns. */
export interface UseImagePreviewResult {
    /** Object URL for the current source, or `null`. */
    readonly url: string | null;
}

/**
 * Hold an object URL for a blob, and revoke it when it is replaced.
 *
 * @example
 * ```tsx
 * function Preview({ file }: { file: File | null }) {
 *     const { url } = useImagePreview(file);
 *     return url === null ? null : <img src={url} alt="" />;
 * }
 * ```
 *
 * @param source The blob to preview, or `null`.
 * @returns The object URL, valid until the source changes or the component
 *   unmounts.
 */
export function useImagePreview(source: Blob | null | undefined): UseImagePreviewResult {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        if (source === null || source === undefined) {
            setUrl(null);
            return;
        }
        const created = URL.createObjectURL(source);
        setUrl(created);
        return () => {
            URL.revokeObjectURL(created);
        };
    }, [source]);

    return { url };
}

/** Lifecycle of a processing call. */
export type ImageProcessingStatus = "idle" | "working" | "done" | "error";

/** What {@link useImageProcessing} returns. */
export interface UseImageProcessingResult {
    /** Resize (and re-encode) an image. */
    readonly resize: (source: ImageSource, options?: ResizeOptions) => Promise<ProcessedImage>;
    /** Compress an image into a byte budget. */
    readonly compress: (source: ImageSource, options: CompressOptions) => Promise<CompressedImage>;
    /** The most recent result. */
    readonly result: ProcessedImage | null;
    /** Where the last call is. */
    readonly status: ImageProcessingStatus;
    /** Why the last call failed. */
    readonly error: Error | null;
    /** Whether a call is in flight. */
    readonly isWorking: boolean;
}

/**
 * Run image operations with status tracking, safe against unmount.
 *
 * @example
 * ```tsx
 * function Upload() {
 *     const { compress, isWorking, result } = useImageProcessing();
 *
 *     async function onPick(file: File) {
 *         const ready = await compress(file, { maxBytes: 1_000_000, width: 1600 });
 *         await fetch("/api/photos", { method: "POST", body: ready.blob });
 *     }
 *
 *     return <input type="file" disabled={isWorking} onChange={(e) => onPick(e.target.files![0]!)} />;
 * }
 * ```
 *
 * The returned promises still reject on failure, so a caller can `try`
 * around them; `status` and `error` exist for rendering, not for swallowing
 * the failure.
 *
 * @returns The operations plus their state.
 */
export function useImageProcessing(): UseImageProcessingResult {
    const [result, setResult] = useState<ProcessedImage | null>(null);
    const [status, setStatus] = useState<ImageProcessingStatus>("idle");
    const [error, setError] = useState<Error | null>(null);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const run = useCallback(
        async <T extends ProcessedImage>(work: () => Promise<T>): Promise<T> => {
            if (mounted.current) {
                setStatus("working");
                setError(null);
            }
            try {
                const produced = await work();
                if (mounted.current) {
                    setResult(produced);
                    setStatus("done");
                }
                return produced;
            } catch (caught) {
                const failure = caught instanceof Error ? caught : new Error(String(caught));
                if (mounted.current) {
                    setError(failure);
                    setStatus("error");
                }
                throw failure;
            }
        },
        [],
    );

    const resize = useCallback(
        (source: ImageSource, options: ResizeOptions = {}) =>
            run(() => resizeImage(source, options)),
        [run],
    );

    const compress = useCallback(
        (source: ImageSource, options: CompressOptions) =>
            run(() => compressToTarget(source, options)),
        [run],
    );

    return {
        resize,
        compress,
        result,
        status,
        error,
        isWorking: status === "working",
    };
}
