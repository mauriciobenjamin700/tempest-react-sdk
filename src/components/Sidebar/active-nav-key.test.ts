import { describe, expect, it } from "vitest";
import { activeNavIndex, activeNavKey } from "./active-nav-key";

const panel = ["/dashboard", "/dashboard/tips"];

describe("activeNavKey — the acceptance criteria of #357", () => {
    it("lets the longest covering key win over its ancestor", () => {
        expect(activeNavKey("/dashboard/tips/42", panel)).toBe("/dashboard/tips");
    });

    it("does not match a key that only shares a string prefix", () => {
        expect(activeNavKey("/dashboard/tip", panel)).toBe("/dashboard");
    });

    it("returns an empty string, without throwing, when nothing covers the route", () => {
        expect(activeNavKey("/elsewhere", panel)).toBe("");
        expect(activeNavKey("/elsewhere", [])).toBe("");
        expect(activeNavKey("", panel)).toBe("");
    });

    it("ignores a trailing slash on the route", () => {
        expect(activeNavKey("/dashboard/tips/", panel)).toBe("/dashboard/tips");
        expect(activeNavKey("/dashboard//", panel)).toBe("/dashboard");
    });

    it("ignores a trailing slash on the key, and returns the key as given", () => {
        expect(activeNavKey("/dashboard/tips/42", ["/dashboard/", "/dashboard/tips/"])).toBe(
            "/dashboard/tips/",
        );
    });
});

describe("activeNavKey — edges the relove_dashboard helper missed", () => {
    it("keeps sibling prefixes apart on a segment boundary", () => {
        const keys = ["/users", "/users-admin"];
        expect(activeNavKey("/users-admin/3", keys)).toBe("/users-admin");
        expect(activeNavKey("/users/3", keys)).toBe("/users");
    });

    it("does not depend on the order of the keys", () => {
        expect(activeNavKey("/dashboard/tips/42", [...panel].reverse())).toBe("/dashboard/tips");
    });

    it("lights the root only on the root, as NavLink does", () => {
        const keys = ["/", "/users"];
        expect(activeNavKey("/", keys)).toBe("/");
        expect(activeNavKey("/settings", keys)).toBe("");
        expect(activeNavKey("/users/3", keys)).toBe("/users");
    });

    it("ignores the query string and the hash on both sides", () => {
        expect(activeNavKey("/users?tab=2", ["/", "/users"])).toBe("/users");
        expect(activeNavKey("/users#top", ["/", "/users"])).toBe("/users");
        expect(activeNavKey("/?q=1", ["/", "/users"])).toBe("/");
        expect(activeNavKey("/users/3", ["/users?tab=all"])).toBe("/users?tab=all");
    });

    it("compares case-sensitively, as URL paths are", () => {
        expect(activeNavKey("/Users", ["/users"])).toBe("");
    });

    it("never matches an empty or query-only key", () => {
        expect(activeNavKey("/users", ["", "?x", "#y"])).toBe("");
    });
});

describe("activeNavIndex", () => {
    it("keeps the first of two keys that normalize to the same path", () => {
        expect(activeNavIndex("/users/1", ["/users", "/users/"])).toBe(0);
    });

    it("returns -1 when nothing covers the route", () => {
        expect(activeNavIndex("/x", ["/y"])).toBe(-1);
    });
});

describe("activeNavKey — the 11-case table measured for #357", () => {
    const table: readonly [string, readonly string[], string][] = [
        ["/dashboard/tips/42", ["/dashboard", "/dashboard/tips"], "/dashboard/tips"],
        ["/dashboard/tip", ["/dashboard", "/dashboard/tips"], "/dashboard"],
        ["/users-admin", ["/users", "/users-admin"], "/users-admin"],
        ["/users-admin/3", ["/users", "/users-admin"], "/users-admin"],
        ["/nothing", ["/a", "/b"], ""],
        ["/dashboard/tips/", ["/dashboard", "/dashboard/tips"], "/dashboard/tips"],
        ["/dashboard/tips", ["/dashboard", "/dashboard/tips/"], "/dashboard/tips/"],
        ["/settings", ["/", "/users"], ""],
        ["/", ["/", "/users"], "/"],
        ["/users?tab=2", ["/", "/users"], "/users"],
        ["/users#top", ["/", "/users"], "/users"],
    ];

    const naive = (pathname: string, keys: readonly string[]): string =>
        keys.find((key) => pathname.startsWith(key)) ?? "";

    const reloveDashboard = (pathname: string, keys: readonly string[]): string =>
        keys
            .filter((url) => pathname === url || pathname.startsWith(`${url}/`))
            .reduce((longest, url) => (url.length > longest.length ? url : longest), "");

    const score = (resolve: (pathname: string, keys: readonly string[]) => string): number =>
        table.filter(([pathname, keys, expected]) => resolve(pathname, keys) === expected).length;

    it.each(table)("resolves %s against %j to %j", (pathname, keys, expected) => {
        expect(activeNavKey(pathname, keys)).toBe(expected);
    });

    it("scores 11/11 where find + startsWith scores 3 and the relove_dashboard helper 8", () => {
        expect(score(activeNavKey)).toBe(11);
        expect(score(naive)).toBe(3);
        expect(score(reloveDashboard)).toBe(8);
    });
});
