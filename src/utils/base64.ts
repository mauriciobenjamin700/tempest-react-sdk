/**
 * Base64-encode bytes, without splatting the whole array into `fromCharCode`.
 *
 * `String.fromCharCode(...bytes)` overflows the argument limit somewhere around
 * a hundred thousand entries — which a compressed save reaches easily — so the
 * conversion walks the buffer in 32 KiB windows. That is also why this is the
 * version worth sharing: the byte-at-a-time loop the other two call sites used
 * has no argument limit either, but it is markedly slower on the payload sizes
 * `compressedStorage` exists for.
 *
 * @param bytes - The bytes to encode.
 * @param options - Pass `urlSafe` for the base64url alphabet (`-`/`_`, unpadded),
 *   which is what WebAuthn and anything travelling in a URL needs.
 * @returns Base64 text.
 */
export function bytesToBase64(bytes: Uint8Array, options: { urlSafe?: boolean } = {}): string {
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    const encoded = btoa(binary);
    if (!options.urlSafe) return encoded;
    return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Decode base64 into bytes, accepting either alphabet.
 *
 * Takes no `urlSafe` option on purpose: translating `-`/`_` and restoring the
 * padding are no-ops on standard padded base64, so one permissive decoder is
 * correct for both inputs. Getting this half wrong — usually by feeding
 * unpadded base64url straight to `atob` and losing the last byte — is the
 * classic broken-WebAuthn bug.
 *
 * @param value - Base64 or base64url text, with or without `=` padding.
 * @returns The decoded bytes.
 */
export function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
    const standard = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = standard.padEnd(standard.length + ((4 - (standard.length % 4)) % 4), "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}
