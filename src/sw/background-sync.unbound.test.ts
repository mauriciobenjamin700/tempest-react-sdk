import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDevBuild } from "../utils/dev-mode";
import { provideBackgroundSyncCredentials } from "./background-sync";

describe("provideBackgroundSyncCredentials — unbound entries (#531)", () => {
    beforeEach(() => {
        vi.stubGlobal("navigator", { serviceWorker: new EventTarget() });
    });

    afterEach(() => {
        setDevBuild(undefined);
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("warns in development that, without getPrincipal, a queued mutation replays under whoever signs in next", () => {
        setDevBuild(true);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        const stop = provideBackgroundSyncCredentials(() => ({ Authorization: "Bearer A" }));
        stop();

        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]?.[0])).toContain("getPrincipal");
    });

    it("stays quiet when getPrincipal binds the entries", () => {
        setDevBuild(true);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        const stop = provideBackgroundSyncCredentials(() => null, {
            getPrincipal: () => "user-a",
        });
        stop();

        expect(warn).not.toHaveBeenCalled();
    });

    it("stays quiet in a production build", () => {
        setDevBuild(false);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        const stop = provideBackgroundSyncCredentials(() => null);
        stop();

        expect(warn).not.toHaveBeenCalled();
    });
});
