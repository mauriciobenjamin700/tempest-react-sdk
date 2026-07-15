import { afterEach, describe, expect, it, vi } from "vitest";
import { shareOrDownloadBlob } from "./share-or-download";

afterEach(() => {
    delete (navigator as { share?: unknown }).share;
    delete (navigator as { canShare?: unknown }).canShare;
    vi.restoreAllMocks();
});

describe("shareOrDownloadBlob", () => {
    it("uses the Web Share API when file sharing is supported", async () => {
        const shareSpy = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, {
            share: shareSpy,
            canShare: vi.fn().mockReturnValue(true),
        });
        const createObjectURL = vi.fn();
        Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });

        const blob = new Blob(["data"], { type: "application/zip" });
        await shareOrDownloadBlob(blob, "export.zip");

        expect(shareSpy).toHaveBeenCalledTimes(1);
        const payload = shareSpy.mock.calls[0][0] as { files: File[]; title: string };
        expect(payload.files[0].name).toBe("export.zip");
        expect(payload.title).toBe("export.zip");
        expect(createObjectURL).not.toHaveBeenCalled();
    });

    it("falls back to a download anchor when file sharing is unsupported", async () => {
        const createObjectURL = vi.fn().mockReturnValue("blob:mock");
        const revokeObjectURL = vi.fn();
        Object.assign(URL, { createObjectURL, revokeObjectURL });
        const clickSpy = vi
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => undefined);

        const blob = new Blob(["data"], { type: "application/zip" });
        await shareOrDownloadBlob(blob, "report.zip", { title: "Report" });

        expect(createObjectURL).toHaveBeenCalledWith(blob);
        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
        expect(document.querySelector("a")).toBeNull();
    });
});
