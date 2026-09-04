import { describe, expect, it, vi } from "vitest";

import { applyQualityToLink, resolveDegradation, scaleForRoom } from "./mesh-quality";
import type { MeshQuality, MeshSlot } from "./mesh-types";

describe("scaleForRoom", () => {
    const asked: MeshQuality = {
        video: { cam: 1200, screen: 3000 },
        uplinkBudgetKbps: 6000,
    };

    it("leaves a one-to-one call alone, which is what the largest sizes exist for", () => {
        expect(scaleForRoom(asked, 1)).toBe(asked);
        expect(scaleForRoom(asked, 0)).toBe(asked);
    });

    it("leaves the caps alone while they fit the share", () => {
        const roomy: MeshQuality = { ...asked, uplinkBudgetKbps: 12000 };

        expect(scaleForRoom(roomy, 2)).toBe(roomy);
    });

    it("divides proportionally once they do not", () => {
        const scaled = scaleForRoom(asked, 4).video ?? {};

        expect(scaled.cam).toBe(429);
        expect(scaled.screen).toBe(1071);
        expect((scaled.cam ?? 0) + (scaled.screen ?? 0)).toBeLessThanOrEqual(6000 / 4);
    });

    it("lifts to the floor only what fell below it, leaving the rest divided", () => {
        const scaled = scaleForRoom({ ...asked, minVideoKbps: 500 }, 8).video ?? {};

        expect(scaled.cam).toBe(500);
        expect(scaled.screen).toBe(536);
    });

    it("floors every slot once the division is small enough to reach them all", () => {
        const scaled =
            scaleForRoom({ ...asked, minVideoKbps: 500, uplinkBudgetKbps: 600 }, 8).video ?? {};

        expect(scaled.cam).toBe(500);
        expect(scaled.screen).toBe(500);
    });

    it("never rewrites what was asked for, so an emptying room climbs back", () => {
        scaleForRoom(asked, 6);

        expect(asked.video).toEqual({ cam: 1200, screen: 3000 });
    });

    it("leaves an uncapped slot uncapped", () => {
        const scaled = scaleForRoom(
            { video: { cam: 4000, screen: null }, uplinkBudgetKbps: 1000 },
            4,
        );

        expect(scaled.video?.screen).toBeNull();
        expect(scaled.video?.cam).toBeGreaterThan(0);
    });

    it("assumes 6 Mbps of uplink when the caller names no budget", () => {
        const unbudgeted: MeshQuality = { video: { cam: 4000, screen: 4000 } };

        const scaled = scaleForRoom(unbudgeted, 2).video ?? {};

        expect(scaled.cam).toBe(1500);
        expect(scaled.screen).toBe(1500);
        expect(scaleForRoom({ ...unbudgeted, uplinkBudgetKbps: 6000 }, 2).video).toEqual(scaled);
    });

    it("has nothing to divide when no video slot is capped", () => {
        const audioOnly: MeshQuality = { audio: { mic: 32000 } };

        expect(scaleForRoom(audioOnly, 5)).toBe(audioOnly);
    });
});

