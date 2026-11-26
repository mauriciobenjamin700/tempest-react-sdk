import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { drainPerHour } from "./battery";
import { createPerfMonitor } from "./monitor";
import type { InteractionReport } from "./monitor-types";
import { worsePressure } from "./pressure";
import { perfReportToEvent } from "./to-event";
import { usePerfMonitor } from "./use-perf-monitor";

let now = 0;

/** Fake `PerformanceObserver` that tests feed by entry type. */
class FakeObserver {
    static supportedEntryTypes: string[] = [];
    static instances: FakeObserver[] = [];
    type = "";
    pending: PerformanceEntry[] = [];
    disconnected = false;
    init: PerformanceObserverInit | null = null;

    constructor(private readonly callback: (list: { getEntries(): PerformanceEntry[] }) => void) {
        FakeObserver.instances.push(this);
    }

    observe(init: PerformanceObserverInit): void {
        this.type = init.type ?? "";
        this.init = init;
    }

    takeRecords(): PerformanceEntry[] {
        const taken = this.pending;
        this.pending = [];
        return taken;
    }

    disconnect(): void {
        this.disconnected = true;
    }

    deliver(entries: object[]): void {
        this.callback({ getEntries: () => entries as PerformanceEntry[] });
    }

    static of(type: string): FakeObserver {
        const found = FakeObserver.instances.find((o) => o.type === type);
        if (!found) throw new Error(`no observer for ${type}`);
        return found;
    }
}

/** Fake `PressureObserver`. */
class FakePressure {
    static instance: FakePressure | null = null;
    static reject = false;
    disconnected = false;
    options: unknown = null;

    constructor(readonly callback: (records: { state: string; time: number }[]) => void) {
        FakePressure.instance = this;
    }

    observe(_source: string, options: unknown): Promise<void> {
        this.options = options;
        return FakePressure.reject ? Promise.reject(new Error("blocked")) : Promise.resolve();
    }

    disconnect(): void {
        this.disconnected = true;
    }
}

/** Fake `BatteryManager`. */
class FakeBattery extends EventTarget {
    level = 0.8;
    charging = false;

    set(level: number, charging = this.charging): void {
        const chargingChanged = charging !== this.charging;
        this.charging = charging;
        if (chargingChanged) this.dispatchEvent(new Event("chargingchange"));
        if (level !== this.level) {
            this.level = level;
            this.dispatchEvent(new Event("levelchange"));
        }
    }
}

/**
 * Install every fake.
 *
 * @param types Entry types the fake observer claims to support.
 * @returns The fake battery.
 */
function installBrowser(
    types: string[] = ["long-animation-frame", "longtask", "event"],
): FakeBattery {
    FakeObserver.supportedEntryTypes = types;
    vi.stubGlobal("PerformanceObserver", FakeObserver);
    vi.stubGlobal("PressureObserver", FakePressure);
    const battery = new FakeBattery();
    Object.defineProperty(navigator, "getBattery", {
        configurable: true,
        value: () => Promise.resolve(battery),
    });
    return battery;
}

const flush = (): Promise<void> => act(async () => {});

beforeEach(() => {
    now = 0;
    FakeObserver.instances = [];
    FakePressure.instance = null;
    FakePressure.reject = false;
    vi.spyOn(performance, "now").mockImplementation(() => now);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (navigator as { getBattery?: unknown }).getBattery;
});

