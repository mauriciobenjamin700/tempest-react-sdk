import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempestAuth, type TempestAuth } from "../auth/create-tempest-auth";
import { SessionSupersededError, TempestApiError } from "./errors";
import { uploadWithProgress } from "./upload-with-progress";

type Auth = TempestAuth<{ id: string }, { email: string; password: string }>;

/** What a held upload answers once released. */
interface HeldAnswer {
    status: number;
    body: unknown;
}

/** The upload request the double saw, and the function that lets its answer land. */
interface HeldUpload {
    authorization: () => string | undefined;
    release: (answer?: HeldAnswer) => void;
}

const OK: HeldAnswer = { status: 200, body: { url: "/files/of-A" } };
const CONFLICT: HeldAnswer = {
    status: 409,
    body: { detail: "Arquivo de A já existe.", code: "A" },
};

/**
 * Stub `XMLHttpRequest` with a double whose `load` waits for `release()`, so a
 * test can change the session while the upload is on the wire.
 *
 * @returns The held upload.
 */
function holdXhr(): HeldUpload {
    let headers: Record<string, string> = {};
    let onReady: (answer: HeldAnswer) => void = () => undefined;
    class HeldXhr {
        upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onabort: (() => void) | null = null;
        status = 0;
        responseText = "";
        responseURL = "";
        withCredentials = false;
        open(): void {
            headers = {};
        }
        setRequestHeader(name: string, value: string): void {
            headers[name] = value;
        }
        getResponseHeader(name: string): string | null {
            return name.toLowerCase() === "content-type" ? "application/json" : null;
        }
        abort(): void {
            this.onabort?.();
        }
        send(): void {
            onReady = (answer) => {
                this.status = answer.status;
                this.responseText = JSON.stringify(answer.body);
                this.onload?.();
            };
        }
    }
    vi.stubGlobal("XMLHttpRequest", HeldXhr);
    return {
        authorization: () => headers.Authorization,
        release: (answer = OK) => onReady(answer),
    };
}

/**
 * Stub the global `fetch` — the `redirect: "error"` transport — with one whose
 * response waits for `release()`.
 *
 * @returns The held upload.
 */
function holdFetch(): HeldUpload {
    let headers: Record<string, string> = {};
    let onReady: (answer: HeldAnswer) => void = () => undefined;
    vi.stubGlobal(
        "fetch",
        vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            headers = (init?.headers ?? {}) as Record<string, string>;
            const answer = await new Promise<HeldAnswer>((resolve) => {
                onReady = resolve;
            });
            return new Response(JSON.stringify(answer.body), {
                status: answer.status,
                headers: { "content-type": "application/json" },
            });
        }),
    );
    return {
        authorization: () => headers.Authorization,
        release: (answer = OK) => onReady(answer),
    };
}

/**
 * An auth backend for two accounts, A and B, whose refresh rotates A's token.
 *
 * @returns A fetcher for `createTempestAuth`.
 */
function authBackend(): typeof fetch {
    let rotations = 0;
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        const body = init?.body ? (JSON.parse(String(init.body)) as { email?: string }) : {};
        if (path === "/api/auth/login") {
            const who = body.email === "b@x.test" ? "B" : "A";
            return Response.json({ access_token: `${who}-tok`, refresh_token: `${who}-ref` });
        }
        if (path === "/api/auth/refresh") {
            rotations += 1;
            return Response.json({ access_token: `A-tok-r${rotations}`, refresh_token: "A-ref" });
        }
        return new Response(null, { status: 204 });
    }) as typeof fetch;
}

/**
 * Wait until the upload has gone out — the XHR double is created synchronously,
 * the `fetch` stub after a microtask.
 */
async function sent(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe.each([
    { transport: "XMLHttpRequest", hold: holdXhr, redirect: "follow" as const },
    { transport: "fetch (redirect: error)", hold: holdFetch, redirect: "error" as const },
])("uploadWithProgress over $transport — the answer of an ended session (#642)", (variant) => {
    let auth: Auth;

    beforeEach(async () => {
        localStorage.clear();
        auth = createTempestAuth({ baseURL: "https://api.example.com", fetcher: authBackend() });
        await auth.login({ email: "a@x.test", password: "x" });
    });

    afterEach(() => {
        auth.dispose();
        vi.unstubAllGlobals();
    });

    function upload(options: { getToken?: () => string | null; sessionKey?: () => string | null }) {
        return uploadWithProgress<{ url: string }>({
            url: "/api/upload",
            body: new Blob(["x"]),
            redirect: variant.redirect,
            ...options,
        });
    }

    it("rejects A's success that lands after logout() + login(B) with SessionSupersededError", async () => {
        const held = variant.hold();
        const pending = upload({ getToken: auth.getToken });
        await sent();
        expect(held.authorization()).toBe("Bearer A-tok");

        await auth.logout();
        await auth.login({ email: "b@x.test", password: "x" });
        held.release(OK);

        await expect(pending).rejects.toBeInstanceOf(SessionSupersededError);
    });

    it("rejects A's error envelope that lands after the switch, instead of B's onError seeing it", async () => {
        const held = variant.hold();
        const pending = upload({ getToken: auth.getToken });
        await sent();

        await auth.login({ email: "b@x.test", password: "x" });
        held.release(CONFLICT);

        await expect(pending).rejects.toBeInstanceOf(SessionSupersededError);
    });

    it("rejects A's answer that lands after a bare logout()", async () => {
        const held = variant.hold();
        const pending = upload({ getToken: auth.getToken });
        await sent();

        await auth.logout();
        held.release(OK);

        await expect(pending).rejects.toBeInstanceOf(SessionSupersededError);
    });

    it("binds a wrapping getter through sessionKey: auth.sessionKey", async () => {
        const held = variant.hold();
        const pending = upload({ getToken: () => auth.getToken(), sessionKey: auth.sessionKey });
        await sent();

        await auth.login({ email: "b@x.test", password: "x" });
        held.release(OK);

        await expect(pending).rejects.toBeInstanceOf(SessionSupersededError);
    });

    it("still resolves across a token rotation of the same session", async () => {
        const held = variant.hold();
        const pending = upload({ getToken: auth.getToken });
        await sent();

        await auth.refresh();
        held.release(OK);

        await expect(pending).resolves.toEqual({ url: "/files/of-A" });
    });

    it("still rejects with the API error when the session did not change", async () => {
        const held = variant.hold();
        const pending = upload({ getToken: auth.getToken });
        await sent();

        held.release(CONFLICT);

        await expect(pending).rejects.toBeInstanceOf(TempestApiError);
    });

    it("still resolves an upload sent without a token, whatever happened to the session", async () => {
        await auth.logout();
        const held = variant.hold();
        const pending = upload({ getToken: auth.getToken });
        await sent();
        expect(held.authorization()).toBeUndefined();

        await auth.login({ email: "b@x.test", password: "x" });
        held.release(OK);

        await expect(pending).resolves.toEqual({ url: "/files/of-A" });
    });

    it("binds a plain getter to any sessionKey the app passes", async () => {
        const held = variant.hold();
        let user = "user-A";
        const pending = upload({ getToken: () => "opaque", sessionKey: () => user });
        await sent();

        user = "user-B";
        held.release(OK);

        await expect(pending).rejects.toBeInstanceOf(SessionSupersededError);
    });
});