describe("resolveDegradation", () => {
    it("passes through anything that is not maintain-framerate", () => {
        expect(resolveDegradation({ degradationPreference: "maintain-resolution" }, {})).toBe(
            "maintain-resolution",
        );
        expect(resolveDegradation({}, {})).toBeUndefined();
    });

    it("honours maintain-framerate while the budget is worth holding frames for", () => {
        const asked: MeshQuality = { degradationPreference: "maintain-framerate" };
        const effective: MeshQuality = { video: { screen: 2000 } };

        expect(resolveDegradation(asked, effective)).toBe("maintain-framerate");
    });

    it("overrides it once the room's division took the budget below the floor", () => {
        const asked: MeshQuality = {
            degradationPreference: "maintain-framerate",
            fluidFloorKbps: 900,
        };
        const effective: MeshQuality = { video: { screen: 400, cam: 300 } };

        expect(resolveDegradation(asked, effective)).toBe("maintain-resolution");
    });

    it("reads the largest slot, not the sum, because they encode separately", () => {
        const asked: MeshQuality = {
            degradationPreference: "maintain-framerate",
            fluidFloorKbps: 900,
        };

        expect(resolveDegradation(asked, { video: { screen: 1000, cam: 300 } })).toBe(
            "maintain-framerate",
        );
    });

    /**
     * The answer used to come out backwards here. Filtering the nulls away
     * before taking the maximum read "no cap" as "no value", so an uncapped
     * screen beside a modest camera let the camera decide — and an uncapped
     * slot is the most generous case there is, which is exactly where fluidity
     * should hold.
     */
    it("treats an uncapped slot as unbounded, not as absent", () => {
        const asked: MeshQuality = {
            degradationPreference: "maintain-framerate",
            fluidFloorKbps: 900,
        };

        expect(resolveDegradation(asked, { video: { screen: null, cam: 300 } })).toBe(
            "maintain-framerate",
        );
    });

    it("still overrides when every slot is capped below the floor", () => {
        const asked: MeshQuality = {
            degradationPreference: "maintain-framerate",
            fluidFloorKbps: 900,
        };

        expect(resolveDegradation(asked, { video: { screen: 400, cam: 300 } })).toBe(
            "maintain-resolution",
        );
    });

    it("keeps the preference when nothing is capped, since nothing says otherwise", () => {
        const asked: MeshQuality = { degradationPreference: "maintain-framerate" };

        expect(resolveDegradation(asked, { video: { screen: null } })).toBe("maintain-framerate");
        expect(resolveDegradation(asked, {})).toBe("maintain-framerate");
    });
});

/**
 * An `RTCRtpSender` double that mirrors the two browser behaviours this module
 * exists to survive.
 *
 * `setParameters` checks identity with the object `getParameters` handed out,
 * because the browser refuses a freshly built one — that is why
 * `videoParameters` reads fresh for every attempt. And `rejectDegradation`
 * reproduces Firefox, which rejects the whole call when
 * `degradationPreference` is present, so a naive single attempt loses the
 * frame-rate cap to an objection about something else.
 *
 * @param options.encodings - Encodings the sender reports, or none at all for a
 *     sender that has not negotiated yet.
 * @param options.rejectDegradation - Reject any write carrying
 *     `degradationPreference`.
 * @param options.rejectMotion - Reject any write carrying
 *     `degradationPreference` or `maxFramerate`, leaving the bitrate cap alone.
 * @returns The sender plus readers for what it received.
 */
function fakeSender(
    options: {
        encodings?: RTCRtpEncodingParameters[];
        rejectDegradation?: boolean;
        rejectMotion?: boolean;
    } = {},
): {
    sender: RTCRtpSender;
    reads: () => number;
    applied: () => RTCRtpSendParameters[];
} {
    let handedOut: RTCRtpSendParameters | null = null;
    let reads = 0;
    const applied: RTCRtpSendParameters[] = [];
    const sender = {
        getParameters: vi.fn((): RTCRtpSendParameters => {
            reads += 1;
            const base = {
                transactionId: "t",
                codecs: [],
                headerExtensions: [],
                rtcp: {},
            } as unknown as RTCRtpSendParameters;
            if (options.encodings) base.encodings = options.encodings.map((e) => ({ ...e }));
            handedOut = base;
            return base;
        }),
        setParameters: vi.fn(async (parameters: RTCRtpSendParameters) => {
            if (parameters !== handedOut) throw new TypeError("parameters are not the last ones");
            const carriesDegradation = parameters.degradationPreference !== undefined;
            const carriesFramerate = (parameters.encodings ?? []).some(
                (encoding) => encoding.maxFramerate !== undefined,
            );
            if (options.rejectDegradation && carriesDegradation) {
                throw new TypeError("degradationPreference is not supported");
            }
            if (options.rejectMotion && (carriesDegradation || carriesFramerate)) {
                throw new TypeError("the sender refused the motion settings");
            }
            applied.push(parameters);
        }),
    } as unknown as RTCRtpSender;
    return { sender, reads: () => reads, applied: () => applied };
}

/**
 * Wrap senders as the transceiver list `applyQualityToLink` walks.
 *
 * @param senders - One per slot, in slot order. A hole is a slot whose
 *     transceiver was never allocated.
 * @returns The transceiver list.
 */
