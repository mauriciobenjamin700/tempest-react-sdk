import * as reactRouter from "react-router";
import { describe, expect, it } from "vitest";

import * as router from "@/router";
import * as root from "@/index";

/**
 * Guard: every `react-router` export is either re-exported or left out on
 * purpose.
 *
 * The router module used to re-export a hand-picked list of 16 names, and a
 * consumer importing `matchPath` from `"tempest-react-sdk"` hit
 * `TS2305: Module has no exported member 'matchPath'` (#508). The list had been
 * written once and nothing told it that the peer kept growing. Measured on
 * 2026-10-25 against `react-router` 7.18.4 and 8.3.1: 129 runtime exports in
 * each, 128 shared — the one difference being an `UNSAFE_` name.
 *
 * So the rule is a closed set: a public `react-router` export that is neither
 * re-exported (with the identical value, under any name) nor listed in
 * {@link EXCLUDED} with its reason fails here, and the failure names it. A new
 * peer release then forces a decision instead of a silent gap.
 */
const EXCLUDED: Record<string, string> = {
    Links: "framework mode",
    Meta: "framework mode",
    Scripts: "framework mode",
    PrefetchPageLinks: "framework mode",
    href: "framework mode (typed against generated route types)",
    ServerRouter: "server rendering",
    StaticRouter: "server rendering",
    StaticRouterProvider: "server rendering",
    createStaticHandler: "server rendering",
    createStaticRouter: "server rendering",
    createRequestHandler: "server rendering",
    createCookie: "server rendering",
    createCookieSessionStorage: "server rendering",
    createMemorySessionStorage: "server rendering",
    createSession: "server rendering",
    createSessionStorage: "server rendering",
    isCookie: "server rendering",
    isSession: "server rendering",
    createContext: "route middleware; collides in meaning with React's createContext",
    RouterContextProvider: "route middleware",
    createRoutesStub: "test helper for framework-mode route modules",
};

/**
 * Whether a name is part of `react-router`'s public, stable surface.
 *
 * @param name - The export name.
 * @returns `false` for `UNSAFE_` and `unstable_` names, which the peer itself
 * marks as outside its contract.
 */
function isPublic(name: string): boolean {
    return !name.startsWith("UNSAFE_") && !name.startsWith("unstable_");
}

const routerValues: Set<unknown> = new Set(Object.values(router));
const peer: Record<string, unknown> = reactRouter as Record<string, unknown>;
const sdk: Record<string, unknown> = root as Record<string, unknown>;

describe("router re-exports", () => {
    it("re-exports or explicitly excludes every public react-router export", () => {
        const undecided: string[] = Object.keys(peer)
            .filter(isPublic)
            .filter((name) => !(name in EXCLUDED))
            .filter((name) => !routerValues.has(peer[name]));
        expect(undecided).toEqual([]);
    });

    it("does not exclude a name it also re-exports", () => {
        const both: string[] = Object.keys(EXCLUDED).filter((name) => routerValues.has(peer[name]));
        expect(both).toEqual([]);
    });

    it("lists only exclusions that still exist in the peer", () => {
        const stale: string[] = Object.keys(EXCLUDED).filter((name) => !(name in peer));
        expect(stale).toEqual([]);
    });

    it("reaches the package root with the peer's own values", () => {
        expect(sdk.matchPath).toBe(reactRouter.matchPath);
        expect(sdk.generatePath).toBe(reactRouter.generatePath);
        expect(sdk.createBrowserRouter).toBe(reactRouter.createBrowserRouter);
        expect(sdk.useOutletContext).toBe(reactRouter.useOutletContext);
    });

    it("re-exports the router Form as RouterForm, leaving the SDK Form intact", () => {
        expect(sdk.RouterForm).toBe(reactRouter.Form);
        expect(sdk.Form).not.toBe(reactRouter.Form);
    });

    it("matches a path through the root export", () => {
        const match = (sdk.matchPath as typeof reactRouter.matchPath)("/users/:id", "/users/42");
        expect(match?.params).toEqual({ id: "42" });
    });
});
