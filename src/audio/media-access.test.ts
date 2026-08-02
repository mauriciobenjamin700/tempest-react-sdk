import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installMediaDevices, removeMediaDevices, setSecureContext } from "../../test/audio-mocks";
import {
    classifyMediaError,
    isMediaCaptureSupported,
    missingCaptureApiError,
} from "./media-access";

describe("classifyMediaError", () => {
    const restores: Array<() => void> = [];

    beforeEach(() => {
        // jsdom reports `isSecureContext: false`, which the classifier — correctly —
        // treats as the cause of every capture failure. The normal-path cases have to
        // opt into a secure context to reach the `DOMException` mapping at all.
        restores.push(setSecureContext(true));
    });

    afterEach(() => {
        while (restores.length) restores.pop()?.();
    });

    it("reports an insecure context before anything else", () => {
        restores.push(setSecureContext(false));

        // Even a permission denial is reported as `insecure`: over plain HTTP that is
        // the actual cause, and the fix is a URL, not a browser setting.
        const error = classifyMediaError(new DOMException("no", "NotAllowedError"));
        expect(error.kind).toBe("insecure");
        expect(error.message).toContain("HTTPS");
    });

    it("maps a denial", () => {
        expect(classifyMediaError(new DOMException("no", "NotAllowedError")).kind).toBe(
            "permission-denied",
        );
        expect(classifyMediaError(new DOMException("no", "SecurityError")).kind).toBe(
            "permission-denied",
        );
    });

    it("collapses 'no device' and 'no device matching these constraints'", () => {
        expect(classifyMediaError(new DOMException("no", "NotFoundError")).kind).toBe("not-found");
        expect(classifyMediaError(new DOMException("no", "OverconstrainedError")).kind).toBe(
            "not-found",
        );
    });

    it("collapses the two 'hardware is busy' names", () => {
        expect(classifyMediaError(new DOMException("no", "NotReadableError")).kind).toBe("in-use");
        expect(classifyMediaError(new DOMException("no", "AbortError")).kind).toBe("in-use");
    });

    it("keeps an unrecognised Error's own message", () => {
        const error = classifyMediaError(new Error("encoder exploded"));
        expect(error.kind).toBe("unknown");
        expect(error.message).toBe("encoder exploded");
    });

    it("falls back to a readable sentence for a non-Error", () => {
        const error = classifyMediaError("nope");
        expect(error.kind).toBe("unknown");
        expect(error.message).toContain("microphone");
    });

    it("names the camera when asked", () => {
        expect(classifyMediaError(new DOMException("no", "NotFoundError"), "camera").message).toBe(
            "No camera available on this device.",
        );
    });

    it("maps a DOMException name it does not know to unknown", () => {
        expect(classifyMediaError(new DOMException("weird", "TypeError")).kind).toBe("unknown");
    });
});

describe("isMediaCaptureSupported", () => {
    it("is true once navigator.mediaDevices exists", () => {
        // jsdom ships no `mediaDevices` at all, which is itself the unsupported case.
        const devices = installMediaDevices({});
        try {
            expect(isMediaCaptureSupported()).toBe(true);
        } finally {
            devices.restore();
        }
    });

    it("is false without navigator.mediaDevices", () => {
        const restore = removeMediaDevices();
        try {
            expect(isMediaCaptureSupported()).toBe(false);
        } finally {
            restore();
        }
    });
});

describe("missingCaptureApiError", () => {
    const restores: Array<() => void> = [];
    afterEach(() => {
        while (restores.length) restores.pop()?.();
    });

    it("says unsupported over HTTPS", () => {
        restores.push(setSecureContext(true));
        const error = missingCaptureApiError();
        expect(error.kind).toBe("unsupported");
        expect(error.message).toContain("not supported");
    });

    it("blames the insecure context over plain HTTP", () => {
        // Same missing API, different actionable cause: the fix is a URL, not a browser.
        restores.push(setSecureContext(false));
        expect(missingCaptureApiError().kind).toBe("insecure");
    });

    it("names the camera when asked", () => {
        restores.push(setSecureContext(true));
        expect(missingCaptureApiError("camera").message).toContain("Camera");
    });
});