function fakeTransceivers(senders: readonly (RTCRtpSender | undefined)[]): RTCRtpTransceiver[] {
    return senders.map((sender) => ({ sender }) as unknown as RTCRtpTransceiver);
}

describe("applyQualityToLink", () => {
    const videoSlots: MeshSlot[] = [{ name: "cam", kind: "video" }];

    it("skips a slot whose transceiver was never allocated", async () => {
        const cam = fakeSender({ encodings: [{}] });
        const slots: MeshSlot[] = [
            { name: "cam", kind: "video" },
            { name: "screen", kind: "video" },
        ];

        await applyQualityToLink(
            fakeTransceivers([cam.sender]),
            slots,
            { video: { cam: 1200, screen: 3000 }, maxFramerate: 30 },
            "maintain-framerate",
        );

        expect(cam.applied()).toHaveLength(2);
    });

    it("lifts the cap when a slot is set to null instead of a number", async () => {
        const cam = fakeSender({ encodings: [{ maxBitrate: 900_000 }] });

        await applyQualityToLink(
            fakeTransceivers([cam.sender]),
            videoSlots,
            { video: { cam: null } },
            undefined,
        );

        expect(cam.applied()).toHaveLength(1);
        expect(cam.applied()[0]?.encodings?.[0]).not.toHaveProperty("maxBitrate");
    });

    it("multiplies the video cap into bits per second, unlike the audio one", async () => {
        const cam = fakeSender({ encodings: [{}] });
        const mic = fakeSender({ encodings: [{}] });

        await applyQualityToLink(
            fakeTransceivers([cam.sender, mic.sender]),
            [
                { name: "cam", kind: "video" },
                { name: "mic", kind: "audio" },
            ],
            { video: { cam: 1200 }, audio: { mic: 32_000 } },
            undefined,
        );

        expect(cam.applied()[0]?.encodings?.[0]?.maxBitrate).toBe(1_200_000);
        expect(mic.applied()[0]?.encodings?.[0]?.maxBitrate).toBe(32_000);
        expect(mic.applied()[0]?.degradationPreference).toBeUndefined();
    });

    it("writes the degradation preference and the frame ceiling onto every encoding", async () => {
        const cam = fakeSender({ encodings: [{}, {}] });

        await applyQualityToLink(
            fakeTransceivers([cam.sender]),
            videoSlots,
            { video: { cam: 1200 }, maxFramerate: 24 },
            "maintain-resolution",
        );

        const motion = cam.applied()[1];
        expect(motion?.degradationPreference).toBe("maintain-resolution");
        expect(motion?.encodings?.map((encoding) => encoding.maxFramerate)).toEqual([24, 24]);
    });

    it("writes the preference alone when the caller set no frame ceiling", async () => {
        const cam = fakeSender({ encodings: [{}] });

        await applyQualityToLink(
            fakeTransceivers([cam.sender]),
            videoSlots,
            { video: { cam: 1200 } },
            "maintain-resolution",
        );

        const motion = cam.applied()[1];
        expect(motion?.degradationPreference).toBe("maintain-resolution");
        expect(motion?.encodings?.[0]?.maxFramerate).toBeUndefined();
    });

    it("reads the parameters fresh for each write, because a stale object is refused", async () => {
        const cam = fakeSender({ encodings: [{}] });

        await applyQualityToLink(
            fakeTransceivers([cam.sender]),
            videoSlots,
            { video: { cam: 1200 }, maxFramerate: 30 },
            "maintain-framerate",
        );

        expect(cam.reads()).toBe(2);
        expect(cam.applied()).toHaveLength(2);
    });

    it("touches neither member when the caller resolved no motion settings", async () => {
        const cam = fakeSender({ encodings: [{}] });

        await applyQualityToLink(
            fakeTransceivers([cam.sender]),
            videoSlots,
            { video: { cam: 1200 } },
            undefined,
        );

        expect(cam.reads()).toBe(1);
        expect(cam.applied()[0]?.degradationPreference).toBeUndefined();
    });

    it("retries without the degradation preference, keeping the frame ceiling", async () => {
        const cam = fakeSender({ encodings: [{}], rejectDegradation: true });

        await applyQualityToLink(
            fakeTransceivers([cam.sender]),
            videoSlots,
            { video: { cam: 1200 }, maxFramerate: 30 },
            "maintain-framerate",
        );

        const retry = cam.applied().at(-1);
        expect(retry?.degradationPreference).toBeUndefined();
        expect(retry?.encodings?.[0]?.maxFramerate).toBe(30);
        expect(cam.reads()).toBe(3);
    });

    it("keeps the bitrate cap when the sender refuses both attempts", async () => {
        const cam = fakeSender({ encodings: [{}], rejectMotion: true });

        await expect(
            applyQualityToLink(
                fakeTransceivers([cam.sender]),
                videoSlots,
                { video: { cam: 1200 }, maxFramerate: 30 },
                "maintain-framerate",
            ),
        ).resolves.toBeUndefined();

        expect(cam.applied()).toHaveLength(1);
        expect(cam.applied()[0]?.encodings?.[0]?.maxBitrate).toBe(1_200_000);
    });

    it("survives a sender that reports no encodings at all", async () => {
        const cam = fakeSender();

        await applyQualityToLink(
            fakeTransceivers([cam.sender]),
            videoSlots,
            { video: { cam: 1200 }, maxFramerate: 30 },
            undefined,
        );

        expect(cam.applied().at(-1)?.encodings).toBeUndefined();
    });

    it("leaves a slot the caller named no cap for alone, audio or video", async () => {
        const cam = fakeSender({ encodings: [{ maxBitrate: 500_000 }] });
        const mic = fakeSender({ encodings: [{ maxBitrate: 32_000 }] });

        await applyQualityToLink(
            fakeTransceivers([cam.sender, mic.sender]),
            [
                { name: "cam", kind: "video" },
                { name: "mic", kind: "audio" },
            ],
            {},
            undefined,
        );

        expect(cam.applied()).toHaveLength(0);
        expect(mic.applied()).toHaveLength(0);
    });
});

