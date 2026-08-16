import { gunzipSync, gzipSync } from "fflate";

/**
 * Gzip-backed `localStorage`, for payloads that would otherwise eat the quota.
 *
 * Kept in its own module rather than folded into {@link storage} so that
 * importing the plain typed wrapper never drags `fflate` into the bundle.
 *
 * @tempest-limits empty-catch — every operation here is best-effort by
 * contract, exactly like {@link storage}. `localStorage` throws on quota
 * exhaustion, in Safari private mode, and when a cross-origin frame has storage
 * blocked; a caller persisting state has no recovery to run and no message to
 * show, so the write is dropped and the value stays in memory for the session.
 */

/**
 * Prefix stamped on every value this module writes.
 *
 * It makes the format self-describing, which is what lets a read fall back to
 * plain JSON: a key that predates compression — or that a degraded write stored
 * uncompressed — is still readable, so turning compression on for an existing
 * key does not orphan the data already there. The character also cannot open a
 * JSON document, so the two cases can never be confused.
 */
const MARKER = "~tgz1:";

/**
 * Base64-encode bytes without splatting the whole array into `fromCharCode`.
 *
 * `String.fromCharCode(...bytes)` overflows the argument limit somewhere around
 * a hundred thousand entries, which a compressed save reaches easily, so the
 * conversion walks the buffer in 32 KiB windows instead.
 */
function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

/** Inverse of {@link bytesToBase64}. */
function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Serialize a value to a gzipped, base64 string carrying the format marker.
 *
 * Base64 costs a third more characters than the raw compressed bytes, and
 * `localStorage` bills two bytes per character on top of that. Packing the
 * bytes into UTF-16 code units directly would be denser, but lone surrogates
 * survive neither every storage implementation nor a JSON round-trip, and a
 * save that decodes to garbage is far worse than one that is bigger. Even with
 * that overhead a typical JSON document lands well under a third of its
 * uncompressed size.
 *
 * @typeParam T - The value being stored.
 * @param value - Any JSON-serializable value.
 * @returns The encoded string, ready for `localStorage`.
 */
export function compressToString<T>(value: T): string {
    const json = JSON.stringify(value);
    const bytes = gzipSync(new TextEncoder().encode(json));
    return `${MARKER}${bytesToBase64(bytes)}`;
}

/**
 * Decode a string produced by {@link compressToString}.
 *
 * A string without the marker is parsed as plain JSON, so values written before
 * compression was enabled — or by a write that fell back after `gzipSync`
 * failed — still read back.
 *
 * @typeParam T - The expected value shape.
 * @param raw - The stored string.
 * @returns The decoded value.
 * @throws If the payload is neither valid compressed data nor valid JSON.
 */
export function decompressFromString<T>(raw: string): T {
    if (!raw.startsWith(MARKER)) return JSON.parse(raw) as T;
    const bytes = gunzipSync(base64ToBytes(raw.slice(MARKER.length)));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

/**
 * Codec pair for {@link useLocalStorage}, so a compressed key gets the hook's
 * cross-tab sync and SSR guard for free.
 *
 * @example
 * const [save, setSave] = useLocalStorage("save", EMPTY_SAVE, compressedStorageCodec);
 */
export const compressedStorageCodec = {
    serialize: compressToString,
    deserialize: decompressFromString,
};

/**
 * Typed `localStorage` wrapper that gzips what it writes.
 *
 * Mirrors {@link storage} so the two are interchangeable at the call site; the
 * difference is only in how the value is encoded.
 */
export const compressedStorage = {
    /**
     * Read and decompress a key.
     *
     * @typeParam T - The expected value shape.
     * @param key - Storage key.
     * @param fallback - Returned when the key is absent, unreadable, or corrupt.
     * @returns The stored value, or `fallback`.
     */
    get<T>(key: string, fallback: T): T {
        if (typeof window === "undefined") return fallback;
        try {
            const raw = window.localStorage.getItem(key);
            return raw === null ? fallback : decompressFromString<T>(raw);
        } catch {
            return fallback;
        }
    },

    /**
     * Compress and write a key.
     *
     * When compression itself fails the value is written as plain JSON rather
     * than dropped: a slightly larger record still loads, an absent one does
     * not. Only a storage-level failure — quota, blocked storage — loses the
     * write.
     *
     * @typeParam T - The value being stored.
     * @param key - Storage key.
     * @param value - Any JSON-serializable value.
     */
    set<T>(key: string, value: T): void {
        if (typeof window === "undefined") return;
        let encoded: string;
        try {
            encoded = compressToString(value);
        } catch {
            encoded = JSON.stringify(value);
        }
        try {
            window.localStorage.setItem(key, encoded);
        } catch {
            /* empty */
        }
    },
};
