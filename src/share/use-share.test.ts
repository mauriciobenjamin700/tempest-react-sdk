import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { shareText } from "./share-text";
import { useShare } from "./use-share";
import type { ShareOutcome, UseShareOptions, UseShareResult } from "./use-share";

const ORIGINAL_CLIPBOARD = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const ORIGINAL_EXEC_COMMAND = document.execCommand;

interface WebShareStub {
    share: ReturnType<typeof vi.fn>;
    canShare: ReturnType<typeof vi.fn>;
}

/**
 * Install `navigator.share` and `navigator.canShare`.
 *
 * @param acceptsFiles - What `canShare` answers for a payload with files.
 * @param result - How `navigator.share` settles.
 * @returns The two stubs.
 */
function stubWebShare(
    acceptsFiles: boolean | ((data: ShareData) => boolean),
    result: () => Promise<void> = () => Promise.resolve(),
): WebShareStub {
    const share = vi.fn(result);
    const canShare = vi.fn((data: ShareData) =>
        typeof acceptsFiles === "function" ? acceptsFiles(data) : acceptsFiles,
    );
    Object.assign(navigator, { share, canShare });
    return { share, canShare };
}

/**
 * Install a `fetch` that answers every request with an image.
 *
 * @param type - MIME type of the body.
 * @returns The stub.
 */
function stubImageFetch(type: string = "image/png"): ReturnType<typeof vi.fn> {
    const fetchStub = vi.fn(
        async () =>
            new Response(new Uint8Array([137, 80, 78, 71]), {
                status: 200,
                headers: type ? { "content-type": type } : {},
            }),
    );
    vi.stubGlobal("fetch", fetchStub);
    return fetchStub;
}

/**
 * Render the hook.
 *
 * @param options - Hook options.
 * @returns The current result accessor.
 */
function renderShare(options?: UseShareOptions): { current: UseShareResult } {
    return renderHook(() => useShare(options)).result;
}

/**
 * Run `share` inside `act` and return its outcome.
 *
 * @param result - The hook result accessor.
 * @param content - What to share.
 * @returns The outcome.
 */
async function runShare(
    result: { current: UseShareResult },
    content: Parameters<UseShareResult["share"]>[0],
): Promise<ShareOutcome> {
    let outcome!: ShareOutcome;
    await act(async () => {
        outcome = await result.current.share(content);
    });
    return outcome;
}

beforeEach(() => {
    delete (navigator as { share?: unknown }).share;
    delete (navigator as { canShare?: unknown }).canShare;
});