describe("resolveDegradation — the slot the choice was about", () => {
    const asked = (over: Partial<MeshQuality> = {}): MeshQuality => ({
        degradationPreference: "maintain-framerate",
        fluidFloorKbps: 900,
        ...over,
    });

    /**
     * The case that opened the issue. Somebody who picked fluidity was thinking
     * about the screen — code, a spreadsheet, a video at 60 fps. With the
     * largest cap answering, a call with only a camera on has that choice
     * decided by a stream it was never about.
     */
    it("lets the anchor decide alone, even when a bigger cap sits beside it", () => {
        expect(
            resolveDegradation(asked({ degradationAnchor: "cam" }), {
                video: { screen: 3000, cam: 300 },
            }),
        ).toBe("maintain-resolution");

        expect(
            resolveDegradation(asked({ degradationAnchor: "screen" }), {
                video: { screen: 3000, cam: 300 },
            }),
        ).toBe("maintain-framerate");
    });

    it("keeps the preference when the caps say nothing about the anchor", () => {
        expect(
            resolveDegradation(asked({ degradationAnchor: "screen" }), { video: { cam: 300 } }),
        ).toBe("maintain-framerate");
    });

    it("reads an uncapped anchor as unbounded", () => {
        expect(
            resolveDegradation(asked({ degradationAnchor: "screen" }), {
                video: { screen: null, cam: 300 },
            }),
        ).toBe("maintain-framerate");
    });

    it("overrides when the anchor itself fell below the floor", () => {
        expect(
            resolveDegradation(asked({ degradationAnchor: "screen" }), {
                video: { screen: 500 },
            }),
        ).toBe("maintain-resolution");
    });

    it("ignores the anchor for a preference that was never maintain-framerate", () => {
        expect(
            resolveDegradation(
                asked({ degradationAnchor: "screen", degradationPreference: "balanced" }),
                { video: { screen: 100 } },
            ),
        ).toBe("balanced");
    });

    it("keeps the preference when there is no video at all to anchor on", () => {
        expect(resolveDegradation(asked({ degradationAnchor: "screen" }), {})).toBe(
            "maintain-framerate",
        );
    });
});
