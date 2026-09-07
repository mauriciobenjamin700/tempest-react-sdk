import { afterEach, describe, expect, it, vi } from "vitest";

import { isDevBuild, setDevBuild } from "./dev-mode";

describe("isDevBuild", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        setDevBuild(undefined);
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

describe("setDevBuild", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        setDevBuild(undefined);
    });

    it("answers for a context no bundler transformed, where detection cannot", () => {
        vi.stubGlobal("process", undefined);
        expect(isDevBuild()).toBe(false);

        setDevBuild(true);
        expect(isDevBuild()).toBe(true);
    });

    it("wins over a NODE_ENV that disagrees, in both directions", () => {
        vi.stubEnv("NODE_ENV", "production");
        setDevBuild(true);
        expect(isDevBuild()).toBe(true);

        vi.stubEnv("NODE_ENV", "development");
        setDevBuild(false);
        expect(isDevBuild()).toBe(false);
    });

    it("goes back to detection when cleared", () => {
        vi.stubEnv("NODE_ENV", "production");
        setDevBuild(true);
        expect(isDevBuild()).toBe(true);

        setDevBuild(undefined);
        expect(isDevBuild()).toBe(false);
    });

    it("treats false as an answer, not as absence, so a production app is not overruled", () => {
        vi.stubEnv("NODE_ENV", "test");
        expect(isDevBuild()).toBe(true);

        setDevBuild(false);
        expect(isDevBuild()).toBe(false);
    });
});
