import { afterEach, describe, expect, it, vi } from "vitest";
import { isPushSupported, urlBase64ToUint8Array } from "./utils";

describe("urlBase64ToUint8Array", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("decodes a known VAPID-shaped key", () => {
        const result = urlBase64ToUint8Array("AAECAwQFBgcICQ");
        expect(result).toBeInstanceOf(Uint8Array);
        expect(Array.from(result)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it("handles missing padding", () => {
        expect(() => urlBase64ToUint8Array("AA")).not.toThrow();
    });

    it("decodes inside a worker scope, where there is no `window`", () => {
        // A `pushsubscriptionchange` handler re-subscribes from the service
        // worker and needs this conversion there. `window.atob` threw
        // `ReferenceError` in that scope while working fine on the page.
        vi.stubGlobal("window", undefined);
        expect(Array.from(urlBase64ToUint8Array("AAECAwQFBgcICQ"))).toEqual([
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
        ]);
    });
});

describe("isPushSupported", () => {
    it("returns a boolean", () => {
        expect(typeof isPushSupported()).toBe("boolean");
    });
});
