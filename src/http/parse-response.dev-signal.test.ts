import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { setDevBuild } from "../utils/dev-mode";
import { parseResponse } from "./parse-response";

/**
 * The end of the chain the sibling suite has to mock away.
 *
 * `parse-response.test.ts` mocks `isDevBuild` so it can drive both branches;
 * nothing is mocked here, and `process` is stubbed away to reproduce the one
 * context that really has no substituted literal — code no bundler transformed,
 * such as a raw service-worker script or a plain `<script type="module">`.
 *
 * This suite was written believing that context included a Vite app. It does
 * not: measured on 2026-09-07, Vite 5 through 8 substitute
 * `process.env.NODE_ENV` in dev and in build, so `isDevBuild()` answers
 * correctly there on its own (the table lives in its doc). The assertions below
 * survive the correction unchanged, because what they actually pin is the
 * untransformed case: detection alone stays silent, `setDevBuild(true)` turns
 * the report on, and `setDevBuild(false)` keeps the payload out — the direction
 * a staging build that never sets `NODE_ENV=production` needs.
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
        setDevBuild(false);
        try {
            parseResponse(Schema, { id: "nope", token: "secret" }, "GET /users/me");
            expect.unreachable("parseResponse should have thrown");
        } catch (error) {
            expect((error as Error).message).not.toContain("secret");
        }
    });
});
