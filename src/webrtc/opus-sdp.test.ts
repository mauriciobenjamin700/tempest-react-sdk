import { describe, expect, it, vi } from "vitest";
import { setTunedLocalDescription, tuneOpus } from "./opus-sdp";

/** An offer shaped like the ones Chrome emits: two audio slots plus video. */
const OFFER = [
    "v=0",
    "o=- 1 2 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    "m=audio 9 UDP/TLS/RTP/SAVPF 111 63",
    "a=mid:0",
    "a=rtpmap:111 opus/48000/2",
    "a=fmtp:111 minptime=10;useinbandfec=1",
    "a=rtpmap:63 red/48000/2",
    "m=video 9 UDP/TLS/RTP/SAVPF 96",
    "a=mid:1",
    "a=rtpmap:96 VP8/90000",
    "a=fmtp:96 max-fs=12288",
    "m=audio 9 UDP/TLS/RTP/SAVPF 111",
    "a=mid:2",
    "a=rtpmap:111 opus/48000/2",
    "a=fmtp:111 minptime=10;useinbandfec=1",
].join("\r\n");

/** The `fmtp` payload of the nth Opus line, as key/value pairs. */
function fmtpOf(sdp: string, occurrence = 0): Record<string, string> {
    const lines = sdp.split("\r\n").filter((line) => /^a=fmtp:111 /.test(line));
    const payload = lines[occurrence]?.slice("a=fmtp:111 ".length) ?? "";
    return Object.fromEntries(
        payload
            .split(";")
            .filter(Boolean)
            .map((entry) => {
                const eq = entry.indexOf("=");
                return eq < 0 ? [entry, ""] : [entry.slice(0, eq), entry.slice(eq + 1)];
            }),
    );
}

describe("tuneOpus — the fmtp merge", () => {
    it("keeps parameters the browser wrote, instead of replacing the line", () => {
        const tuned = tuneOpus(OFFER, { stereo: true });

        expect(fmtpOf(tuned).minptime).toBe("10");
    });

    it("overwrites only the keys the profile names", () => {
        const tuned = tuneOpus(OFFER, { fec: false });
        const params = fmtpOf(tuned);

        expect(params.useinbandfec).toBe("0");
        expect(params.minptime).toBe("10");
        expect(params.stereo).toBeUndefined();
    });

    it("writes stereo and sprop-stereo together, since they point opposite ways", () => {
        const params = fmtpOf(tuneOpus(OFFER, { stereo: true }));

        expect(params.stereo).toBe("1");
        expect(params["sprop-stereo"]).toBe("1");
    });

    it("writes both as 0 when stereo is turned off", () => {
        const params = fmtpOf(tuneOpus(OFFER, { stereo: false }));

        expect(params.stereo).toBe("0");
        expect(params["sprop-stereo"]).toBe("0");
    });

    it("maps every modelled field to its Opus name", () => {
        const params = fmtpOf(
            tuneOpus(OFFER, {
                maxAverageBitrate: 192_000,
                maxPlaybackRate: 48_000,
                fec: false,
                dtx: false,
                cbr: true,
            }),
        );

        expect(params).toMatchObject({
            maxaveragebitrate: "192000",
            maxplaybackrate: "48000",
            useinbandfec: "0",
            usedtx: "0",
            cbr: "1",
        });
    });

    it("writes the on side of every boolean too", () => {
        const params = fmtpOf(tuneOpus(OFFER, { fec: true, dtx: true, cbr: false }));

        expect(params).toMatchObject({ useinbandfec: "1", usedtx: "1", cbr: "0" });
    });

    it("merges an unmodelled key through extra", () => {
        const params = fmtpOf(tuneOpus(OFFER, { extra: { "sprop-maxcapturerate": "16000" } }));

        expect(params["sprop-maxcapturerate"]).toBe("16000");
    });

    it("keeps a bare flag that carries no value", () => {
        const sdp = ["m=audio 9 RTP 111", "a=rtpmap:111 opus/48000/2", "a=fmtp:111 cbr"].join(
            "\r\n",
        );

        expect(tuneOpus(sdp, { stereo: true })).toContain("a=fmtp:111 cbr;stereo=1;sprop-stereo=1");
    });
});

