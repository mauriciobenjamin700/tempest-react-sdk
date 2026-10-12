/**
 * FNV-1a 32-bit offset basis, the seed of the first half of the fingerprint.
 *
 * Ported from the FNV specification (Fowler/Noll/Vo, `offset_basis` for 32 bits).
 */
export const FNV_OFFSET_BASIS_32 = 0x811c9dc5;

/**
 * FNV-1a 32-bit prime.
 *
 * Ported from the FNV specification (Fowler/Noll/Vo, `FNV_prime` for 32 bits).
 */
export const FNV_PRIME_32 = 0x01000193;

/**
 * Seed of the second half of the fingerprint: the basis with every bit
 * flipped, so the two halves are independent hashes of the same text.
 */
const SECOND_SEED = ~FNV_OFFSET_BASIS_32 >>> 0;

/**
 * Hash `text` with FNV-1a from `seed`.
 *
 * @param text - What to hash, read as UTF-16 code units.
 * @param seed - Starting value.
 * @returns The 32-bit hash as an unsigned integer.
 */
function fnv1a(text: string, seed: number): number {
    let hash = seed;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, FNV_PRIME_32);
    }
    return hash >>> 0;
}

/**
 * A 64-bit one-way fingerprint of `text`, as 16 hex characters.
 *
 * Not a cryptographic hash, and it does not need to be: it only has to tell
 * two signed-in identities apart on one device, and it must not let anyone
 * holding the stored queue send as the user. Sixty-four bits cannot be turned
 * back into a bearer token, and two different users colliding on one browser
 * is a one-in-2^64 event. A synchronous hash is what lets `report()` stamp the
 * owner without awaiting `crypto.subtle`.
 *
 * @param text - The principal or token to fingerprint.
 * @returns Sixteen lowercase hex characters.
 */
export function fingerprintAppErrorOwner(text: string): string {
    const first = fnv1a(text, FNV_OFFSET_BASIS_32).toString(16).padStart(8, "0");
    const second = fnv1a(text, SECOND_SEED).toString(16).padStart(8, "0");
    return `${first}${second}`;
}

/**
 * Turn a principal or a token into the fingerprint a queue entry stores.
 *
 * The prefix keeps the two sources from ever matching each other: a report
 * stamped from a principal is never taken for one stamped from a token.
 *
 * Only a non-empty string or a finite number is an identity. Anything else —
 * notably the `Promise` an `async` getter returns from untyped JS — reads as
 * nobody, because stringifying it would give every user the same
 * `"[object Promise]"` fingerprint.
 *
 * @param source - `"p"` for a principal from `getPrincipal`, `"t"` for a token.
 * @param value - The identity, or nothing when nobody is signed in.
 * @returns `"<source>:<fingerprint>"`, or `null` when `value` is no identity.
 */
export function appErrorOwner(source: "p" | "t", value: unknown): string | null {
    const text =
        typeof value === "string"
            ? value
            : typeof value === "number" && Number.isFinite(value)
              ? String(value)
              : "";
    return text ? `${source}:${fingerprintAppErrorOwner(text)}` : null;
}
