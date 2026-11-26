# Interaction performance: steps, CPU and battery

When someone says *"the app heats up my phone"* or *"checkout froze"*, you need
three answers: **how long each step took**, **how hard the CPU worked** and **how
much battery it cost**. `createPerfMonitor` puts all three in the same report, the
same way in development and in production. 🔋

!!! info "What the browser lets you measure"
    No web API exposes joules, CPU time or FLOPs. The monitor uses what **does**
    exist and returns `null` for the rest — never a made-up number.

| Measure | Source | Chrome/Android | Safari/iOS | Firefox |
| --- | --- | --- | --- | --- |
| Time per step | `performance.now()` | ✅ | ✅ | ✅ |
| Main thread frozen | `long-animation-frame` (or `longtask`) | ✅ | — | — |
| CPU pressure | Compute Pressure (`PressureObserver`) | ✅ | — | — |
| Input latency | Event Timing (`event`) | ✅ | ✅ | ✅ |
| Battery | Battery Status (`getBattery`) | ✅ | — | — |

Probed on Chromium 159 with Playwright (`PerformanceObserver.supportedEntryTypes`,
`typeof navigator.getBattery`, `typeof PressureObserver`) on 2026-11-26.

## 1. Create a monitor, once

```typescript
import { createPerfMonitor } from "tempest-react-sdk";

export const perf = createPerfMonitor();
```

Create it **outside React, at app start**. Observers only see what happens after
they exist (plus the small buffer the browser keeps), and a monitor re-created on
every render loses its history.

## 2. Measure an interaction, step by step

```typescript
import { createPerfMonitor } from "tempest-react-sdk";

const perf = createPerfMonitor();

async function checkout(): Promise<void> {
    const trace = perf.trace("checkout");

    trace.spanSync("validate", () => true);

    await trace.span("pay", async (step) => {
        await step.span("tokenize", async () => "tok_123");
        await step.span("charge", async () => "ok");
    });

    const report = await trace.end();
    console.log(report.spans);
    // [
    //   { path: "validate",     depth: 0, startMs: 0,   durationMs: 3,   longFrameMs: 0 },
    //   { path: "pay",          depth: 0, startMs: 3,   durationMs: 410, longFrameMs: 0 },
    //   { path: "pay/tokenize", depth: 1, startMs: 3,   durationMs: 160, longFrameMs: 0 },
    //   { path: "pay/charge",   depth: 1, startMs: 163, durationMs: 250, longFrameMs: 0 },
    // ]
}
```

