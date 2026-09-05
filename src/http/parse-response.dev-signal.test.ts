import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { setDevBuild } from "../utils/dev-mode";
import { parseResponse } from "./parse-response";

/**
 * The end of the chain the sibling suite has to mock away.
 *
 * `parse-response.test.ts` mocks `isDevBuild` so it can drive both branches, and
 * that mock is exactly what hid this defect: the branch was reachable in the
 * test and unreachable in a Vite app, where `process` does not exist so the
 * automatic read throws and answers `false` — `vite dev` included. The drift
 * report was written for that build and never once ran in it.
 *
 * Nothing is mocked here. `process` is stubbed away to reproduce a browser
 * bundle, and the assertions are that detection alone stays silent and that
 * `setDevBuild` is what turns the report on.
 */
const Schema = z.object({ id: z.number() });

describe("parseResponse under a bundle with no process", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        setDevBuild(undefined);
    });

    it("keeps the generic sentence when nothing says which build this is", () => {
        vi.stubGlobal("process", undefined);
        try {
            parseResponse(Schema, { id: "nope" }, "GET /users/me");
            expect.unreachable("parseResponse should have thrown");
        } catch (error) {
            const message = (error as Error).message;
            expect(message).not.toContain("Contract drift");
            expect(message).not.toContain("nope");
        }
    });

    it("shows the drift report once the app says it is a dev build", () => {
        vi.stubGlobal("process", undefined);
        setDevBuild(true);
        try {
            parseResponse(Schema, { id: "nope" }, "GET /users/me");
            expect.unreachable("parseResponse should have thrown");
        } catch (error) {
            const message = (error as Error).message;
            expect(message).toContain("[parseResponse] Contract drift on GET /users/me");
            expect(message).toContain("nope");
        }
    });

    it("keeps the raw payload out of the message when the app says production", () => {
        // The direction that matters for a leak: an app calling
        // `setDevBuild(import.meta.env.DEV)` in a production build passes
        // `false`, and the payload must not reach the error string.
        setDevBuild(false);
        try {
            parseResponse(Schema, { id: "nope", token: "secret" }, "GET /users/me");
            expect.unreachable("parseResponse should have thrown");
        } catch (error) {
            expect((error as Error).message).not.toContain("secret");
        }
    });
});
