import { useEffect, useState } from "react";

/**
 * Create an object URL for a `Blob` (or `File`) and revoke it automatically on
 * unmount or whenever the blob changes. Returns `null` for nullish input.
 *
 * @param blob - the blob to expose as an object URL, or `null`/`undefined`.
 * @returns The object URL string, or `null` when there is no blob.
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!blob) {
            setUrl(null);
            return;
        }
        const next = URL.createObjectURL(blob);
        setUrl(next);
        return () => URL.revokeObjectURL(next);
    }, [blob]);

    return url;
}
