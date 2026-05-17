import { afterEach, describe, expect, it, vi } from "vitest";
import { share } from "./share";

afterEach(() => {
    delete (navigator as { share?: unknown }).share;
    delete (navigator as { canShare?: unknown }).canShare;
});

describe("share files", () => {
    it("returns unsupported when canShare reports false for files", async () => {
        Object.assign(navigator, {
            share: vi.fn(),
            canShare: vi.fn().mockReturnValue(false),
        });
        const file = new File(["x"], "x.png", { type: "image/png" });
        const result = await share({ files: [file] });
        expect(result.unsupported).toBe(true);
    });

    it("returns error info on unknown failure", async () => {
        Object.assign(navigator, {
            share: vi.fn().mockRejectedValue(new Error("boom")),
        });
        const result = await share({ title: "x" });
        expect(result.error).toBeInstanceOf(Error);
        expect(result.cancelled).toBe(false);
    });
});