describe("createPerfMonitor traces", () => {
    it("times nested steps with their path, depth and offset from the trace start", async () => {
        const monitor = createPerfMonitor({ devtools: false });
        now = 100;
        const trace = monitor.trace("checkout");
        now = 110;
        await trace.span("pay", async (step) => {
            now = 120;
            await step.span("tokenize", async () => {
                now = 150;
            });
            step.spanSync("charge", () => {
                now = 190;
            });
        });
        now = 200;
        const report = await trace.end();

        expect(report.totalMs).toBe(100);
        expect(report.spans.map((s) => [s.path, s.depth, s.startMs, s.durationMs])).toEqual([
            ["pay", 0, 10, 80],
            ["pay/tokenize", 1, 20, 30],
            ["pay/charge", 1, 50, 40],
        ]);
        expect(report.failed).toBe(false);
    });

    it("lists a parent before the child it opened in the same millisecond", async () => {
        const monitor = createPerfMonitor({ devtools: false });
        const trace = monitor.trace("checkout");
        await trace.span("pay", async (step) => {
            await step.span("tokenize", async () => {
                now = 10;
            });
        });
        expect((await trace.end()).spans.map((s) => s.path)).toEqual(["pay", "pay/tokenize"]);
    });

    it("flags a step that throws, rethrows the error and marks the report failed", async () => {
        const monitor = createPerfMonitor({ devtools: false });
        const trace = monitor.trace("upload");
        await expect(
            trace.span("put", async () => {
                throw new Error("offline");
            }),
        ).rejects.toThrow("offline");
        expect(() =>
            trace.spanSync("parse", () => {
                throw new Error("bad");
            }),
        ).toThrow("bad");
        const report = await trace.end();
        expect(report.spans.every((s) => s.failed)).toBe(true);
        expect(report.failed).toBe(true);
    });

    it("places a mark as a step ending at the moment it is recorded", async () => {
        const monitor = createPerfMonitor({ devtools: false });
        const trace = monitor.trace("detect");
        now = 80;
        trace.mark("server", 30);
        now = 90;
        const report = await trace.end();
        expect(report.spans[0]).toMatchObject({ path: "server", startMs: 50, durationMs: 30 });
    });

    it("joins nested marks under their parent path", async () => {
        const monitor = createPerfMonitor({ devtools: false });
        const trace = monitor.trace("detect");
        await trace.span("predict", async (step) => step.mark("forward", 5));
        expect((await trace.end()).spans.map((s) => s.path)).toContain("predict/forward");
    });

    it("returns the same report on a second end and ignores later steps", async () => {
        const monitor = createPerfMonitor({ devtools: false });
        const trace = monitor.trace("search");
        const first = await trace.end();
        trace.mark("late", 10);
        expect(await trace.end()).toBe(first);
        expect(first.spans).toHaveLength(0);
    });

    it("writes each step to a DevTools track and clears the entry", async () => {
        const measure = vi
            .spyOn(performance, "measure")
            .mockImplementation(() => undefined as never);
        const clear = vi.spyOn(performance, "clearMeasures");
        const monitor = createPerfMonitor();
        const trace = monitor.trace("checkout");
        now = 10;
        await trace.span("pay", async () => {
            now = 30;
        });
        expect(measure).toHaveBeenCalledWith("checkout › pay", {
            start: 10,
            end: 30,
            detail: {
                devtools: {
                    dataType: "track-entry",
                    track: "checkout",
                    trackGroup: "Tempest",
                    color: "primary",
                },
            },
        });
        expect(clear).toHaveBeenCalledWith("checkout › pay");
    });

    it("keeps timing when the browser rejects the DevTools measure", async () => {
        vi.spyOn(performance, "measure").mockImplementation(() => {
            throw new TypeError("detail not cloneable");
        });
        const monitor = createPerfMonitor();
        const trace = monitor.trace("x");
        await trace.span("a", async () => undefined);
        expect((await trace.end()).spans).toHaveLength(1);
    });

    it("does not touch the user-timing buffer with devtools off", async () => {
        const measure = vi.spyOn(performance, "measure");
        const trace = createPerfMonitor({ devtools: false }).trace("x");
        await trace.span("a", async () => undefined);
        expect(measure).not.toHaveBeenCalled();
    });
});

describe("createPerfMonitor main-thread cost", () => {
    it("charges each step only the overlapping part of long animation frames", async () => {
        installBrowser();
        const monitor = createPerfMonitor({ devtools: false });
        const loaf = FakeObserver.of("long-animation-frame");
        expect(loaf.init).toMatchObject({ buffered: true });

        const trace = monitor.trace("render");
        await trace.span("a", async () => {
            now = 100;
        });
        await trace.span("b", async () => {
            now = 200;
        });
        loaf.deliver([{ startTime: 80, duration: 60 }]);
        loaf.pending = [{ startTime: 190, duration: 50 } as PerformanceEntry];
        now = 250;
        const report = await trace.end();

        expect(report.spans.map((s) => s.longFrameMs)).toEqual([20, 50]);
        expect(report.cpu).toMatchObject({ longFrameMs: 110, longFrames: 2 });
        expect(monitor.getSnapshot().support.longFrames).toBe("long-animation-frame");
    });

    it("falls back to longtask where long animation frames are missing", () => {
        installBrowser(["longtask"]);
        const monitor = createPerfMonitor();
        expect(monitor.getSnapshot().support.longFrames).toBe("longtask");
        expect(FakeObserver.of("longtask")).toBeDefined();
    });

    it("keeps only the most recent long frames", async () => {
        installBrowser();
        const monitor = createPerfMonitor({ devtools: false });
        FakeObserver.of("long-animation-frame").deliver(
            Array.from({ length: 600 }, (_, i) => ({ startTime: i * 100, duration: 60 })),
        );
        const trace = monitor.trace("old");
        now = 10_000;
        expect((await trace.end()).cpu.longFrames).toBe(0);
    });

    it("reports null main-thread cost where neither entry type exists", async () => {
        installBrowser([]);
        const monitor = createPerfMonitor({ devtools: false });
        const trace = monitor.trace("x");
        await trace.span("a", async () => undefined);
        const report = await trace.end();
        expect(report.cpu).toEqual({ longFrameMs: null, longFrames: null, peakPressure: null });
        expect(report.spans[0]?.longFrameMs).toBeNull();
    });
});

