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

    describe("with text", () => {
        function stubDownload(): {
            createObjectURL: ReturnType<typeof vi.fn>;
            click: ReturnType<typeof vi.fn>;
        } {
            const createObjectURL = vi.fn().mockReturnValue("blob:mock");
            Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
            const click = vi.fn();
            vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
            return { createObjectURL, click };
        }

        it("sends the text in the same sheet as the file when files are shareable", async () => {
            const shareSpy = vi.fn().mockResolvedValue(undefined);
            Object.assign(navigator, { share: shareSpy, canShare: vi.fn().mockReturnValue(true) });
            const { click } = stubDownload();

            await shareOrDownloadBlob(new Blob(["x"], { type: "image/png" }), "foto.png", {
                text: "FAMACHA 2",
            });

            expect(shareSpy).toHaveBeenCalledTimes(1);
            const payload = shareSpy.mock.calls[0][0] as {
                files: File[];
                text: string;
                title: string;
            };
            expect(payload.text).toBe("FAMACHA 2");
            expect(payload.files[0].name).toBe("foto.png");
            expect(click).not.toHaveBeenCalled();
        });

        it("shares the text alone and still downloads the file when files are not shareable", async () => {
            const shareSpy = vi.fn().mockResolvedValue(undefined);
            Object.assign(navigator, { share: shareSpy, canShare: vi.fn().mockReturnValue(false) });
            const { createObjectURL, click } = stubDownload();
            const blob = new Blob(["x"], { type: "image/png" });

            await shareOrDownloadBlob(blob, "foto.png", { title: "Resultado", text: "FAMACHA 2" });

            expect(shareSpy).toHaveBeenCalledTimes(1);
            expect(shareSpy).toHaveBeenCalledWith({ title: "Resultado", text: "FAMACHA 2" });
            expect(createObjectURL).toHaveBeenCalledWith(blob);
            expect(click).toHaveBeenCalledTimes(1);
        });

        it("still downloads the file when the user cancels the text-only sheet", async () => {
            const shareSpy = vi.fn().mockRejectedValue(new DOMException("closed", "AbortError"));
            Object.assign(navigator, { share: shareSpy, canShare: vi.fn().mockReturnValue(false) });
            const { click } = stubDownload();

            await shareOrDownloadBlob(new Blob(["x"]), "foto.png", { text: "FAMACHA 2" });

            expect(shareSpy).toHaveBeenCalledTimes(1);
            expect(click).toHaveBeenCalledTimes(1);
        });

        it("downloads without a text-only sheet when textOnlyFallback is false", async () => {
            const shareSpy = vi.fn().mockResolvedValue(undefined);
            Object.assign(navigator, { share: shareSpy, canShare: vi.fn().mockReturnValue(false) });
            const { click } = stubDownload();

            await shareOrDownloadBlob(new Blob(["x"]), "foto.png", {
                text: "FAMACHA 2",
                textOnlyFallback: false,
            });

            expect(shareSpy).not.toHaveBeenCalled();
            expect(click).toHaveBeenCalledTimes(1);
        });

        it("downloads without a text-only sheet when the browser has no Web Share API", async () => {
            const { click } = stubDownload();

            await shareOrDownloadBlob(new Blob(["x"]), "foto.png", { text: "FAMACHA 2" });

            expect(click).toHaveBeenCalledTimes(1);
        });

        it("treats an empty text as no text", async () => {
            const shareSpy = vi.fn().mockResolvedValue(undefined);
            Object.assign(navigator, { share: shareSpy, canShare: vi.fn().mockReturnValue(false) });
            const { click } = stubDownload();

            await shareOrDownloadBlob(new Blob(["x"]), "foto.png", { text: "" });

            expect(shareSpy).not.toHaveBeenCalled();
            expect(click).toHaveBeenCalledTimes(1);
        });

        it("skips the text-only sheet when the file share fails with a real error", async () => {
            const shareSpy = vi
                .fn()
                .mockRejectedValue(new DOMException("denied", "NotAllowedError"));
            Object.assign(navigator, { share: shareSpy, canShare: vi.fn().mockReturnValue(true) });
            const { click } = stubDownload();

            await shareOrDownloadBlob(new Blob(["x"]), "foto.png", { text: "FAMACHA 2" });

            expect(shareSpy).toHaveBeenCalledTimes(1);
            expect(click).toHaveBeenCalledTimes(1);
        });

        it("does not download when the user cancels the file sheet", async () => {
            const shareSpy = vi.fn().mockRejectedValue(new DOMException("closed", "AbortError"));
            Object.assign(navigator, { share: shareSpy, canShare: vi.fn().mockReturnValue(true) });
            const { click } = stubDownload();

            await shareOrDownloadBlob(new Blob(["x"]), "foto.png", { text: "FAMACHA 2" });

            expect(shareSpy).toHaveBeenCalledTimes(1);
            expect(click).not.toHaveBeenCalled();
        });
    });
});
