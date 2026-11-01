import { beforeEach, describe, expect, it, vi } from "vitest";

import { isDevBuild } from "../utils/dev-mode";
import { createTempestAuth } from "./create-tempest-auth";

vi.mock("../utils/dev-mode", () => ({ isDevBuild: vi.fn(() => true) }));

/**
 * A backend whose login succeeds and whose logout route fails on the network.
 *
 * @returns The fetcher.
 */
function failingLogout(): typeof fetch {
    return (async (input: RequestInfo | URL) => {
        if (String(input).endsWith("/api/auth/logout")) throw new TypeError("Failed to fetch");
        return new Response(JSON.stringify({ access_token: "A-tok-1", refresh_token: "A-ref-1" }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    }) as typeof fetch;
}

describe("createTempestAuth — a failed revocation is not silent", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it("warns in a dev build when the revocation fails", async () => {
        vi.mocked(isDevBuild).mockReturnValue(true);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const auth = createTempestAuth({
            baseURL: "https://api.example.test",
            logoutPath: "/api/auth/logout",
            fetcher: failingLogout(),
        });
        await auth.login({ email: "a@x.test", password: "x" });

        await auth.logout();

        expect(warn).toHaveBeenCalledOnce();
        expect(String(warn.mock.calls[0]?.[0])).toContain("logoutPath");
    });

    it("warns once per store in a dev build when cookie mode has no logoutPath", () => {
        vi.mocked(isDevBuild).mockReturnValue(true);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        for (let i = 0; i < 2; i += 1) {
            createTempestAuth({
                baseURL: "https://api.example.test",
                storeName: "warn-cookie-dev",
                withCredentials: true,
                fetcher: failingLogout(),
            }).dispose();
        }

        expect(warn).toHaveBeenCalledOnce();
        expect(String(warn.mock.calls[0]?.[0])).toContain("logoutPath");
    });

    it("does not warn about cookie mode with a logoutPath, in body mode, or in production", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        vi.mocked(isDevBuild).mockReturnValue(true);
        createTempestAuth({
            baseURL: "https://api.example.test",
            storeName: "warn-cookie-with-logout",
            withCredentials: true,
            logoutPath: "/api/auth/logout",
        }).dispose();
        createTempestAuth({
            baseURL: "https://api.example.test",
            storeName: "warn-body-mode",
        }).dispose();
        vi.mocked(isDevBuild).mockReturnValue(false);
        createTempestAuth({
            baseURL: "https://api.example.test",
            storeName: "warn-cookie-prod",
            withCredentials: true,
        }).dispose();

        expect(warn).not.toHaveBeenCalled();
    });

    it("stays quiet in a production build", async () => {
        vi.mocked(isDevBuild).mockReturnValue(false);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const auth = createTempestAuth({
            baseURL: "https://api.example.test",
            logoutPath: "/api/auth/logout",
            fetcher: failingLogout(),
        });
        await auth.login({ email: "a@x.test", password: "x" });

        await auth.logout();

        expect(warn).not.toHaveBeenCalled();
    });
});