describe("createPerfMonitor CPU pressure", () => {
    it("reports the worst state in effect during the trace, including the one it started in", async () => {
        installBrowser();
        const monitor = createPerfMonitor({ devtools: false, pressureIntervalMs: 500 });
        const pressure = FakePressure.instance as FakePressure;
        expect(pressure.options).toEqual({ sampleInterval: 500 });

        pressure.callback([{ state: "fair", time: 5 }]);
        now = 10;
        const trace = monitor.trace("infer");
        pressure.callback([
            { state: "serious", time: 20 },
            { state: "nominal", time: 30 },
            { state: "critical", time: 99 },
        ]);
        now = 40;
        expect((await trace.end()).cpu.peakPressure).toBe("serious");
        expect(monitor.getSnapshot().pressure).toBe("critical");
    });

    it("carries the state in effect when nothing changed during the trace", async () => {
        installBrowser();
        const monitor = createPerfMonitor({ devtools: false });
        FakePressure.instance?.callback([{ state: "fair", time: 1 }]);
        now = 50;
        const trace = monitor.trace("x");
        now = 60;
        expect((await trace.end()).cpu.peakPressure).toBe("fair");
    });

    it("notifies only when the state changes", () => {
        installBrowser();
        const monitor = createPerfMonitor();
        const listener = vi.fn();
        monitor.subscribe(listener);
        FakePressure.instance?.callback([{ state: "fair", time: 1 }]);
        FakePressure.instance?.callback([{ state: "fair", time: 2 }]);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("stays null when the permissions policy refuses observation", async () => {
        installBrowser();
        FakePressure.reject = true;
        const monitor = createPerfMonitor();
        await flush();
        expect(FakePressure.instance?.disconnected).toBe(true);
        expect(monitor.getSnapshot().pressure).toBeNull();
        expect(monitor.getSnapshot().support.pressure).toBe(true);
    });

    it("orders states from nominal to critical", () => {
        expect(worsePressure("fair", "serious")).toBe("serious");
        expect(worsePressure("critical", "nominal")).toBe("critical");
    });
});

describe("createPerfMonitor battery", () => {
    it("measures the drain rate edge to edge while unplugged", async () => {
        const battery = installBrowser();
        const monitor = createPerfMonitor();
        await flush();
        expect(monitor.getSnapshot().battery).toMatchObject({
            level: 0.8,
            charging: false,
            drainPerHour: null,
        });

        now = 60_000;
        battery.set(0.79);
        expect(monitor.getSnapshot().battery?.drainPerHour).toBeNull();
        now = 60_000 + 30 * 60_000;
        battery.set(0.77);
        expect(monitor.getSnapshot().battery?.drainPerHour).toBeCloseTo(4, 5);
    });

    it("restarts the measurement after every plug or unplug", async () => {
        const battery = installBrowser();
        const monitor = createPerfMonitor();
        await flush();
        battery.set(0.79);
        now = 1_000_000;
        battery.set(0.78);
        expect(monitor.getSnapshot().battery?.drainPerHour).not.toBeNull();
        battery.set(0.79, true);
        expect(monitor.getSnapshot().battery).toMatchObject({ charging: true, drainPerHour: null });
        battery.set(0.79, false);
        expect(monitor.getSnapshot().battery?.drainPerHour).toBeNull();
    });

    it("records the battery at the start and end of each trace", async () => {
        const battery = installBrowser();
        const monitor = createPerfMonitor({ devtools: false });
        await flush();
        const trace = monitor.trace("x");
        now = 5;
        battery.set(0.79);
        const report = await trace.end();
        expect(report.battery.start).toEqual({ level: 0.8, charging: false, at: 0 });
        expect(report.battery.end).toEqual({ level: 0.79, charging: false, at: 5 });
    });

    it("refuses to divide by a zero or negative span", () => {
        expect(drainPerHour([{ level: 0.5, at: 0 }])).toBeNull();
        expect(
            drainPerHour([
                { level: 0.5, at: 10 },
                { level: 0.5, at: 20 },
            ]),
        ).toBeNull();
        expect(
            drainPerHour([
                { level: 0.5, at: 10 },
                { level: 0.4, at: 10 },
            ]),
        ).toBeNull();
    });

    it("ignores a battery promise that resolves after stop", async () => {
        const battery = installBrowser();
        const monitor = createPerfMonitor();
        monitor.stop();
        await flush();
        battery.set(0.5);
        expect(monitor.getSnapshot().battery).toBeNull();
    });

    it("stays null when getBattery rejects", async () => {
        installBrowser();
        Object.defineProperty(navigator, "getBattery", {
            configurable: true,
            value: () => Promise.reject(new Error("denied")),
        });
        const monitor = createPerfMonitor();
        await flush();
        expect(monitor.getSnapshot().battery).toBeNull();
    });
});

describe("createPerfMonitor input latency", () => {
    const click = {
        name: "click",
        interactionId: 7,
        startTime: 100,
        processingStart: 130,
        processingEnd: 170,
        duration: 96,
    };

    it("splits a gesture into input delay, handler time and paint", () => {
        installBrowser();
        const monitor = createPerfMonitor();
        const events = FakeObserver.of("event");
        expect(events.init).toMatchObject({ durationThreshold: 16, buffered: true });
        events.deliver([click]);
        expect(monitor.getSnapshot().inputs[0]).toEqual({
            interactionId: 7,
            type: "click",
            startTime: 100,
            inputDelayMs: 30,
            processingMs: 40,
            presentationMs: 26,
            durationMs: 96,
        });
    });

    it("keeps the slowest event of a gesture and skips non-interaction events", () => {
        installBrowser();
        const monitor = createPerfMonitor();
        const events = FakeObserver.of("event");
        events.deliver([
            { ...click, name: "pointerdown", duration: 40 },
            { ...click, interactionId: 0, name: "mousemove", duration: 400 },
        ]);
        events.deliver([click, { ...click, name: "pointerup", duration: 16 }]);
        const inputs = monitor.getSnapshot().inputs;
        expect(inputs).toHaveLength(1);
        expect(inputs[0]?.type).toBe("click");
    });

    it("breaks a duration tie in favour of the event whose handlers did the work", () => {
        installBrowser();
        const monitor = createPerfMonitor();
        FakeObserver.of("event").deliver([
            { ...click, name: "pointerdown", processingStart: 101, processingEnd: 104 },
            click,
            { ...click, name: "pointerup", processingStart: 101, processingEnd: 102 },
        ]);
        expect(monitor.getSnapshot().inputs[0]).toMatchObject({ type: "click", processingMs: 40 });
    });

    it("clamps a negative paint phase caused by the 8 ms rounding", () => {
        installBrowser();
        const monitor = createPerfMonitor();
        FakeObserver.of("event").deliver([{ ...click, duration: 64 }]);
        expect(monitor.getSnapshot().inputs[0]?.presentationMs).toBe(0);
    });

    it("pairs a trace started inside a handler with its gesture", async () => {
        installBrowser();
        const monitor = createPerfMonitor({ devtools: false });
        now = 150;
        const trace = monitor.trace("save");
        FakeObserver.of("event").pending = [click as unknown as PerformanceEntry];
        now = 400;
        expect((await trace.end()).input?.interactionId).toBe(7);
    });

    it("leaves input null for a trace started outside any handler", async () => {
        installBrowser();
        const monitor = createPerfMonitor({ devtools: false });
        FakeObserver.of("event").deliver([click]);
        now = 500;
        const trace = monitor.trace("poll");
        expect((await trace.end()).input).toBeNull();
    });

    it("keeps historySize gestures and reports", async () => {
        installBrowser();
        const monitor = createPerfMonitor({ historySize: 2, devtools: false });
        FakeObserver.of("event").deliver(
            [1, 2, 3].map((id) => ({ ...click, interactionId: id, startTime: id })),
        );
        expect(monitor.getSnapshot().inputs.map((i) => i.interactionId)).toEqual([3, 2]);
        for (const name of ["a", "b", "c"]) await monitor.trace(name).end();
        expect(monitor.getSnapshot().reports.map((r) => r.name)).toEqual(["c", "b"]);
    });
});

describe("createPerfMonitor reporting and lifecycle", () => {
    it("hands reports to onReport according to sampleRate", async () => {
        const onReport = vi.fn();
        const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
        const monitor = createPerfMonitor({ onReport, sampleRate: 0.4, devtools: false });
        await monitor.trace("dropped").end();
        random.mockReturnValue(0.3);
        await monitor.trace("kept").end();
        expect(onReport).toHaveBeenCalledTimes(1);
        expect(onReport.mock.calls[0]?.[0].name).toBe("kept");
        expect(monitor.getSnapshot().reports).toHaveLength(2);
    });

    it("keeps the snapshot identity until something changes", async () => {
        const monitor = createPerfMonitor({ devtools: false });
        const first = monitor.getSnapshot();
        expect(monitor.getSnapshot()).toBe(first);
        await monitor.trace("x").end();
        expect(monitor.getSnapshot()).not.toBe(first);
    });

    it("stops notifying an unsubscribed listener", async () => {
        const monitor = createPerfMonitor({ devtools: false });
        const listener = vi.fn();
        const unsubscribe = monitor.subscribe(listener);
        unsubscribe();
        await monitor.trace("x").end();
        expect(listener).not.toHaveBeenCalled();
    });

    it("disconnects every observer on stop", () => {
        installBrowser();
        const monitor = createPerfMonitor();
        monitor.stop();
        expect(FakeObserver.instances.every((o) => o.disconnected)).toBe(true);
        expect(FakePressure.instance?.disconnected).toBe(true);
    });

    it("works with no fake at all, reporting every withheld source as null", async () => {
        vi.restoreAllMocks();
        const monitor = createPerfMonitor({ devtools: false });
        const trace = monitor.trace("plain");
        await trace.span("a", async () => undefined);
        const report = await trace.end();
        expect(report.spans).toHaveLength(1);
        expect(report.battery).toEqual({ start: null, end: null });
        expect(report.input).toBeNull();
        expect(monitor.getSnapshot().support).toEqual({
            battery: false,
            pressure: false,
            longFrames: null,
            eventTiming: false,
        });
    });
});

describe("perfReportToEvent", () => {
    const report: InteractionReport = {
        name: "checkout",
        startTime: 0,
        totalMs: 120.4,
        spans: [
            {
                name: "retry",
                path: "pay/retry",
                depth: 1,
                startMs: 0,
                durationMs: 10.4,
                longFrameMs: 0,
                failed: true,
            },
            {
                name: "retry",
                path: "pay/retry",
                depth: 1,
                startMs: 20,
                durationMs: 20.3,
                longFrameMs: 0,
                failed: false,
            },
        ],
        cpu: { longFrameMs: 55.6, longFrames: 1, peakPressure: "fair" },
        battery: { start: null, end: { level: 0.5, charging: false, at: 1 } },
        input: {
            interactionId: 1,
            type: "click",
            startTime: 0,
            inputDelayMs: 4,
            processingMs: 10,
            presentationMs: 12,
            durationMs: 24,
        },
        device: { hardwareConcurrency: 8, deviceMemoryGb: 4, jsHeapUsedMb: 10 },
        failed: true,
        measuredAt: 1,
    };

    it("flattens the report into properties an analytics backend can chart", () => {
        expect(perfReportToEvent(report)).toEqual({
            name: "perf.interaction",
            properties: {
                interaction: "checkout",
                totalMs: 120,
                failed: true,
                longFrameMs: 56,
                longFrames: 1,
                peakPressure: "fair",
                batteryLevel: 0.5,
                charging: false,
                inputType: "click",
                inputDelayMs: 4,
                processingMs: 10,
                presentationMs: 12,
                hardwareConcurrency: 8,
                deviceMemoryGb: 4,
                "span.pay/retry.ms": 31,
            },
        });
    });

    it("keeps withheld values null instead of zero and accepts an event name", () => {
        const event = perfReportToEvent(
            {
                ...report,
                spans: [],
                cpu: { longFrameMs: null, longFrames: null, peakPressure: null },
                battery: { start: null, end: null },
                input: null,
            },
            "app.perf",
        );
        expect(event.name).toBe("app.perf");
        expect(event.properties).toMatchObject({
            longFrameMs: null,
            batteryLevel: null,
            charging: null,
            inputDelayMs: null,
        });
    });
});

describe("usePerfMonitor", () => {
    it("re-renders with each new snapshot", async () => {
        const monitor = createPerfMonitor({ devtools: false });
        const { result } = renderHook(() => usePerfMonitor(monitor));
        expect(result.current.reports).toHaveLength(0);
        await act(async () => {
            await monitor.trace("x").end();
        });
        expect(result.current.reports[0]?.name).toBe("x");
    });
});