describe("tuneOpus — finding the lines", () => {
    it("reads the payload type from the rtpmap instead of assuming 111", () => {
        const sdp = ["m=audio 9 RTP 96", "a=rtpmap:96 opus/48000/2", "a=fmtp:96 minptime=10"].join(
            "\r\n",
        );

        expect(tuneOpus(sdp, { dtx: true })).toContain("a=fmtp:96 minptime=10;usedtx=1");
    });

    it("tunes every Opus payload type in the block", () => {
        const sdp = [
            "m=audio 9 RTP 111 112",
            "a=rtpmap:111 opus/48000/2",
            "a=fmtp:111 minptime=10",
            "a=rtpmap:112 opus/48000/2",
            "a=fmtp:112 minptime=20",
        ].join("\r\n");
        const tuned = tuneOpus(sdp, { dtx: true });

        expect(tuned).toContain("a=fmtp:111 minptime=10;usedtx=1");
        expect(tuned).toContain("a=fmtp:112 minptime=20;usedtx=1");
    });

    it("inserts an fmtp right after the rtpmap when there is none", () => {
        const sdp = ["m=audio 9 RTP 111", "a=rtpmap:111 opus/48000/2", "a=ptime:20"].join("\r\n");

        expect(tuneOpus(sdp, { stereo: true }).split("\r\n")).toEqual([
            "m=audio 9 RTP 111",
            "a=rtpmap:111 opus/48000/2",
            "a=fmtp:111 stereo=1;sprop-stereo=1",
            "a=ptime:20",
        ]);
    });

    it("leaves a block whose codec is not Opus alone", () => {
        const sdp = ["m=audio 9 RTP 8", "a=rtpmap:8 PCMA/8000", "a=fmtp:8 x=1"].join("\r\n");

        expect(tuneOpus(sdp, { stereo: true })).toBe(sdp);
    });

    it("never touches a video m-line", () => {
        const tuned = tuneOpus(OFFER, { stereo: true });

        expect(tuned).toContain("a=fmtp:96 max-fs=12288");
        expect(tuned).toContain("a=rtpmap:96 VP8/90000");
    });

    it("leaves an fmtp that belongs to another payload type alone", () => {
        const sdp = [
            "m=audio 9 RTP 111 63",
            "a=rtpmap:111 opus/48000/2",
            "a=rtpmap:63 red/48000/2",
            "a=fmtp:63 111/111",
        ].join("\r\n");

        expect(tuneOpus(sdp, { dtx: true })).toContain("a=fmtp:63 111/111");
    });

    it("accepts LF input and always emits the CRLF the RFC asks for", () => {
        const sdp = ["m=audio 9 RTP 111", "a=rtpmap:111 opus/48000/2"].join("\n");

        expect(tuneOpus(sdp, { stereo: true })).toContain("\r\n");
    });
});

describe("tuneOpus — choosing the profile per slot", () => {
    it("gives each audio slot its own profile, by position", () => {
        const tuned = tuneOpus(OFFER, {
            0: { maxAverageBitrate: 48_000, stereo: false, dtx: true },
            1: { maxAverageBitrate: 192_000, stereo: true, dtx: false },
        });

        expect(fmtpOf(tuned, 0)).toMatchObject({ maxaveragebitrate: "48000", stereo: "0" });
        expect(fmtpOf(tuned, 1)).toMatchObject({ maxaveragebitrate: "192000", stereo: "1" });
    });

    it("counts audio m-lines only, so a video block does not shift the index", () => {
        const tuned = tuneOpus(OFFER, { 1: { maxAverageBitrate: 192_000 } });

        expect(fmtpOf(tuned, 0).maxaveragebitrate).toBeUndefined();
        expect(fmtpOf(tuned, 1).maxaveragebitrate).toBe("192000");
    });

    it("matches by mid when the key is not a position", () => {
        const tuned = tuneOpus(OFFER, { "2": { dtx: false } });
        expect(fmtpOf(tuned, 1).usedtx).toBe("0");
    });

    it("applies one profile to every audio slot when given a bare profile", () => {
        const tuned = tuneOpus(OFFER, { stereo: true });

        expect(fmtpOf(tuned, 0)["sprop-stereo"]).toBe("1");
        expect(fmtpOf(tuned, 1)["sprop-stereo"]).toBe("1");
    });

    it("falls back to position when the block declares no mid", () => {
        const sdp = [
            "m=audio 9 RTP 111",
            "a=rtpmap:111 opus/48000/2",
            "a=fmtp:111 minptime=10",
        ].join("\r\n");

        expect(tuneOpus(sdp, { 0: { dtx: true } })).toContain("usedtx=1");
        expect(tuneOpus(sdp, { mic: { dtx: true } })).toBe(sdp);
    });

    it("ignores a key that matches no slot, because an SDP is negotiated", () => {
        expect(tuneOpus(OFFER, { 7: { stereo: true } })).toBe(OFFER);
    });

    it("is a no-op for an empty profile, rather than a surprise", () => {
        expect(tuneOpus(OFFER, {})).toBe(OFFER);
    });

    it("returns the SDP untouched when there is no Opus at all", () => {
        const sdp = ["m=video 9 RTP 96", "a=rtpmap:96 VP8/90000"].join("\r\n");

        expect(tuneOpus(sdp, { stereo: true })).toBe(sdp);
    });
});

