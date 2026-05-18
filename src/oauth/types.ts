export interface OAuthCredential {
    /** Provider-issued ID token (JWT). */
    idToken: string;
    /** Provider name (e.g. `"google"`, `"facebook"`). */
    provider: string;
    /** Raw response from the provider's SDK — opaque, for app-level inspection. */
    raw?: unknown;
}

export interface OAuthError {
    /** Provider name. */
    provider: string;
    /** Provider-specific error code, when available. */
    code?: string;
    /** Human-readable message. */
    message: string;
    /** Raw underlying error object. */
    raw?: unknown;
}
