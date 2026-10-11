import type { ApiClient } from "@/http/types";

/** Why {@link readOAuthCallbackParams} refused a callback URL. */
export type OAuthCallbackErrorReason = "provider_error" | "missing_state" | "missing_code";

/**
 * A provider redirect that cannot be exchanged for a session.
 *
 * Thrown before any request leaves the browser, so a forged or truncated
 * callback never reaches the backend's exchange route.
 */
export class OAuthCallbackError extends Error {
    /** Which part of the callback was wrong. */
    readonly reason: OAuthCallbackErrorReason;
    /** The provider's `error` param (e.g. `"access_denied"`), when `reason` is `"provider_error"`. */
    readonly providerError?: string;

    /**
     * @param reason - Which part of the callback was wrong.
     * @param providerError - The provider's `error` param, when it sent one.
     */
    constructor(reason: OAuthCallbackErrorReason, providerError?: string) {
        super(
            reason === "provider_error"
                ? `OAuth provider returned an error: ${providerError ?? "unknown"}`
                : `OAuth callback is missing the "${reason === "missing_state" ? "state" : "code"}" param`,
        );
        this.name = "OAuthCallbackError";
        this.reason = reason;
        this.providerError = providerError;
    }
}

/** The two values a provider appends to the redirect URI on success. */
export interface OAuthCallbackParams {
    /** Single-use authorization code. */
    code: string;
    /**
     * The CSRF `state` the backend minted when the flow started. Forwarded
     * verbatim: only the backend holds the value it must match.
     */
    state: string;
}

/**
 * Read `code` and `state` from a provider's redirect, refusing an incomplete one.
 *
 * The `state` is what ties the callback to the browser that started the flow.
 * Without it, an attacker sends the victim to `/callback?code=<attacker's code>`
 * and the victim ends up signed in to the attacker's account — a login CSRF.
 * The old recipe read only `code` and posted `{ code }`, so the `state` never
 * reached a backend that could compare it (#449). This reader makes dropping it
 * impossible: it returns both or throws.
 *
 * It does **not** compare the state. In the `tempest-fastapi-sdk` flow the
 * backend mints it in `GET {prefix}/oauth/{provider}/login`, keeps it in an
 * `HttpOnly` cookie bound to the provider, and checks it with
 * `hmac.compare_digest` in the callback (single use, `AUTH_OAUTH_STATE_TTL_SECONDS`
 * expiry). The browser cannot read that cookie, so any check here would be
 * theatre; forwarding the value is the browser's whole job.
 *
 * @param search - The query string or params to read. Default: `window.location.search`.
 * @returns The `code` and `state`.
 * @throws {OAuthCallbackError} `"provider_error"` when the provider sent `error`
 *   (the user declined, for instance), `"missing_state"` without `state`,
 *   `"missing_code"` without `code`.
 *
 * @example
 * const { code, state } = readOAuthCallbackParams("?code=4%2F0A&state=xyz");
 */
export function readOAuthCallbackParams(
    search: string | URLSearchParams = globalThis.location?.search ?? "",
): OAuthCallbackParams {
    const params = typeof search === "string" ? new URLSearchParams(search) : search;
    const error = params.get("error");
    if (error) throw new OAuthCallbackError("provider_error", error);
    const state = params.get("state");
    if (!state) throw new OAuthCallbackError("missing_state");
    const code = params.get("code");
    if (!code) throw new OAuthCallbackError("missing_code");
    return { code, state };
}

/** Options for {@link exchangeOAuthCallback}. */
export interface ExchangeOAuthCallbackOptions {
    /**
     * Path the backend's auth router is mounted at — the `prefix` given to
     * `make_auth_router`. Default: `"/auth"`.
     */
    prefix?: string;
    /** Where to read the provider's redirect from. Default: `window.location.search`. */
    search?: string | URLSearchParams;
    /** Abort the exchange. */
    signal?: AbortSignal;
}

/**
 * Finish a `tempest-fastapi-sdk` social login from the SPA's callback route.
 *
 * Reads the redirect with {@link readOAuthCallbackParams} and forwards `code`
 * **and** `state` to `GET {prefix}/oauth/{provider}/callback`, where the backend
 * compares the state against its `HttpOnly` cookie, redeems the code and
 * answers with the same JWT pair `POST {prefix}/login` returns.
 *
 * The request goes with `credentials: "include"` because the state cookie is
 * the other half of the comparison; with `skipAuth`, since there is no session
 * yet and a `401` here means a forged or expired callback, not an expired token
 * to refresh; and with `retry: false`, because the backend clears the state
 * cookie on the first attempt and a code redeems once.
 *
 * Pass it as the `exchange` of {@link useOAuthCallback}, which runs it once even
 * under StrictMode.
 *
 * @param api - The client from `createApiClient` (or `createTempestAuth().api`).
 * @param provider - The provider key registered on the backend (e.g. `"google"`).
 * @param options - Router prefix, the query string to read, abort signal.
 * @returns The backend's login response.
 * @throws {OAuthCallbackError} Before any request, when the redirect carries
 *   `error` or lacks `state` or `code`.
 *
 * @example
 * const { loading, error } = useOAuthCallback<LoginResponse>({
 *     exchange: () => exchangeOAuthCallback<LoginResponse>(api, "google"),
 *     onSuccess: () => navigate("/", { replace: true }),
 * });
 */
export async function exchangeOAuthCallback<T>(
    api: ApiClient,
    provider: string,
    options: ExchangeOAuthCallbackOptions = {},
): Promise<T> {
    const { prefix = "/auth", search, signal } = options;
    const { code, state } = readOAuthCallbackParams(search);
    const base = prefix.replace(/\/+$/, "");
    return api.get<T>(`${base}/oauth/${encodeURIComponent(provider)}/callback`, {
        params: { code, state },
        credentials: "include",
        skipAuth: true,
        retry: false,
        signal,
    });
}