describe("setTunedLocalDescription", () => {
    /** A peer connection whose `setLocalDescription` can be made picky. */
    function connection(refuseEdited = false): {
        pc: RTCPeerConnection;
        calls: RTCSessionDescriptionInit[];
    } {
        const calls: RTCSessionDescriptionInit[] = [];
        const setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
            calls.push(description);
            if (refuseEdited && description.sdp?.includes("sprop-stereo")) {
                throw new DOMException("Failed to parse SessionDescription", "InvalidAccessError");
            }
        });
        return { pc: { setLocalDescription } as unknown as RTCPeerConnection, calls };
    }

    it("applies the tuned description when the browser accepts it", async () => {
        const { pc, calls } = connection();

        const result = await setTunedLocalDescription(
            pc,
            { type: "offer", sdp: OFFER },
            {
                stereo: true,
            },
        );

        expect(result).toBe("tuned");
        expect(calls).toHaveLength(1);
        expect(calls[0].sdp).toContain("sprop-stereo=1");
        expect(calls[0].type).toBe("offer");
    });

    it("falls back to the original SDP rather than letting the call die", async () => {
        const { pc, calls } = connection(true);

        const result = await setTunedLocalDescription(
            pc,
            { type: "offer", sdp: OFFER },
            {
                stereo: true,
            },
        );

        expect(result).toBe("original");
        expect(calls).toHaveLength(2);
        expect(calls[1].sdp).toBe(OFFER);
    });

    it("skips the edit entirely when tuning changed nothing", async () => {
        const { pc, calls } = connection();

        const result = await setTunedLocalDescription(pc, { type: "offer", sdp: OFFER }, {});

        expect(result).toBe("original");
        expect(calls).toHaveLength(1);
    });

    it("passes a description with no sdp straight through", async () => {
        const { pc, calls } = connection();

        const result = await setTunedLocalDescription(pc, { type: "rollback" }, { stereo: true });

        expect(result).toBe("original");
        expect(calls[0]).toEqual({ type: "rollback" });
    });

    it("lets a failure of the original description reach the caller", async () => {
        const setLocalDescription = vi.fn().mockRejectedValue(new Error("connection closed"));
        const pc = { setLocalDescription } as unknown as RTCPeerConnection;

        await expect(
            setTunedLocalDescription(pc, { type: "offer", sdp: OFFER }, { stereo: true }),
        ).rejects.toThrow("connection closed");
    });
});

describe("tuneOpus — a real Chrome offer", () => {
    /**
     * A fragment as Chrome actually emits it: eight payload types, `red` whose
     * own `fmtp` refers to Opus by number, and a trailing CRLF.
     */
    const CHROME = [
        "v=0",
        "o=- 4611731400430051336 2 IN IP4 127.0.0.1",
        "s=-",
        "t=0 0",
        "a=group:BUNDLE 0",
        "m=audio 9 UDP/TLS/RTP/SAVPF 111 63 9 0 8 13 110 126",
        "c=IN IP4 0.0.0.0",
        "a=mid:0",
        "a=sendrecv",
        "a=rtpmap:111 opus/48000/2",
        "a=rtcp-fb:111 transport-cc",
        "a=fmtp:111 minptime=10;useinbandfec=1",
        "a=rtpmap:63 red/48000/2",
        "a=fmtp:63 111/111",
        "a=rtpmap:9 G722/8000",
        "a=rtpmap:126 telephone-event/8000",
        "",
    ].join("\r\n");

    it("changes the Opus fmtp and nothing else", () => {
        const tuned = tuneOpus(CHROME, { stereo: true, maxAverageBitrate: 128_000 });
        const lines = tuned.split("\r\n");

        expect(lines).toHaveLength(CHROME.split("\r\n").length);
        expect(lines.filter((line) => line.startsWith("a=fmtp:111"))).toEqual([
            "a=fmtp:111 minptime=10;useinbandfec=1;maxaveragebitrate=128000;stereo=1;sprop-stereo=1",
        ]);
        expect(lines).toContain("a=fmtp:63 111/111");
        expect(lines).toContain("a=rtcp-fb:111 transport-cc");
        expect(lines.at(-1)).toBe("");
    });

    it("is idempotent, so re-tuning a negotiated description is safe", () => {
        const once = tuneOpus(CHROME, { stereo: true, dtx: false });

        expect(tuneOpus(once, { stereo: true, dtx: false })).toBe(once);
    });

    it("merges an fmtp that precedes its rtpmap, which the RFC allows", () => {
        const sdp = [
            "m=audio 9 RTP 111",
            "a=fmtp:111 minptime=10",
            "a=rtpmap:111 opus/48000/2",
        ].join("\r\n");

        expect(tuneOpus(sdp, { stereo: true }).split("\r\n")).toEqual([
            "m=audio 9 RTP 111",
            "a=fmtp:111 minptime=10;stereo=1;sprop-stereo=1",
            "a=rtpmap:111 opus/48000/2",
        ]);
    });

    it("accepts an rtpmap with no channel count", () => {
        const sdp = ["m=audio 9 RTP 111", "a=rtpmap:111 opus/48000"].join("\r\n");

        expect(tuneOpus(sdp, { stereo: true })).toContain("a=fmtp:111 stereo=1;sprop-stereo=1");
    });

    it("tunes a recvonly answer too", () => {
        const sdp = ["m=audio 9 RTP 111", "a=recvonly", "a=rtpmap:111 opus/48000/2"].join("\r\n");

        expect(tuneOpus(sdp, { stereo: true })).toContain("a=fmtp:111 stereo=1;sprop-stereo=1");
    });
});