| Method | For |
| --- | --- |
| `span(name, fn)` | Async step. `fn` receives a scope for sub-steps |
| `spanSync(name, fn)` | Sync step, same |
| `mark(name, ms)` | A duration measured elsewhere (`Server-Timing`, `/vision`'s `speed`), placed ending now |
| `end()` | Closes and returns the report. Calling it again returns the same one |

A step that throws is recorded with `failed: true` and the error **keeps going**
to the caller. The whole report becomes `failed: true`.

!!! tip "Start the trace inside the handler"
    `perf.trace()` called inside `onClick` pairs the report with the gesture that
    fired it: `report.input` carries input delay, handler time and time to paint.
    Outside a handler (polling, timers), `input` stays `null`.

## 3. Computational cost

```typescript
import { createPerfMonitor } from "tempest-react-sdk";

const perf = createPerfMonitor();

async function build(): Promise<void> {
    const trace = perf.trace("report");
    await trace.span("assemble", async () => [1, 2, 3].map((n) => n * 2));
    const { cpu, spans } = await trace.end();

    console.log(cpu.longFrameMs); // 240   — ms the screen did not respond
    console.log(cpu.longFrames); // 3      — how many frames ≥ 50 ms
    console.log(cpu.peakPressure); // "serious" — worst CPU state in the window
    console.log(spans[0]?.longFrameMs); // this step's share
}
```

- **`longFrameMs`** adds up the long frames (≥ 50 ms) **overlapping** the step,
  counting only the overlapping part. It is the cost the user feels as a frozen
  screen. Work in a Worker or in onnxruntime's WASM threads is **not** in it — on
  purpose: the screen stays responsive there.
- **`peakPressure`** is the worst CPU state (`nominal` → `fair` → `serious` →
  `critical`) seen during the trace, including the one in effect when it began.
  `serious` and `critical` mean the device is slowing work down — the moment a
  heavy pipeline should back off.

!!! warning "Pressure needs a secure context"
    `PressureObserver.observe()` refuses over HTTP and inside a cross-origin iframe
    (`compute-pressure` policy). The monitor swallows the refusal and leaves
    `pressure` at `null` instead of throwing.

## 4. Battery: drain rate, not cost per click

```typescript
import { createPerfMonitor } from "tempest-react-sdk";

const perf = createPerfMonitor();

perf.subscribe(() => {
    const battery = perf.getSnapshot().battery;
    if (battery && battery.drainPerHour !== null) {
        console.log(`${battery.drainPerHour.toFixed(1)} %/h`);
    }
});
```

The browser reports the level in **1 % steps**. A few-second interaction never
moves it on its own, so the monitor measures what can be measured honestly: the
**session drain rate**, in percentage points per hour.

- The rate is measured **edge to edge** (between two level changes), never from
  an arbitrary moment, so the 1 % rounding does not skew it.
- It stays `null` until the second step on battery, and resets every time the
  device is plugged in or unplugged.
- `report.battery.start` / `.end` record the level at the start and end of each
  trace, to cross with the rate later.

!!! tip "Compare, don't measure in absolute terms"
    Use the rate to **compare**: new build vs. previous build, heavy feature on vs.
    off, in the same test session and at the same screen brightness. For joules per
    interaction, profile on the device itself: Perfetto /
    `adb shell dumpsys batterystats` on Android.

## 5. In development: DevTools and `<PerfHud>`

Every step becomes a `performance.measure()` on a **"Tempest"** track of the
Chrome DevTools Performance panel, one lane per interaction. Record a profile,
click, and the steps line up with the main thread's frames and tasks.
`createPerfMonitor({ devtools: false })` turns it off.

[`<PerfHud>`](components/feedback.md#perfhud) shows the same monitor live, on top
of the app:

```tsx
import { PerfHud, createPerfMonitor, usePerfMonitor } from "tempest-react-sdk";

const perf = createPerfMonitor();

export function DevOverlay() {
    const snapshot = usePerfMonitor(perf);
    return import.meta.env.DEV ? <PerfHud snapshot={snapshot} /> : null;
}
```

## 6. In production: sampling and telemetry

```typescript
import { consoleTelemetryAdapter, createPerfMonitor, perfReportToEvent } from "tempest-react-sdk";

export const perf = createPerfMonitor({
    sampleRate: import.meta.env.PROD ? 0.1 : 1,
    onReport: (report) => consoleTelemetryAdapter.track(perfReportToEvent(report)),
});
```

- `sampleRate` decides what share of reports goes to `onReport` (the local
  snapshot gets all of them). Each report is one telemetry event — in production,
  10 % is usually enough.
- `perfReportToEvent` flattens the report into a `TelemetryEvent` with flat
  properties (`totalMs`, `longFrameMs`, `peakPressure`, `batteryLevel`,
  `inputDelayMs`, `span.pay/charge.ms`…), the shape PostHog, Amplitude and Sentry
  tags filter and chart. Values the browser withholds stay `null`, never `0` —
  otherwise Safari would look infinitely fast.

## Options

| Option | Type | Default | For |
| --- | --- | --- | --- |
| `onReport` | `(report) => void` | — | Receives the sampled reports |
| `sampleRate` | `number` (`[0, 1]`) | `1` | Share sent to `onReport` |
| `devtools` | `boolean` | `true` | "Tempest" track in DevTools |
| `historySize` | `number` | `20` | Reports and gestures kept in the snapshot |
| `pressureIntervalMs` | `number` | `1000` | CPU pressure sampling period |

## Recap

- `createPerfMonitor()` once → `trace(name)` → `span` / `spanSync` / `mark` →
  `end()`. ✅
- Time per step in every browser; frozen main thread, CPU pressure and battery on
  Chromium; the rest comes back `null`.
- Battery is the session drain rate (%/h), measured edge to edge — not cost per
  click.
- Dev: "Tempest" track in DevTools + `<PerfHud>`. Production: `sampleRate` +
  `perfReportToEvent` to telemetry.
- For on-device inference cost (model size, `/vision`'s `speed`), see the
  [`perf` module](perf.md).
