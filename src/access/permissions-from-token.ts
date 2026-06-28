import { decodeJWT } from "@/auth/jwt";

export interface PermissionsFromTokenOptions {
    /** JWT claim to read permissions from. Default: `"permissions"`. */
    claim?: string;
}

function toPermissionList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === "string");
    }
    if (typeof value === "string") {
        // Space-delimited scope strings (OAuth convention).
        return value.split(/\s+/).filter(Boolean);
    }
    return [];
}

/**
 * Extract a permission list from a JWT.
 *
 * Reads the configured claim (default `"permissions"`); if absent, falls back to
 * the OAuth `"scopes"`/`"scope"` claims. Array claims are used as-is; string
 * claims are split on whitespace. Returns `[]` on any decode failure or when no
 * recognizable claim is present.
 *
 * @param token - The JWT to inspect (signature is **not** verified).
 * @param options - Optional claim override.
 * @returns The list of permission strings, or `[]` on failure.
 */
export function permissionsFromToken(
    token: string,
    options?: PermissionsFromTokenOptions,
): string[] {
    try {
        const { payload } = decodeJWT(token);
        const claim = options?.claim ?? "permissions";
        const primary = toPermissionList(payload[claim]);
        if (primary.length > 0) return primary;

        if (options?.claim === undefined) {
            const scopes = toPermissionList(payload["scopes"]);
            if (scopes.length > 0) return scopes;
            return toPermissionList(payload["scope"]);
        }
        return primary;
    } catch {
        return [];
    }
}
