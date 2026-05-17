import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isShareSupported, share } from "./share";

describe("share", () => {
    afterEach(() => {
        delete (navigator as { share?: unknown }).share;
    });

    it("returns unsupported when navigator.share is missing", async () => {
        const result = await share({ title: "x" });
        expect(result.unsupported).toBe(true);
    });

    it("returns shared:true on success", async () => {
        Object.assign(navigator, { share: vi.fn().mockResolvedValue(undefined) });
        const result = await share({ title: "x" });
        expect(result.shared).toBe(true);
    });

    it("treats AbortError as cancellation", async () => {
        Object.assign(navigator, {
            share: vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")),
        });
        const result = await share({ title: "x" });
        expect(result.cancelled).toBe(true);
    });
});

describe("isShareSupported", () => {
    beforeEach(() => {
        delete (navigator as { share?: unknown }).share;
    });

    it("returns false when missing", () => {
        expect(isShareSupported()).toBe(false);
    });
});
