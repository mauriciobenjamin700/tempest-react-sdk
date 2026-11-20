import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempestAuth } from "../auth/create-tempest-auth";
import { setDevBuild } from "../utils/dev-mode";
import { createResumableUpload } from "./resumable-upload";
import { uploadWithProgress } from "./upload-with-progress";

/**
 * An `XMLHttpRequest` that never answers, so `uploadWithProgress` can be
 * called for what it does synchronously without a server.
 */
class SilentXhr {
    upload = { onprogress: null };
    withCredentials = false;
    open(): void {}
    setRequestHeader(): void {}
    send(): void {}
    abort(): void {}
}

const file = new File([new Uint8Array(4)], "a.bin", { lastModified: 1 });

/**
 * Security audit run-16 §6 (#657): an upload whose `getToken` is a wrapper —
 * not the getter `createTempestAuth` returned — and that passes neither
 * `sessionKey` (`uploadWithProgress`) nor `getPrincipal`
 * (`createResumableUpload`) is not bound to a session: an answer that lands
 * after an account switch reaches the next account, and a resumable run keeps
 * going under the next account's token. The docs said so; nothing told the
 * developer who wrote `() => auth.getToken()`. A development build now warns
 * once per getter, the same way `provideBackgroundSyncCredentials()` warns
 * without `getPrincipal`.
 */
describe("uploads without a session binding warn in development (#657)", () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.stubGlobal("XMLHttpRequest", SilentXhr);
        warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        setDevBuild(true);
    });

    afterEach(() => {
        setDevBuild(undefined);
        warn.mockRestore();
        vi.unstubAllGlobals();
    });

    function warnings(): string[] {
        return warn.mock.calls.map((call: unknown[]) => String(call[0]));
    }

    it("warns once per getter when uploadWithProgress gets a wrapper and no sessionKey", () => {
        const getToken = (): string => "tok";

        void uploadWithProgress({ url: "/api/files", body: file, getToken });
        void uploadWithProgress({ url: "/api/files", body: file, getToken });

        expect(warnings().filter((text) => text.includes("uploadWithProgress"))).toHaveLength(1);
        expect(warnings()[0]).toContain("sessionKey");
    });

    it("warns once per getter when createResumableUpload gets a wrapper and no getPrincipal", () => {
        const getToken = (): string => "tok";

        createResumableUpload({ endpoint: "/api/uploads", file, getToken });
        createResumableUpload({ endpoint: "/api/uploads", file, getToken });

        expect(warnings().filter((text) => text.includes("createResumableUpload"))).toHaveLength(1);
        expect(warnings()[0]).toContain("getPrincipal");
    });

    it("stays silent with the binding, with the preset's own getter, or without a token", () => {
        const auth = createTempestAuth({
            baseURL: "https://api.example.test",
            fetcher: (async () => new Response(null, { status: 204 })) as typeof fetch,
        });

        void uploadWithProgress({
            url: "/api/files",
            body: file,
            getToken: () => "tok",
            sessionKey: () => "user-1",
        });
        void uploadWithProgress({ url: "/api/files", body: file, getToken: auth.getToken });
        void uploadWithProgress({ url: "/api/files", body: file });
        createResumableUpload({
            endpoint: "/api/uploads",
            file,
            getToken: () => "tok",
            getPrincipal: () => "user-1",
        });
        createResumableUpload({ endpoint: "/api/uploads", file, getToken: auth.getToken });
        createResumableUpload({ endpoint: "/api/uploads", file });
        auth.dispose();

        expect(warnings()).toEqual([]);
    });

    it("stays silent in a production build", () => {
        setDevBuild(false);

        void uploadWithProgress({ url: "/api/files", body: file, getToken: () => "tok" });
        createResumableUpload({ endpoint: "/api/uploads", file, getToken: () => "tok" });

        expect(warnings()).toEqual([]);
    });
});
