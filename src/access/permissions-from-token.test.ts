import { describe, expect, it } from "vitest";
import { permissionsFromToken } from "./permissions-from-token";

function encode(payload: object): string {
    const base = (str: string): string =>
        btoa(str).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    const header = base(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = base(JSON.stringify(payload));
    return `${header}.${body}.signature`;
}

describe("permissionsFromToken", () => {
    it("parses a `permissions` array claim", () => {
        const token = encode({ permissions: ["posts:create", "posts:read"] });
        expect(permissionsFromToken(token)).toEqual(["posts:create", "posts:read"]);
    });

    it("splits a space-delimited `scope` string", () => {
        const token = encode({ scope: "posts:read comments:read" });
        expect(permissionsFromToken(token)).toEqual(["posts:read", "comments:read"]);
    });

    it("reads a `scopes` array claim", () => {
        const token = encode({ scopes: ["a", "b"] });
        expect(permissionsFromToken(token)).toEqual(["a", "b"]);
    });

    it("honors a custom claim name", () => {
        const token = encode({ roles_perms: ["x:y"] });
        expect(permissionsFromToken(token, { claim: "roles_perms" })).toEqual(["x:y"]);
    });

    it("filters non-string entries from an array claim", () => {
        const token = encode({ permissions: ["ok", 1, null, "fine"] });
        expect(permissionsFromToken(token)).toEqual(["ok", "fine"]);
    });

    it("returns [] on a malformed token", () => {
        expect(permissionsFromToken("not-a-jwt")).toEqual([]);
    });

    it("returns [] when no recognizable claim exists", () => {
        const token = encode({ sub: "u1" });
        expect(permissionsFromToken(token)).toEqual([]);
    });
});
