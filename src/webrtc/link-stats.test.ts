import { describe, expect, it, vi } from "vitest";

import { createLinkStatsSampler, readRoundTripMs } from "./link-stats";

/**
 * A stats report double.
 *
 * `RTCStatsReport` is a `Map` with an id key, and every reducer here only ever
 * calls `forEach` — so a plain `Map` is the real thing for these purposes, with
 * none of the browser needed.
 */
function report(entries: Record<string, unknown>[]): RTCStatsReport {
    const map = new Map<string, unknown>();
    for (const [index, entry] of entries.entries()) {
        const id = typeof entry.id === "string" ? entry.id : `entry-${index}`;
        map.set(id, entry);
    }
    return map as unknown as RTCStatsReport;
}

function outbound(over: Record<string, unknown> = {}): Record<string, unknown> {
    return { type: "outbound-rtp", kind: "video", bytesSent: 0, ...over };
}

describe("readRoundTripMs", () => {
    it("reads the pair the transport selected, not the first succeeded one", () => {
        const rtt = readRoundTripMs(
            report([
                {
                    id: "host",
                    type: "candidate-pair",
                    state: "succeeded",
                    currentRoundTripTime: 0.008,
                },
                {
                    id: "relay",
                    type: "candidate-pair",
                    state: "succeeded",
                    currentRoundTripTime: 0.18,
                },
                { id: "t", type: "transport", selectedCandidatePairId: "relay" },
            ]),
        );

        expect(rtt).toBe(180);
    });

    it("falls back to a succeeded pair when the browser names no selected one", () => {
        const rtt = readRoundTripMs(
            report([
                {
                    id: "failed",
                    type: "candidate-pair",
                    state: "failed",
                    currentRoundTripTime: 0.9,
                },
                {
                    id: "ok",
                    type: "candidate-pair",
                    state: "succeeded",
                    currentRoundTripTime: 0.042,
                },
            ]),
        );

        expect(rtt).toBe(42);
    });

    it("ignores a selected id that names a pair carrying no timing", () => {
        const rtt = readRoundTripMs(
            report([
                { id: "selected", type: "candidate-pair", state: "succeeded" },
                {
                    id: "other",
                    type: "candidate-pair",
                    state: "succeeded",
                    currentRoundTripTime: 0.03,
                },
                { id: "t", type: "transport", selectedCandidatePairId: "selected" },
            ]),
        );

        expect(rtt).toBe(30);
    });

    it("returns null before any pair reports a round trip", () => {
        expect(readRoundTripMs(report([{ id: "t", type: "transport" }]))).toBeNull();
        expect(readRoundTripMs(report([]))).toBeNull();
    });
});

