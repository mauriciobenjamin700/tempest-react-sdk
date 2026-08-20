import { afterEach, describe, expect, it, vi } from "vitest";

import { isDevBuild } from "./dev-mode";

describe("isDevBuild", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("is true under a development build", () => {
        vi.stubEnv("NODE_ENV", "development");
        expect(isDevBuild()).toBe(true);
    });

    it("is false under a production build", () => {
        vi.stubEnv("NODE_ENV", "production");
        expect(isDevBuild()).toBe(false);
    });

    it("is true when NODE_ENV says something else, such as test", () => {
        vi.stubEnv("NODE_ENV", "test");
        expect(isDevBuild()).toBe(true);
    });

    it("stays quiet instead of throwing where process does not exist", () => {
        vi.stubGlobal("process", undefined);
        expect(isDevBuild()).toBe(false);
    });

    it("stays quiet when process carries no env", () => {
        vi.stubGlobal("process", {});
        expect(isDevBuild()).toBe(false);
    });
});
