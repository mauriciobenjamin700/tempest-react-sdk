import { describe, expect, it, vi } from "vitest";
import { setSenderBitrate } from "./sender-bitrate";

/**
 * An `RTCRtpSender` double.
 *
 * `setParameters` checks identity with what `getParameters` handed out, which is
 * exactly what the browser does — a freshly built object is refused there too.
 */
function fakeSender(encodings?: RTCRtpEncodingParameters[]): {
    sender: RTCRtpSender;
    applied: () => RTCRtpSendParameters | null;
} {
    let handedOut: RTCRtpSendParameters | null = null;
    let applied: RTCRtpSendParameters | null = null;
    const sender = {
        getParameters: vi.fn((): RTCRtpSendParameters => {
            const base = {
                transactionId: "t",
                codecs: [],
                headerExtensions: [],
                rtcp: {},
            } as unknown as RTCRtpSendParameters;
            if (encodings) base.encodings = encodings;
            handedOut = base;
            return base;
        }),
        setParameters: vi.fn(async (parameters: RTCRtpSendParameters) => {
            if (parameters !== handedOut) throw new TypeError("parameters are not the last ones");
            applied = parameters;
        }),
    } as unknown as RTCRtpSender;
    return { sender, applied: () => applied };
}

describe("setSenderBitrate", () => {
    it("caps the encoding the sender already has", async () => {
        const { sender, applied } = fakeSender([{}]);

        await expect(setSenderBitrate(sender, 48_000)).resolves.toBe(true);
        expect(applied()?.encodings?.[0].maxBitrate).toBe(48_000);
    });

    it("creates the encoding a sender that never negotiated does not report", async () => {
        const { sender, applied } = fakeSender();

        await expect(setSenderBitrate(sender, 96_000)).resolves.toBe(true);
        expect(applied()?.encodings).toEqual([{ maxBitrate: 96_000 }]);
    });

    it("fills an encodings array that came back empty", async () => {
        const { sender, applied } = fakeSender([]);

        await setSenderBitrate(sender, 64_000);

        expect(applied()?.encodings).toEqual([{ maxBitrate: 64_000 }]);
    });

    it("caps every simulcast layer", async () => {
        const { sender, applied } = fakeSender([{ rid: "lo" }, { rid: "hi" }]);

        await setSenderBitrate(sender, 200_000);

        expect(applied()?.encodings?.map((e) => e.maxBitrate)).toEqual([200_000, 200_000]);
    });

    it("lifts the cap with null instead of writing a sentinel", async () => {
        const { sender, applied } = fakeSender([{ maxBitrate: 48_000 }]);

        await setSenderBitrate(sender, null);

        expect(applied()?.encodings?.[0]).toEqual({});
    });

    it("keeps the object identity the browser demands", async () => {
        const { sender } = fakeSender([{}]);

        await expect(setSenderBitrate(sender, 48_000)).resolves.toBe(true);
    });

    it("answers false when the browser refuses, rather than killing the call", async () => {
        const sender = {
            getParameters: vi.fn(() => {
                throw new DOMException("sender is stopped", "InvalidStateError");
            }),
            setParameters: vi.fn(),
        } as unknown as RTCRtpSender;

        await expect(setSenderBitrate(sender, 48_000)).resolves.toBe(false);
    });
});
