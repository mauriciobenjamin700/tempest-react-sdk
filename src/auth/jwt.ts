export interface DecodedJWT {
    header: Record<string, unknown>;
    payload: Record<string, unknown> & { exp?: number; iat?: number; sub?: string };
    signature: string;
}

function base64UrlDecode(input: string): string {
    const padded = input.replace(/-/g, "+").replace(/_/g, "/");
    const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    if (typeof atob !== "undefined") {
        return atob(padded + padding);
    }
    return Buffer.from(padded + padding, "base64").toString("binary");
}

/**
 * Decode a JWT into header/payload/signature. Does **not** verify the
 * signature — for that, do it server-side or use a JOSE library on the
 * client.
 *
 * @throws If the token shape is invalid (missing parts, bad JSON).
 */
export function decodeJWT(token: string): DecodedJWT {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Invalid JWT: must contain three segments.");
    const [headerSeg, payloadSeg, signature] = parts as [string, string, string];
    try {
        return {
            header: JSON.parse(base64UrlDecode(headerSeg)),
            payload: JSON.parse(base64UrlDecode(payloadSeg)),
            signature,
        };
    } catch {
        throw new Error("Invalid JWT: header or payload is not valid JSON.");
    }
}

/**
 * Return true when the JWT's `exp` claim is in the past (or missing).
 *
 * @param token - JWT to inspect.
 * @param leewaySeconds - Treat tokens expiring within this window as expired.
 */
export function isJWTExpired(token: string, leewaySeconds = 0): boolean {
    try {
        const { payload } = decodeJWT(token);
        if (typeof payload.exp !== "number") return true;
        const nowSeconds = Math.floor(Date.now() / 1000);
        return payload.exp <= nowSeconds + leewaySeconds;
    } catch {
        return true;
    }
}
