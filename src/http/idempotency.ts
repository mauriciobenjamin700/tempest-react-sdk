/**
 * Generate an RFC4122 v4 idempotency key (UUID). Use as the value for an
 * `Idempotency-Key` header on POST/PATCH requests that must not run twice.
 */
export function generateIdempotencyKey(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = Math.random() * 16;
        const value = c === "x" ? Math.floor(r) : (Math.floor(r) & 0x3) | 0x8;
        return value.toString(16);
    });
}