afterEach(() => {
    delete (navigator as { share?: unknown }).share;
    delete (navigator as { canShare?: unknown }).canShare;
    if (ORIGINAL_CLIPBOARD) Object.defineProperty(navigator, "clipboard", ORIGINAL_CLIPBOARD);
    else delete (navigator as unknown as Record<string, unknown>).clipboard;
    document.execCommand = ORIGINAL_EXEC_COMMAND;
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("useShare capabilities", () => {
    it("reports no sharing at all when the browser has no Web Share API", () => {
        const result = renderShare();
        expect(result.current.canShare).toBe(false);
        expect(result.current.canShareFiles).toBe(false);
    });

    it("reports file sharing from canShare with an image, before any download", () => {
        const fetchStub = stubImageFetch();
        const { canShare } = stubWebShare(true);
        const result = renderShare();
        expect(result.current.canShare).toBe(true);
        expect(result.current.canShareFiles).toBe(true);
        const probe = (canShare.mock.calls[0]?.[0] as ShareData).files?.[0];
        expect(probe?.type).toBe("image/png");
        expect(fetchStub).not.toHaveBeenCalled();
    });

    it("reports no file sharing when canShare is missing or throws", () => {
        Object.assign(navigator, { share: vi.fn() });
        expect(renderShare().current.canShareFiles).toBe(false);
        stubWebShare(() => {
            throw new TypeError("files not supported");
        });
        expect(renderShare().current.canShareFiles).toBe(false);
    });
});

describe("useShare share", () => {
    it("resolves unsupported without touching anything when there is no Web Share API", async () => {
        const fetchStub = stubImageFetch();
        const result = renderShare();
        const outcome = await runShare(result, { url: "https://x.test/a", imageUrl: "/og.png" });
        expect(outcome).toBe("unsupported");
        expect(fetchStub).not.toHaveBeenCalled();
    });

    it("resolves shared and passes only the fields the caller set", async () => {
        const { share } = stubWebShare(false);
        const result = renderShare();
        const outcome = await runShare(result, { title: "Carona", url: "https://x.test/c/1" });
        expect(outcome).toBe("shared");
        expect(share).toHaveBeenCalledWith({ title: "Carona", url: "https://x.test/c/1" });
    });

    it("resolves cancelled, not failed, when the person closes the sheet", async () => {
        stubWebShare(false, () => Promise.reject(new DOMException("closed", "AbortError")));
        const onError = vi.fn();
        const result = renderShare({ onError });
        expect(await runShare(result, { url: "https://x.test" })).toBe("cancelled");
        expect(onError).not.toHaveBeenCalled();
    });

    it("resolves failed and reports the error when the browser refuses the share", async () => {
        const refusal = new DOMException("no activation", "NotAllowedError");
        stubWebShare(false, () => Promise.reject(refusal));
        const onError = vi.fn();
        const result = renderShare({ onError });
        expect(await runShare(result, { url: "https://x.test" })).toBe("failed");
        expect(onError).toHaveBeenCalledWith(refusal);
    });

    it("never downloads the image when the device cannot share files", async () => {
        const fetchStub = stubImageFetch();
        const { share } = stubWebShare(false);
        const result = renderShare();
        await runShare(result, { text: "Oi", url: "https://x.test/c/1", imageUrl: "/og.png" });
        expect(fetchStub).not.toHaveBeenCalled();
        expect(share).toHaveBeenCalledWith({ text: "Oi", url: "https://x.test/c/1" });
    });

    it("sends the image as a file and folds the link into the text when files are accepted", async () => {
        stubImageFetch("image/png");
        const { share } = stubWebShare(true);
        const result = renderShare();
        const outcome = await runShare(result, {
            title: "Carona",
            text: "Sexta 07:05",
            url: "https://x.test/c/1",
            imageUrl: "https://x.test/c/1/og.png",
        });
        expect(outcome).toBe("shared");
        const payload = share.mock.calls[0]?.[0] as ShareData;
        expect(payload.url).toBeUndefined();
        expect(payload.text).toBe("Sexta 07:05\nhttps://x.test/c/1");
        expect(payload.title).toBe("Carona");
        expect(payload.files?.[0]?.name).toBe("og.png");
        expect(payload.files?.[0]?.type).toBe("image/png");
    });

    it("names an extensionless image after the response type, or the caller's name", async () => {
        stubImageFetch("image/jpeg");
        const { share } = stubWebShare(true);
        const result = renderShare();
        await runShare(result, { url: "https://x.test/c/1", imageUrl: "https://x.test/og" });
        expect((share.mock.calls[0]?.[0] as ShareData).files?.[0]?.name).toBe("preview.jpg");
        await runShare(result, {
            url: "https://x.test/c/1",
            imageUrl: "https://x.test/og",
            imageFileName: "carona.jpg",
        });
        expect((share.mock.calls[1]?.[0] as ShareData).files?.[0]?.name).toBe("carona.jpg");
    });

    it("falls back to the png name and type when the response has no type", async () => {
        stubImageFetch("");
        const { share } = stubWebShare(true);
        const result = renderShare();
        await runShare(result, { url: "https://x.test/c/1", imageUrl: "https://x.test/og" });
        const file = (share.mock.calls[0]?.[0] as ShareData).files?.[0];
        expect(file?.name).toBe("preview.png");
        expect(file?.type).toBe("image/png");
    });

    it("shares without the image when the download fails", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
        const { share } = stubWebShare(true);
        const result = renderShare();
        const outcome = await runShare(result, {
            text: "Oi",
            url: "https://x.test/c/1",
            imageUrl: "/og.png",
        });
        expect(outcome).toBe("shared");
        expect(share).toHaveBeenCalledTimes(1);
        expect(share).toHaveBeenCalledWith({ text: "Oi", url: "https://x.test/c/1" });
    });

    it("shares without the image when the server answers with an error status", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("nope", { status: 404 })),
        );
        const { share } = stubWebShare(true);
        const result = renderShare();
        await runShare(result, { url: "https://x.test/c/1", imageUrl: "/og.png" });
        expect(share).toHaveBeenCalledWith({ url: "https://x.test/c/1" });
    });

    it("shares without the image when the device refuses the downloaded file", async () => {
        stubImageFetch("image/svg+xml");
        const { share } = stubWebShare(
            (data) => !data.files?.some((file) => file.type === "image/svg+xml"),
        );
        const result = renderShare();
        const outcome = await runShare(result, {
            url: "https://x.test/c/1",
            imageUrl: "/og.svg",
        });
        expect(outcome).toBe("shared");
        expect(share).toHaveBeenCalledTimes(1);
        expect(share).toHaveBeenCalledWith({ url: "https://x.test/c/1" });
    });

    it("stops waiting for a slow image after imageTimeoutMs and shares without it", async () => {
        vi.useFakeTimers();
        vi.stubGlobal(
            "fetch",
            vi.fn(() => new Promise<Response>(() => undefined)),
        );
        const { share } = stubWebShare(true);
        const result = renderShare({ imageTimeoutMs: 1000 });
        let outcome: ShareOutcome | undefined;
        await act(async () => {
            const pending = result.current.share({ url: "https://x.test/c/1", imageUrl: "/og" });
            await vi.advanceTimersByTimeAsync(999);
            expect(share).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1);
            outcome = await pending;
        });
        expect(outcome).toBe("shared");
        expect(share).toHaveBeenCalledWith({ url: "https://x.test/c/1" });
    });

    it("reuses a prefetched image instead of downloading it again on click", async () => {
        const fetchStub = stubImageFetch();
        const { share } = stubWebShare(true);
        const result = renderShare();
        act(() => result.current.prefetchImage("https://x.test/og.png"));
        expect(fetchStub).toHaveBeenCalledTimes(1);
        await runShare(result, { url: "https://x.test/c/1", imageUrl: "https://x.test/og.png" });
        expect(fetchStub).toHaveBeenCalledTimes(1);
        expect((share.mock.calls[0]?.[0] as ShareData).files).toHaveLength(1);
    });

    it("retries a failed download on the next share instead of caching the failure", async () => {
        const fetchStub = vi
            .fn()
            .mockRejectedValueOnce(new TypeError("offline"))
            .mockResolvedValue(
                new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } }),
            );
        vi.stubGlobal("fetch", fetchStub);
        const { share } = stubWebShare(true);
        const result = renderShare();
        await runShare(result, { url: "https://x.test/c/1", imageUrl: "/og.png" });
        await runShare(result, { url: "https://x.test/c/1", imageUrl: "/og.png" });
        expect(fetchStub).toHaveBeenCalledTimes(2);
        expect((share.mock.calls[1]?.[0] as ShareData).files).toHaveLength(1);
    });

    it("does not prefetch where files cannot be shared", () => {
        const fetchStub = stubImageFetch();
        stubWebShare(false);
        const result = renderShare();
        act(() => result.current.prefetchImage("https://x.test/og.png"));
        expect(fetchStub).not.toHaveBeenCalled();
    });
});

