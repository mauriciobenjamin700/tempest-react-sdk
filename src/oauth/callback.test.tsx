import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiClient } from "@/http/api-client";

import { OAuthCallbackError, exchangeOAuthCallback, readOAuthCallbackParams } from "./callback";
import { useOAuthCallback } from "./use-oauth-callback";

interface Sent {
    method: string;
    url: string;
    credentials: RequestCredentials | undefined;
    auth: string | null;
}

interface LoginResponse {
    user_id: string;
    access_token: string;
}

function backend(status = 200): {
    api: ReturnType<typeof createApiClient>;
    sent: Sent[];
    onUnauthorized: ReturnType<typeof vi.fn>;
} {
    const sent: Sent[] = [];
    const onUnauthorized = vi.fn();
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
        sent.push({
            method: init?.method ?? "GET",
            url: String(input),
            credentials: init?.credentials,
            auth: new Headers(init?.headers).get("Authorization"),
        });
        const body =
            status === 200
                ? { user_id: "u1", access_token: "jwt" }
                : { code: "OAUTH_STATE_MISMATCH" };
        return new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
        });
    }) as typeof fetch;
    const api = createApiClient({
        baseURL: "https://api.example.test/api",
        getToken: () => "STALE",
        onUnauthorized,
        fetcher,
    });
    return { api, sent, onUnauthorized };
}

afterEach(() => {
    window.history.replaceState(null, "", "/");
});

describe("readOAuthCallbackParams — the state cannot be dropped (#449)", () => {
    it("returns code and state together", () => {
        expect(readOAuthCallbackParams("?code=4%2F0Ab&state=s1&scope=email")).toEqual({
            code: "4/0Ab",
            state: "s1",
        });
    });

    it("refuses a callback without state, the shape a forged login CSRF link takes", () => {
        const read = (): unknown => readOAuthCallbackParams("?code=ATTACKER_CODE");

        expect(read).toThrow(OAuthCallbackError);
        expect(read).toThrow(expect.objectContaining({ reason: "missing_state" }));
    });

    it("refuses an empty state as if it were missing", () => {
        expect(() => readOAuthCallbackParams("?code=c&state=")).toThrow(
            expect.objectContaining({ reason: "missing_state" }),
        );
    });

    it("refuses a callback without code", () => {
        expect(() => readOAuthCallbackParams("?state=s1")).toThrow(
            expect.objectContaining({ reason: "missing_code" }),
        );
    });

    it("surfaces the provider error before looking at code or state", () => {
        let caught: unknown;
        try {
            readOAuthCallbackParams("?error=access_denied&state=s1");
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(OAuthCallbackError);
        expect(caught).toMatchObject({
            reason: "provider_error",
            providerError: "access_denied",
            name: "OAuthCallbackError",
        });
        expect((caught as Error).message).toContain("access_denied");
    });

    it("accepts URLSearchParams and defaults to window.location.search", () => {
        expect(readOAuthCallbackParams(new URLSearchParams({ code: "c", state: "s" }))).toEqual({
            code: "c",
            state: "s",
        });

        window.history.replaceState(null, "", "/callback?code=c2&state=s2");
        expect(readOAuthCallbackParams()).toEqual({ code: "c2", state: "s2" });
    });

    it("names the missing param in the message", () => {
        expect(new OAuthCallbackError("missing_code").message).toContain('"code"');
        expect(new OAuthCallbackError("provider_error").message).toContain("unknown");
    });
});

describe("exchangeOAuthCallback — forwards the state to the backend that checks it", () => {
    it("sends code and state to the tempest-fastapi-sdk callback route with the state cookie", async () => {
        const { api, sent } = backend();

        const result = await exchangeOAuthCallback<LoginResponse>(api, "google", {
            search: "?code=4%2F0Ab&state=s%2B1",
        });

        expect(result).toEqual({ user_id: "u1", access_token: "jwt" });
        expect(sent).toEqual([
            {
                method: "GET",
                url: "https://api.example.test/api/auth/oauth/google/callback?code=4%2F0Ab&state=s%2B1",
                credentials: "include",
                auth: null,
            },
        ]);
    });

    it("honors a custom router prefix and encodes the provider key", async () => {
        const { api, sent } = backend();

        await exchangeOAuthCallback(api, "my/idp", {
            prefix: "/v1/auth/",
            search: "?code=c&state=s",
        });

        expect(sent[0]?.url).toBe(
            "https://api.example.test/api/v1/auth/oauth/my%2Fidp/callback?code=c&state=s",
        );
    });

    it("sends nothing when the state is missing", async () => {
        const { api, sent } = backend();

        await expect(
            exchangeOAuthCallback(api, "google", { search: "?code=ATTACKER_CODE" }),
        ).rejects.toMatchObject({ reason: "missing_state" });
        expect(sent).toEqual([]);
    });

    it("lets the backend's 401 for a forged state surface once, without refresh, retry or logout", async () => {
        const { api, sent, onUnauthorized } = backend(401);

        await expect(
            exchangeOAuthCallback(api, "google", { search: "?code=c&state=forged" }),
        ).rejects.toMatchObject({ status: 401 });
        expect(sent).toHaveLength(1);
        expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it("plugs into useOAuthCallback, which reports the refusal through onError", async () => {
        const { api, sent } = backend();
        window.history.replaceState(null, "", "/callback?code=ATTACKER_CODE");
        const onError = vi.fn();
        const onSuccess = vi.fn();

        const { result } = renderHook(() =>
            useOAuthCallback<LoginResponse>({
                exchange: () => exchangeOAuthCallback<LoginResponse>(api, "google"),
                onSuccess,
                onError,
            }),
        );

        await waitFor(() => expect(result.current.status).toBe("error"));
        expect(onError).toHaveBeenCalledWith(expect.any(OAuthCallbackError));
        expect(onSuccess).not.toHaveBeenCalled();
        expect(sent).toEqual([]);
    });
});
