import { describe, expect, it } from "vitest";
import { decodeJWT, isJWTExpired } from "./jwt";

function encode(payload: object): string {
    const base = (str: string): string =>
        btoa(str).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    const header = base(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = base(JSON.stringify(payload));
    return `${header}.${body}.signature`;
}

describe("decodeJWT", () => {
    it("decodes header + payload", () => {
        const token = encode({ sub: "u1", exp: 9999999999 });
        const decoded = decodeJWT(token);
        expect(decoded.payload.sub).toBe("u1");
        expect(decoded.signature).toBe("signature");
    });

    it("throws on bad shape", () => {
        expect(() => decodeJWT("nope")).toThrow();
    });
});

describe("isJWTExpired", () => {
    it("returns true when exp is in the past", () => {
        const token = encode({ exp: 1 });
        expect(isJWTExpired(token)).toBe(true);
    });

    it("returns false when exp is far in the future", () => {
        const token = encode({ exp: 9999999999 });
        expect(isJWTExpired(token)).toBe(false);
    });

    it("respects leeway", () => {
        const exp = Math.floor(Date.now() / 1000) + 10;
        const token = encode({ exp });
        expect(isJWTExpired(token, 0)).toBe(false);
        expect(isJWTExpired(token, 30)).toBe(true);
    });
});
