# On-device inference cost

When inference runs on the user's device, you lose the server graph. What
reaches you is a report: *"the app is slow on so-and-so's phone."* And without
numbers, "slow" can be three different things that call for opposite fixes. 🤔

The `perf` module measures what a browser can **actually** observe about a
run: how long each stage took, what the device says about itself, and how big
the weights you precached are.

!!! info "There is no energy counter in the browser"
    No web API reports joules or FLOPs. "Computational cost" here is assembled
    from what a page can observe from the inside. Anything the platform does
    not expose comes back `null` — never a fabricated number.

## Timing a pipeline

```typescript
import { createInferenceProfiler } from "tempest-react-sdk";
import { Detector } from "tempest-react-sdk/vision";

const profiler = createInferenceProfiler();

const detector = await profiler.stage("load-model", () =>
    Detector.create("/models/detect.onnx"),
);
const results = await profiler.stage("detect", () => detector.predict(blob));

const report = await profiler.report();
console.log(report.timings); // { "load-model": 1840.5, detect: 118.9 }
console.log(report.totalMs); // 1959.4
```

Three ways to record time:

| Method | For |
| --- | --- |
| `stage(name, fn)` | Async work — the resolved value passes straight through |
| `stageSync(name, fn)` | Sync work — same, without the `await` |
| `mark(name, ms)` | A duration you **already** measured elsewhere |

Repeated names **accumulate**, so two passes of the same kind add up into a
single row.

!!! tip "A stage that throws is still measured"
    `stage()` records the duration in a `finally` and rethrows. A pipeline that
    failed also has a timing story to tell — usually the interesting one.

## ⚠️ Concurrent stages do not partition the total

Stages are measured **independently**, not as a tiling of the run. Two stages
started together are each charged their full wall-clock span:

```typescript
const profiler = createInferenceProfiler();

const [model, image] = await Promise.all([
    profiler.stage("models", () => Detector.create("/models/detect.onnx")),
    profiler.stage("decode", () => createImageBitmap(blob)),
]);

const report = await profiler.report();
// timings.models + timings.decode > report.totalMs — and that is correct:
// the two ran at the same time.
```

That is the honest reading for a pipeline that decodes the image while the
sessions are still loading. Just do **not** draw the bars as if they split the
total — tell the user they are indicative fractions.

## Folding in `/vision`'s `speed`

Every `predict()` from the `/vision` subpath already returns its own breakdown
in `results[0].speed` (`load`, `preprocess`, `inference`, `postprocess`). Fold
whatever matters into the report with `mark`:

```typescript
const results = await profiler.stage("detect", () => detector.predict(blob));
profiler.mark("forward-pass", results[0].speed.inference);
```

Now the report holds the cost of the whole call **and** of the kernel — and the
gap between them is exactly how much pre/post-processing you are paying for.

## The device profile

```typescript
import { readDeviceProfile } from "tempest-react-sdk";

const device = readDeviceProfile();
// { hardwareConcurrency: 8, deviceMemoryGb: 8, jsHeapUsedMb: 137.4 }
```

| Field | Source | Available in |
| --- | --- | --- |
| `hardwareConcurrency` | `navigator.hardwareConcurrency` | Every modern browser |
| `deviceMemoryGb` | `navigator.deviceMemory` | Chromium only |
| `jsHeapUsedMb` | `performance.memory` | Chromium only (non-standard) |

On Firefox and Safari the last two are `null`. `report()` already includes this
profile, so you rarely call it directly — the function exists for when you want
the data outside a run.

!!! note "SSR-safe"
    Without a `navigator`, every field is `null` instead of throwing.

## How much the models weigh

Models you download and precache in Cache Storage are the biggest fixed cost of
an on-device inference app. `report()` measures the ones you list:

```typescript
const report = await profiler.report({
    models: [
        { name: "detector", cacheName: "app-models", url: "/models/detect.onnx" },
        { name: "classifier", cacheName: "app-models", url: "/models/classify.onnx" },
    ],
});

console.log(report.models);
// [ { name: "detector", bytes: 12582912 }, { name: "classifier", bytes: null } ]
```

`bytes: null` means one of three things: the model is not cached, Cache Storage
is unavailable, or the stored response carries no `Content-Length` (a chunked
transfer).

!!! warning "Why the header and not the body"
    Reading `(await response.blob()).size` would pull tens of megabytes of
    weights into memory just to learn the length — on every measurement.
    `cachedResponseBytes` reads only the `Content-Length`.

## Rendering it

`formatDurationMs` covers the range that matters here: milliseconds for a
forward pass, seconds for a cold start.

```typescript
import { formatBytes, formatDurationMs } from "tempest-react-sdk";

formatDurationMs(0.04); // "<1 ms"   — measured, just very fast
formatDurationMs(142.6); // "143 ms"
formatDurationMs(4321); // "4.32 s"
formatDurationMs(NaN); // "—"

formatBytes(12582912); // "12 MB"
```

`"<1 ms"` is deliberate: `"0 ms"` would read as "not measured".

## Recap

- `createInferenceProfiler()` → `stage` / `stageSync` / `mark` → `report()`. ✅
- Concurrent stages sum to more than `totalMs` — say so in the UI.
- `/vision`'s `results[0].speed` folds into the report via `mark`.
- Fields the platform withholds come back `null`, so the UI can show "—".
- `formatDurationMs` + `formatBytes` for display.