describe("useShare copyLink", () => {
    it("copies through the Clipboard API", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
        const result = renderShare();
        expect(await result.current.copyLink("https://x.test/c/1")).toBe(true);
        expect(writeText).toHaveBeenCalledWith("https://x.test/c/1");
    });

    it("falls back to execCommand when the Clipboard API rejects", async () => {
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
        });
        const execCommand = vi.fn(() => true);
        document.execCommand = execCommand;
        const result = renderShare();
        expect(await result.current.copyLink("https://x.test/c/1")).toBe(true);
        expect(execCommand).toHaveBeenCalledWith("copy");
        expect(document.querySelector("textarea")).toBeNull();
    });

    it("resolves false when both copy paths are refused, so the UI shows the field", async () => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
        document.execCommand = vi.fn(() => false);
        const result = renderShare();
        expect(await result.current.copyLink("https://x.test/c/1")).toBe(false);
    });
});

describe("shareText", () => {
    it("appends the link on its own line", () => {
        expect(shareText("Oi", "https://x.test")).toBe("Oi\nhttps://x.test");
    });

    it("does not repeat a link the text already carries", () => {
        expect(shareText("Reserve: https://x.test", "https://x.test")).toBe(
            "Reserve: https://x.test",
        );
    });

    it("returns whichever part exists", () => {
        expect(shareText(undefined, "https://x.test")).toBe("https://x.test");
        expect(shareText("Oi", undefined)).toBe("Oi");
        expect(shareText(undefined, undefined)).toBe("");
    });
});
