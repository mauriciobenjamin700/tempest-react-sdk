import { gunzipSync, gzipSync } from "fflate";

import { base64ToBytes, bytesToBase64 } from "./base64";

import { createJsonStorage, type JsonStorage, type StorageCodec } from "./storage";

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
 * Largest decompressed size {@link decompressFromString} will allocate: 64 MiB.
 *
 * Deflate reaches ~1000:1 on repetitive input (measured with fflate: 20 MB of
 * `"A"` gzips to 19 551 bytes, ratio 1023), so the ~5 MB a `localStorage` origin
 * holds could ask for gigabytes on read. A legitimate value is far below this:
 * it had to pass through `JSON.stringify` and `gzipSync` in the same tab first.
 */
const MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;

/**
 * Decode a string produced by {@link compressToString}.
 *
 * A string without the marker is parsed as plain JSON, so values written before
 * compression was enabled — or by a write that fell back after `gzipSync`
 * failed — still read back.
 *
 * The output size is bounded before anything is inflated. fflate sizes its
 * output buffer from the gzip trailer (`ISIZE`) and never grows it — measured: a
 * 1 MB payload whose trailer claims 10 bytes inflates to exactly 10 — so
 * refusing a trailer above {@link MAX_DECOMPRESSED_BYTES} bounds the allocation,
 * whatever the trailer says about the real data. A corrupted or hostile value
 * fails fast instead of taking the tab's memory.
 *
 * @typeParam T - The expected value shape.
 * @param raw - The stored string.
 * @returns The decoded value.
 * @throws If the payload is neither valid compressed data nor valid JSON, or
 *   declares a decompressed size above 64 MiB.
 */
export function decompressFromString<T>(raw: string): T {
    if (!raw.startsWith(MARKER)) return JSON.parse(raw) as T;
    const compressed = base64ToBytes(raw.slice(MARKER.length));
    if (compressed.byteLength >= 4) {
        const trailer = new DataView(
            compressed.buffer,
            compressed.byteOffset,
            compressed.byteLength,
        );
        const size = trailer.getUint32(compressed.byteLength - 4, true);
        if (size > MAX_DECOMPRESSED_BYTES) {
            throw new RangeError(
                `Compressed value declares ${size} bytes once inflated, above the ` +
                    `${MAX_DECOMPRESSED_BYTES}-byte limit.`,
            );
        }
    }
    const bytes = gunzipSync(compressed);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

/**
 * Codec pair for {@link useLocalStorage}, so a compressed key gets the hook's
 * cross-tab sync and SSR guard for free.
 *
 * @example
 * const [save, setSave] = useLocalStorage("save", EMPTY_SAVE, compressedStorageCodec);
 */
export const compressedStorageCodec: StorageCodec = {
    serialize: compressToString,
    deserialize: decompressFromString,
};

/**
 * Typed `localStorage` wrapper that gzips what it writes.
 *
 * {@link createJsonStorage} with {@link compressedStorageCodec}, so it is the
 * same implementation as {@link storage} and genuinely interchangeable with it —
 * `get`, `set` and `remove`, differing only in how the value is encoded. It used
 * to be a hand-written copy that had no `remove`, which made that promise false
 * for anybody who took the docstring at its word.
 *
 * When compression itself fails the value is written as plain JSON rather than
 * dropped: a slightly larger record still loads, an absent one does not. Only a
 * storage-level failure — quota, blocked storage — loses the write.
 */
export const compressedStorage: JsonStorage = createJsonStorage(compressedStorageCodec);
