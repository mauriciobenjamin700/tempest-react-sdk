import { describe, expect, it } from "vitest";
import { isPushSupported, urlBase64ToUint8Array } from "./utils";

describe("urlBase64ToUint8Array", () => {
    it("decodes a known VAPID-shaped key", () => {
        const result = urlBase64ToUint8Array("AAECAwQFBgcICQ");
        expect(result).toBeInstanceOf(Uint8Array);
        expect(Array.from(result)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it("handles missing padding", () => {
        expect(() => urlBase64ToUint8Array("AA")).not.toThrow();
    });
});

describe("isPushSupported", () => {
    it("returns a boolean", () => {
        expect(typeof isPushSupported()).toBe("boolean");
    });
});