describe("createLinkStatsSampler", () => {
    it("reports no rate on the first sample, because there is no delta yet", () => {
        const sampler = createLinkStatsSampler();

        const stats = sampler.read(report([outbound({ bytesSent: 1_000_000 })]));

        expect(stats.kbps).toBe(0);
    });

    it("derives the rate from the delta, not from the cumulative counter", () => {
        vi.useFakeTimers();
        try {
            const sampler = createLinkStatsSampler();
            sampler.read(report([outbound({ bytesSent: 10_000_000 })]));

            vi.advanceTimersByTime(2000);
            const stats = sampler.read(report([outbound({ bytesSent: 10_250_000 })]));

            expect(stats.kbps).toBe(1000);
        } finally {
            vi.useRealTimers();
        }
    });

    it("sums every sender, because one uplink carries the camera and the screen", () => {
        vi.useFakeTimers();
        try {
            const sampler = createLinkStatsSampler();
            sampler.read(
                report([
                    outbound({ id: "cam", bytesSent: 0 }),
                    outbound({ id: "screen", bytesSent: 0 }),
                ]),
            );

            vi.advanceTimersByTime(1000);
            const stats = sampler.read(
                report([
                    outbound({ id: "cam", bytesSent: 50_000 }),
                    outbound({ id: "screen", bytesSent: 75_000 }),
                ]),
            );

            expect(stats.kbps).toBe(1000);
        } finally {
            vi.useRealTimers();
        }
    });

    it("takes resolution from the largest stream, not the last one reported", () => {
        const sampler = createLinkStatsSampler();

        const stats = sampler.read(
            report([
                outbound({
                    id: "screen",
                    bytesSent: 1,
                    frameWidth: 1920,
                    frameHeight: 1080,
                    framesPerSecond: 30,
                }),
                outbound({
                    id: "cam",
                    bytesSent: 1,
                    frameWidth: 640,
                    frameHeight: 360,
                    framesPerSecond: 24,
                }),
            ]),
        );

        expect(stats).toMatchObject({ width: 1920, height: 1080, fps: 30 });
    });

    it("clamps a counter that went backwards after an ICE restart", () => {
        vi.useFakeTimers();
        try {
            const sampler = createLinkStatsSampler();
            sampler.read(report([outbound({ bytesSent: 5_000_000 })]));

            vi.advanceTimersByTime(2000);
            const stats = sampler.read(report([outbound({ bytesSent: 12_000 })]));

            expect(stats.kbps).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it("counts audio when asked, and ignores video while doing it", () => {
        vi.useFakeTimers();
        try {
            const sampler = createLinkStatsSampler({ kind: "audio" });
            sampler.read(
                report([
                    outbound({ id: "mic", kind: "audio", bytesSent: 0 }),
                    outbound({ id: "cam", bytesSent: 0 }),
                ]),
            );

            vi.advanceTimersByTime(1000);
            const stats = sampler.read(
                report([
                    outbound({ id: "mic", kind: "audio", bytesSent: 6_000 }),
                    outbound({ id: "cam", bytesSent: 900_000 }),
                ]),
            );

            expect(stats.kbps).toBe(48);
        } finally {
            vi.useRealTimers();
        }
    });

    it("counts everything under kind: all", () => {
        vi.useFakeTimers();
        try {
            const sampler = createLinkStatsSampler({ kind: "all" });
            sampler.read(
                report([
                    outbound({ id: "mic", kind: "audio", bytesSent: 0 }),
                    outbound({ id: "cam", bytesSent: 0 }),
                ]),
            );

            vi.advanceTimersByTime(1000);
            const stats = sampler.read(
                report([
                    outbound({ id: "mic", kind: "audio", bytesSent: 6_000 }),
                    outbound({ id: "cam", bytesSent: 119_000 }),
                ]),
            );

            expect(stats.kbps).toBe(1000);
        } finally {
            vi.useRealTimers();
        }
    });

    it("reads mediaType, which is what older Chrome reports instead of kind", () => {
        vi.useFakeTimers();
        try {
            const sampler = createLinkStatsSampler();
            sampler.read(report([{ type: "outbound-rtp", mediaType: "video", bytesSent: 0 }]));

            vi.advanceTimersByTime(1000);
            const stats = sampler.read(
                report([{ type: "outbound-rtp", mediaType: "video", bytesSent: 125_000 }]),
            );

            expect(stats.kbps).toBe(1000);
        } finally {
            vi.useRealTimers();
        }
    });

    it("keeps the last resolution when a report carries no sender at all", () => {
        const sampler = createLinkStatsSampler();
        sampler.read(
            report([
                outbound({ bytesSent: 1, frameWidth: 1280, frameHeight: 720, framesPerSecond: 60 }),
            ]),
        );

        const stats = sampler.read(
            report([
                { id: "t", type: "transport", selectedCandidatePairId: "p" },
                { id: "p", type: "candidate-pair", state: "succeeded", currentRoundTripTime: 0.05 },
            ]),
        );

        expect(stats).toMatchObject({ width: 1280, height: 720, fps: 60, rttMs: 50 });
    });

    it("does not derive a rate across the gap a reset marks", () => {
        vi.useFakeTimers();
        try {
            const sampler = createLinkStatsSampler();
            sampler.read(report([outbound({ bytesSent: 0, frameWidth: 640, frameHeight: 360 })]));
            vi.advanceTimersByTime(1000);
            sampler.read(report([outbound({ bytesSent: 125_000 })]));

            sampler.reset();
            vi.advanceTimersByTime(300_000);
            const stats = sampler.read(report([outbound({ bytesSent: 40_000_000 })]));

            expect(stats.kbps).toBe(0);
            expect(stats.width).toBe(640);
        } finally {
            vi.useRealTimers();
        }
    });

    it("fetches the report itself when handed a connection", async () => {
        const sampler = createLinkStatsSampler();
        const connection = {
            getStats: vi.fn(async () =>
                report([outbound({ bytesSent: 10, frameWidth: 320, frameHeight: 180 })]),
            ),
        } as unknown as RTCPeerConnection;

        const stats = await sampler.sample(connection);

        expect(connection.getStats).toHaveBeenCalledTimes(1);
        expect(stats.width).toBe(320);
    });
});

describe("createLinkStatsSampler resilience", () => {
    it("ignores an entry that is not an object at all", () => {
        const map = new Map<string, unknown>();
        map.set("weird", null);
        map.set("also-weird", "outbound-rtp");
        map.set("out", {
            type: "outbound-rtp",
            kind: "video",
            bytesSent: 10,
            frameWidth: 640,
            frameHeight: 360,
        });

        const stats = createLinkStatsSampler().read(map as unknown as RTCStatsReport);

        expect(stats.width).toBe(640);
    });

    it("treats a sender reporting no byte counter as zero", () => {
        vi.useFakeTimers();
        try {
            const sampler = createLinkStatsSampler();
            sampler.read(report([{ type: "outbound-rtp", kind: "video" }]));

            vi.advanceTimersByTime(1000);
            const stats = sampler.read(report([{ type: "outbound-rtp", kind: "video" }]));

            expect(stats.kbps).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it("ignores a non-numeric counter the browser had no business sending", () => {
        vi.useFakeTimers();
        try {
            const sampler = createLinkStatsSampler();
            sampler.read(report([outbound({ bytesSent: 0 })]));

            vi.advanceTimersByTime(1000);
            const stats = sampler.read(
                report([{ type: "outbound-rtp", kind: "video", bytesSent: Number.NaN }]),
            );

            expect(stats.kbps).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });
});
