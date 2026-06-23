/**
 * Generate a collision-resistant id suitable for client-side UI keys.
 *
 * Uses `crypto.randomUUID()` when available, falling back to a
 * timestamp + `Math.random()` combination otherwise. When `prefix` is given,
 * the result is formatted as `${prefix}-${id}`.
 *
 * @example
 * randomId();          // "9f1c2b3a-..." (uuid) or "lq3f8k-4a9z1" (fallback)
 * randomId("user");    // "user-9f1c2b3a-..."
 */
export function randomId(prefix?: string): string {
    let id: string;

    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        id = crypto.randomUUID();
    } else {
        const time = Date.now().toString(36);
        const rand = Math.random().toString(36).slice(2, 10);
        id = `${time}-${rand}`;
    }

    return prefix ? `${prefix}-${id}` : id;
}
