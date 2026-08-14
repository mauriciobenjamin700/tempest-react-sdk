# Vision (ONNX Runtime Web)

**On-device** computer vision — right in the browser, with no inference server
and no image upload anywhere. The `tempest-react-sdk/vision` subpath runs three
classic tasks on ONNX models: **classification** (what is this image?),
**detection** (where are the objects?), and **instance segmentation** (what is
the exact outline of each object?) — plus the fused **detect→classify** pipeline
in a single file.

The API is the same for all of them: you create an object with
`await Task.create(model, options)`, call `predict(image)`, and get back an array
of results — one per image. Learn one, you know all four.

```tsx
import { Detector } from "tempest-react-sdk/vision";

const det = await Detector.create("/models/yolov8n.onnx", { labels: "coco" });
const result = (await det.predict("/images/street.jpg"))[0];

for (const d of result) {
  console.log(d.name, d.confidence, d.box.xyxy);
}
```

## Why a separate subpath

The vision tasks don't come from the main barrel. You import them from
`tempest-react-sdk/vision`:

```tsx
import { Classifier, Detector, Segmenter } from "tempest-react-sdk/vision";
```

!!! info "Where this module comes from"
    The vision code is **vendored** from
    [`@mauriciobenjamin700/ort-vision-sdk-web`](https://www.npmjs.com/package/@mauriciobenjamin700/ort-vision-sdk-web)
    (MIT, same author as this SDK). Instead of installing one more package, it
    ships **inside** `tempest-react-sdk` — just import from the `/vision`
    subpath. The API mirrors the original package 1-to-1.

### `onnxruntime-web` is an optional peer dependency

The engine that actually runs the `.onnx` models — the
[`onnxruntime-web`](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)
package — does **not** come bundled. It's an **optional** peer dependency: the
app installs it once and the vision subpath reuses it.

```bash
npm i onnxruntime-web
```

!!! warning "Without `onnxruntime-web`, inference won't run"
    Because `onnxruntime-web` is an **optional** peer dep,
    `npm install tempest-react-sdk` does not pull it in. If you import from
    `tempest-react-sdk/vision` without running `npm i onnxruntime-web`, the build
    breaks with `Cannot find module 'onnxruntime-web'`. It stays
    **externalized** in the SDK bundle — apps that never import from `/vision`
    pay nothing for it (the same pattern as `recharts` in charts and the
    dependency-injecting adapters).

!!! danger "You must serve the `.wasm` files"
    `onnxruntime-web` loads the runtime via WebAssembly. The `.wasm` files for
    the **same version** you installed must be reachable at runtime (served by
    your bundler or copied to a public folder). A mismatch between the JS version
    and the `.wasm` version is the #1 cause of "the model won't load." Each
    bundler has its own recipe (with Vite, the usual approach is to copy the
    `.wasm` files into `public/` and point `ort.env.wasm.wasmPaths` at them).

!!! tip "WebGPU first, WASM as fallback"
    By default the SDK tries the execution providers in this order:
    `["webgpu", "wasm"]` (exported as `DEFAULT_PROVIDERS`). ORT-Web uses the GPU
    via **WebGPU** when the browser/device supports it and falls back
    automatically to **WASM** (CPU) when it doesn't. You can force the order by
    passing `providers` in the `create()` options.

## The input image

All tasks accept the **same** set of inputs — the `ImageInput` type. You don't
have to decode anything by hand; the SDK resolves it to the internal canonical
format (`RGBImage`, HWC RGB uint8).

| Input                | Example                                          |
| -------------------- | ------------------------------------------------ |
| `string` (URL)       | `det.predict("/images/cat.jpg")`                 |
| `Blob`               | `det.predict(await (await fetch(url)).blob())`   |
| `File`               | `det.predict(inputFile.files[0])`                |
| `HTMLImageElement`   | `det.predict(document.querySelector("img"))`     |
| `HTMLCanvasElement`  | `det.predict(canvas)`                            |
| `OffscreenCanvas`    | `det.predict(offscreen)`                         |
| `ImageBitmap`        | `det.predict(await createImageBitmap(blob))`     |
| `ImageData`          | `det.predict(ctx.getImageData(0, 0, w, h))`      |
| `RGBImage`           | `det.predict(rgbImage)` (the SDK's canonical form)|

!!! note "`File` rides in through the `Blob` door"
    The `ImageInput` type lists `Blob`, and `File` is a subclass of `Blob` — so
    a `File` from an `<input type="file">` is accepted directly, no conversion.
    That's the natural path for "the user picked a photo."

## Detector — where are the objects

`Detector` runs anchor-free YOLO models (v8/v9/v10/v11/v12) and returns one box
per object found.

```tsx
import { Detector } from "tempest-react-sdk/vision";

const det = await Detector.create("/models/yolov8n.onnx", { labels: "coco" });

const result = (await det.predict("/images/street.jpg"))[0];

console.log(`${result.length} objects detected`);
for (const d of result) {
  console.log(d.name, d.confidence.toFixed(2), d.box.xyxy);
}
```

### The shape of the result

`predict()` always returns a **Promise of a 1-element array** — one envelope per
image, mirroring Ultralytics' `YOLO("img.jpg")`. That's why the `[0]` right after
the `await`:

```tsx
const results = await det.predict(img); // DetectionResults[]
const result = results[0]; // DetectionResults
```

The envelope (`DetectionResults`) is **iterable**: looping with `for...of` yields
one `DetectionResult` per object. Each object carries Ultralytics-style idiomatic
names **and** the equivalent verbose names — use whichever you prefer:

| Ultralytics style | Verbose name  | Type          | What it is                               |
| ----------------- | ------------- | ------------- | ---------------------------------------- |
| `d.cls`           | `d.classId`   | `number`      | numeric class id                         |
| `d.name`          | `d.className` | `string`      | class name (resolved label)              |
| `d.conf`          | `d.confidence`| `number`      | confidence in `[0, 1]`                   |
| `d.box`           | `d.bbox`      | `BoundingBox` | the bounding box                         |

The `BoundingBox` exposes coordinates in several formats:

```tsx
for (const d of result) {
  d.box.xyxy; // [x1, y1, x2, y2] in absolute pixels (readonly tuple)
  d.box.xywh; // [cx, cy, w, h] with the center at (cx, cy)
  d.box.asXywh(); // [x, y, w, h] with the top-left corner at (x, y)
  d.box.xyxyn([result.origShape[0], result.origShape[1]]); // normalized [0,1]
  d.box.width;
  d.box.height;
  d.box.area;
}
```

!!! tip "Bulk view: the `boxes` collection"
    To draw everything in one pass (onto a canvas, say), instead of iterating use
    the numpy-style view `result.boxes`. It exposes flat arrays: `boxes.xyxy`
    (`Float32Array` of `4 * N`), `boxes.cls` (`Int32Array`), `boxes.conf`
    (`Float32Array`), plus `boxes.xywh`, `boxes.xyxyn`, `boxes.xywhn`, and
    `boxes.length`. And `result.names` maps id → name, just like Ultralytics'
    `model.names`.

### Filters and thresholds

```tsx
const result = (
  await det.predict(img, {
    confThreshold: 0.4, // keep only detections with confidence ≥ 0.4
    iouThreshold: 0.5, // IoU for non-maximum suppression
    classes: [0, 2], // keep only "person" (0) and "car" (2)
  })
)[0];
```

The defaults (set at `create()`) are `confThreshold: 0.25`, `iouThreshold: 0.45`,
`maxDetections: 300`, and `inputSize: [640, 640]` — the last one only kicks in
when the model declares no resolution (see
[The resolution comes from the model](#the-resolution-comes-from-the-model)).

### `raiseOnEmpty` — when "found nothing" is an error

By default, a run that finds nothing resolves to an **empty** envelope: looking
and finding nothing is a successful inference. When empty should **stop** the
surrounding flow (a wizard that requires at least one document in the photo, say),
turn `raiseOnEmpty` on and handle `NoDetectionsError`:

```tsx
import { Detector, NoDetectionsError } from "tempest-react-sdk/vision";

const det = await Detector.create("/models/yolov8n.onnx", {
  confThreshold: 0.7,
  raiseOnEmpty: true,
});

try {
  const result = (await det.predict("/images/doc.jpg"))[0];
  console.log(result.length); // always ≥ 1 here
} catch (err) {
  if (err instanceof NoDetectionsError) {
    // NoDetectionsError: No detections in /images/doc.jpg: nothing cleared
    // confThreshold=0.7.
    console.warn(err.message);
  }
}
```

The flag lives on `create()` and as a per-call override
(`det.predict(img, { raiseOnEmpty: false })`). It works on `Detector`,
`Segmenter`, and [`DetectClassify`](#detectclassify-detect-and-classify-in-one-model)
— all three share the same message, which names the threshold that applied plus
the image and the class filter whenever either narrowed the search.

!!! note "Empty stays the default — on purpose"
    An empty collection is not an error (same rule as the SDK's listing
    endpoints). `raiseOnEmpty` is opt-in because only the surrounding flow knows
    whether zero rows is a result or a failure.

## Classifier — what is this image

`Classifier` applies ImageNet-style preprocessing (224×224 by default,
normalization with ImageNet mean/std) and returns the probability distribution.
`labels` is optional: when omitted, the `names` the exporter baked into the
`.onnx` are used (see [Labels come from the model](#labels-come-from-the-model)).
An off-the-shelf ImageNet ResNet usually carries **no** `names`, so there you do
pass the list:

```tsx
import { Classifier } from "tempest-react-sdk/vision";

const labels = await fetch("/models/imagenet-classes.json").then((r) => r.json());

const clf = await Classifier.create("/models/resnet50.onnx", { labels });

const result = (await clf.predict("/images/dog.jpg"))[0];

console.log(result.cls, result.conf, result.name); // top-1
console.log(result.probs.top5, result.probs.top5conf); // top-5
```

The `ClassificationResults` envelope exposes top-1 shortcuts (`cls`, `conf`,
`name`) and the `probs` collection with the full distribution:

| Access              | Type          | What it is                               |
| ------------------- | ------------- | ---------------------------------------- |
| `result.cls`        | `number`      | top-1 class id                           |
| `result.conf`       | `number`      | top-1 class confidence                   |
| `result.name`       | `string`      | top-1 class name                         |
| `result.probs.top1` | `number`      | id of the most probable class            |
| `result.probs.top5` | `Int32Array`  | ids of the 5 most probable classes       |
| `result.probs.data` | `Float32Array`| the full probability vector              |

To truncate the per-class list to top-K, pass `topK` to `predict`:

```tsx
const result = (await clf.predict(img, { topK: 3 }))[0];
for (const p of result.probabilities) {
  console.log(p.name, p.conf);
}
```

## Segmenter — the outline of each object

`Segmenter` runs YOLO-seg models (v8-seg / v11-seg / ...) and returns, on top of
the box, a **binary mask per instance**.

```tsx
import { Segmenter } from "tempest-react-sdk/vision";

const seg = await Segmenter.create("/models/yolov8n-seg.onnx", { labels: "coco" });

const result = (await seg.predict("/images/street.jpg"))[0];

for (const inst of result) {
  console.log(inst.name, inst.conf, inst.box.xyxy);
  console.log(inst.mask.width, inst.mask.height); // mask cropped to the box
}
```

The `SegmentationResults` envelope is iterable (yields one `SegmentationResult`
per instance) and also exposes two bulk views:

- `result.boxes` — the same boxes view as `Detector`.
- `result.masks` — an iterable collection of binary masks, each cropped to its
  instance's box (`masks.length`, and each item has `data`, `width`, `height`).

Each `SegmentationResult` carries the same fields as a detection (`cls`/`conf`/
`name`/`box` + aliases) plus:

- `mask` — the binary mask (`Mask`, values `0`/`255`, cropped to the box).
- `segmentedImage` — the original crop with the background zeroed out (ready to
  display).

## DetectClassify — detect and classify in one model

The classic two-stage case: a detector finds the objects, and a classifier says
**which sub-category** each one is ("there is a bird here" → "it's a great
kiskadee"). Doing that with two `.onnx` files costs two downloads, two session
initializations (WASM/WebGPU), and a per-crop round trip through JavaScript to
slice, resize, and restack the regions before the second model sees anything.

`DetectClassify` runs a **fused** `.onnx`: both models plus the crop-and-resize
bridge between them live in one graph. One download, one session, no round trip.

```tsx
import { DetectClassify } from "tempest-react-sdk/vision";

const pipeline = await DetectClassify.create("/models/birds-pipeline.onnx");

const result = (await pipeline.predict("/images/flock.jpg"))[0];

for (const d of result) {
  console.log(d.name, d.conf.toFixed(2)); // what the detector saw
  console.log(d.classification?.name, d.classification?.conf); // the species
}
```

!!! info "The fused file is built in Python"
    Fusion is a build step of the Python `ort-vision-sdk`
    (`ort_vision_sdk.compose.fuse_detect_classify`, 0.7.0+). The browser only
    **runs** a ready pipeline. Loading a plain `.onnx` here throws `FusionError`,
    with a message pointing at the right path (use `Detector`/`Classifier`, or
    fuse first).

Nothing is reconfigured on the JavaScript side: the letterbox resolution, the
crop size, whether the classifier output still needs a softmax, and the class
names of **both stages** are read from the `ovs.*` metadata fusion wrote into the
file. That's why a pipeline fused once behaves identically in both runtimes. To
inspect it by hand, `readFusionSpec(session.metadata)` returns the `FusionSpec`,
and the task exposes its own as `pipeline.spec`.

### The envelope carries two label spaces

`DetectClassifyResults` is iterable like `Detector`'s, and each item is a regular
`DetectionResult` (`cls`/`conf`/`name`/`box` + aliases, `croppedImage`) with one
extra field:

| Access                     | Type                          | What it is                                      |
| -------------------------- | ----------------------------- | ----------------------------------------------- |
| `d.classification`         | `ClassificationResult \| null`| what the classifier said about **that crop**     |
| `result.names`             | `Record<number, string>`      | labels of the **detection** stage                |
| `result.classifierNames`   | `Record<number, string>`      | labels of the **classification** stage           |
| `result.boxes`             | `Boxes`                       | the same bulk view as `Detector`                 |

The two maps stay separate because the stages answer different questions over
unrelated class spaces — collapsing them into one would lose an answer. To
override, `labels` covers detection and `classifierLabels` covers classification.

### Pipeline filters

```tsx
const result = (
  await pipeline.predict(img, {
    confThreshold: 0.5, // filters **on top of** the NMS fixed at fusion time
    classes: [14], // only detector class 14
    topK: 3, // truncate d.classification.probabilities
    raiseOnEmpty: true, // empty becomes NoDetectionsError
  })
)[0];
```

!!! warning "The fusion threshold is a floor, not a ceiling"
    The graph's NMS and `confThreshold` were fixed **at fusion time**.
    `confThreshold` here only filters further — you cannot loosen it below what
    the file already decided. Need a lower floor? Re-fuse the pipeline in Python.

## The resolution comes from the model

`inputSize` is optional and acts as a **fallback**. The resolution a task
preprocesses to is read from the shape the `.onnx` graph declares:

```tsx
const clf = await Classifier.create("/models/classify.onnx", { labels: LABELS });
console.log(clf.inputSize); // [224, 224] — read from the file, not configured
```

!!! danger "Why this could not live in configuration"
    An Ultralytics `-cls` export comes out at 224×224; a detector, at 640×640.
    Feeding the graph the wrong size makes ORT abort the run with
    `Got invalid dimensions for input: images ... Got: 640 Expected: 224` — and
    the number only exists inside the `.onnx`, so no constant, manifest or env
    var beside it could get it right on its own.

Passing an `inputSize` that contradicts a static graph logs a warning and is
ignored: obeying it there would only trade a fixable problem for a failed run.
On dynamic-axis models your value stands, and the task default is the last
resort.

The session also exposes what it read, and now knows how to free itself:

```tsx
console.log(clf.session.inputShape); // [1, 3, 224, 224] — null on a dynamic axis
await clf.session.release(); // frees the native session
```

!!! tip "Honest telemetry"
    `task.inputSize` is the resolution inference **actually** used. Reporting the
    configured value hides exactly the bug you are hunting.

!!! warning "Low-memory phones: `release()` is not optional"
    ORT copies the `.onnx` into its WASM heap and allocates the graph and the
    weights **on top of** that copy. Meanwhile the bytes the SDK fetched to read the
    metadata are alive in the JS heap too — a 5 MB model costs 5 MB + 5 MB + weights
    at the same instant. The SDK reads the metadata **before** building the session
    so that buffer dies as early as possible (since v0.38.1; before that it survived
    the whole build).

    When the numbers do not add up, ORT gives up with `Can't create a session.
    failed to allocate a buffer of size N`. In order: **load one model at a time**
    (two concurrent `create` calls double the peak), call `session.release()` on
    whatever goes out of use — dropping the JS reference does **not** free the native
    session — and decode the photo already downscaled, which on a phone weighs more
    than both models together. If that is still not enough, `readMetadata: false`
    **with explicit `labels`** takes the SDK out of the path: ORT fetches the model
    itself and nothing here holds the bytes (the input size still comes from the
    graph; only the class names are lost).

The pure helpers behind this (`spatialInputSize`, `resolveInputSize`,
`declaredShapesFrom`) are exported too, for anyone assembling their own pipeline
without importing `onnxruntime-web` types.

## Labels come from the model

`labels` is optional on all three tasks. When omitted, the `names` the exporter
baked into the `.onnx` metadata are used — Ultralytics writes them as
`{0: 'deworm', 1: 'not_deworm'}` — and only a model carrying none falls back to
the COCO preset (detection/segmentation) or to `class_<id>` (classification):

```tsx
const det = await Detector.create("/models/detect.onnx");

console.log(det.labels); // ["ocular-mucosa"] — from the model, not a preset
console.log(det.numClasses); // 1 — inferred from the (B, 4 + nc, N) output shape
```

Precedence matches the Python `ort-vision-sdk`: what you pass wins, then the
model's `names`, then the preset. Passing `numClasses` still validates the labels
against the model (`LabelMapError` if they disagree).

!!! danger "A hand-kept label list is the worst kind of configuration"
    It does not fail when it is wrong — the predictions just swap classes, and you
    find out by reading results. This also fixed a real stumble: a **single**-class
    detector **failed** without an explicit `labels`, because the 80-name COCO
    default disagreed with the model's class count.

The session exposes what it read off the file, for whoever wants the raw data:

```tsx
console.log(det.session.metadata.task); // "detect" — the map the exporter wrote
console.log(det.session.outputShape); // [1, 5, 8400] — null on a dynamic axis
```

The pure helpers are exported too: `readModelMetadata`, `modelNames`,
`detectionNumClasses`, and `classificationNumClasses`.

!!! info "A model given as a URL is downloaded by the SDK"
    `onnxruntime-web` exposes no equivalent of Python's `custom_metadata_map`, so
    `metadata_props` is read from the `.onnx`'s own bytes. That is the same single
    download either way, and `readMetadata: false` in the session options restores
    the previous path (ORT fetches the URL). A fetch that fails still hands the URL
    to ORT, so losing the metadata never becomes a load failure.

## Labels: presets, lists, and dicts

Since the browser has no filesystem, the SDK does **not** read labels from a path
— you pass the names directly. The `resolveLabels` function (and each task's
`labels` field) accepts:

```tsx
import { resolveLabels, COCO_CLASSES } from "tempest-react-sdk/vision";

resolveLabels("coco"); // preset → the 80 COCO classes
resolveLabels(["cat", "dog"]); // explicit array, indexed by id
resolveLabels({ 0: "cat", 2: "bird" }); // sparse dict (gaps become class_1)
resolveLabels(null, { numClasses: 3 }); // auto: ["class_0", "class_1", "class_2"]

COCO_CLASSES; // the readonly array of 80 classes, in canonical order
```

!!! note "Label default per task"
    Omitting `labels` first tries the model's own `names`
    ([Labels come from the model](#labels-come-from-the-model)). Only when the
    `.onnx` carries none do `Detector` and `Segmenter` assume the **`"coco"`**
    preset — after all, the most common YOLO weights are trained on COCO — and the
    `Classifier` generates `class_<id>` from the class count read off the output
    shape. Passing `numClasses` validates that the label count matches the model
    (`LabelMapError` if they disagree).

## Camera and luminance hooks

Before you can run any model you need a **frame** — and a decent one. The
`/vision` subpath ships three browser primitives for that: open the camera,
measure brightness live, and reject too-dark captures. They're generic (they
depend on no model), but they live under `/vision` because that's where capture
happens.

### `useCameraStream` — open the camera

Requests a `MediaStream` via `getUserMedia`, attaches it to a `<video>`, and
exposes an already-classified `status`/`error` so you can render permission and
error states without memorizing `DOMException` names. The stream is released
automatically on unmount and on `retry()`.

```tsx
import { useCameraStream } from "tempest-react-sdk/vision";

function CameraView() {
  const { status, error, videoRef, retry } = useCameraStream();

  if (status === "error") {
    return (
      <div>
        <p>{error?.message}</p>
        <button onClick={retry}>Try again</button>
      </div>
    );
  }

  return (
    <video ref={videoRef} playsInline muted style={{ opacity: status === "ready" ? 1 : 0.4 }} />
  );
}
```

By default it asks for the **rear** camera (`facingMode: "environment"`) at
Full-HD — ideal for photographing something in front of you. Desktops fall back
to the single camera they expose. To override, pass `constraints`:

```tsx
const cam = useCameraStream({
  constraints: { video: { facingMode: "user" }, audio: false }, // front camera
});
```

`error.kind` is a stable enum — map it to your UI, not `error.message`:

| `kind`              | When it happens                                            |
| ------------------- | ---------------------------------------------------------- |
| `unsupported`       | browser without `getUserMedia` (or SSR).                   |
| `insecure`          | page served outside HTTPS (non-secure context).            |
| `permission-denied` | the user (or the OS) denied access.                        |
| `no-camera`         | no camera device / impossible constraints.                 |
| `in-use`            | the camera is held by another app.                         |
| `unknown`           | any other failure (the original message is in `message`).  |

!!! warning "Camera requires a secure context"
    `getUserMedia` only works over **HTTPS** (or `localhost`). On an insecure
    origin the hook returns `status: "error"` with `kind: "insecure"` — that's
    not a bug, it's browser policy. The `error.message` strings are in
    **English**; translate them in your i18n layer if needed.

### `computeImageLuminance` + `useLiveLuminance` — measure brightness

`computeImageLuminance` computes the **mean BT.709 luminance**
(`0.2126*R + 0.7152*G + 0.0722*B`, on a `0..255` scale) of an already-decoded
frame — `<img>`, `<video>`, `<canvas>`, `ImageBitmap`, or `OffscreenCanvas`. It
downsamples to at most `LUMINANCE_SAMPLE_MAX_EDGE` (256px) before reading
pixels — statistically equivalent for a threshold and orders of magnitude faster
than reading the whole frame.

```tsx
import {
  computeImageLuminance,
  isLuminanceAcceptable,
  LowLuminanceError,
} from "tempest-react-sdk/vision";

const luminance = computeImageLuminance(videoOrImageOrCanvas); // 0..255
if (!isLuminanceAcceptable(luminance, 70)) {
  throw new LowLuminanceError(luminance, 70);
}
```

!!! note "The threshold is yours"
    `isLuminanceAcceptable(luminance, threshold)` takes `threshold` as a
    **required** argument — the right value depends on your model, the lighting
    it was trained on, and your acceptable reject rate. The SDK bakes in no
    default. `LowLuminanceError` carries `.luminance` and `.threshold` so you can
    surface actionable feedback.

!!! tip "Phone photos: decode downscaled and measure that same frame"
    A 12 MP photo decodes to ~48 MB of RGBA if you take it whole — more than both
    models together, and the peak where ORT starts refusing to create a session.
    Ask for the frame already downscaled and work on it; `ImageBitmap` is accepted
    both here and by the tasks' `predict()`, so the frame you measure is the frame
    you infer on:

    ```tsx
    const frame = await createImageBitmap(photoBlob, {
      resizeWidth: 1280,
      resizeQuality: "high",
    });
    const luminance = computeImageLuminance(frame); // 0..255, no second decode
    const result = (await det.predict(frame))[0];
    frame.close(); // hands the memory back now, not whenever the GC runs
    ```

    Boxes come back in the downscaled frame's space — multiply by the scale factor
    if you persist coordinates at the original resolution. And `close()` matters:
    it is the only deterministic way to release that memory.

For **live** feedback (a brightness bar, a border that changes color while the
camera is open), `useLiveLuminance` samples the `<video>` on a
`requestAnimationFrame` loop, reusing a single offscreen canvas:

```tsx
import { useCameraStream, useLiveLuminance, isLuminanceAcceptable } from "tempest-react-sdk/vision";

function BrightnessGuardedCamera() {
  const { status, videoRef } = useCameraStream();
  const luminance = useLiveLuminance(videoRef, { enabled: status === "ready" });
  const bright = isLuminanceAcceptable(luminance, 70);

  return (
    <div style={{ border: `3px solid ${bright ? "green" : "orange"}` }}>
      <video ref={videoRef} playsInline muted />
      {!bright && <p>Dark environment — move closer to a light.</p>}
    </div>
  );
}
```

It pauses on its own when `enabled` is `false` or while the video isn't ready
yet (`readyState < 2`), and is throttled by `intervalMs` (default `160`, ~6 fps —
plenty for UX).

!!! tip "Preview the captured frame: `useObjectUrl`"
    After exporting the frame to a `Blob` (`canvas.toBlob(...)`), use
    [`useObjectUrl`](hooks.md) (main barrel, `tempest-react-sdk`) to turn it into
    an `<img>` `src` without leaking memory — it creates the
    `URL.createObjectURL` and revokes it automatically when the blob changes or
    the component unmounts.

    ```tsx
    import { useObjectUrl } from "tempest-react-sdk";

    const previewUrl = useObjectUrl(capturedBlob);
    return previewUrl ? <img src={previewUrl} alt="Preview" /> : null;
    ```

## `warmup()` — the first inference is not representative

The first run of a session pays costs none of the later ones do: WebGPU compiles
its shaders on it, and the WASM backend faults in its arenas. On a phone that
reads as "the first frame took seconds, the rest take tens of milliseconds".
`warmup()` runs the model once on a zero tensor, moving that cost to where the
user is already watching a spinner:

```tsx
const det = await Detector.create("/models/yolov8n.onnx", { labels: "coco" });
await det.warmup(); // still on the loading screen

// from here on, every predict() is real inference time
const result = (await det.predict(frame))[0];
```

Available on **all four** tasks. `warmup(2)` runs it twice — one is enough for
WASM, and WebGPU sometimes settles on the second. It pays off most on
`DetectClassify`: two models plus the bridge compile together on that first
inference.

!!! tip "Warm both stages of an analysis, not just the first"
    In an app that detects and then classifies with **two separate models**,
    each session pays its own first inference. Warming only the detector leaves
    the classifier's cost exactly where it shows most: in the instant between
    the user finishing their wait and the answer appearing.

    ```tsx
    await Promise.all([detector.warmup(), classifier.warmup()]);
    ```

## Getting off the main thread (`env.wasm.proxy`)

The WASM backend runs on whichever thread called it — and that thread is the main
one. So creating the session and every `predict()` **block the UI** while they
run. Measured on a 32-core desktop: one detector + classifier `warmup()` froze the
page for **805 ms**. On a 4-core / 2 GB phone, a single analysis takes 50 to
103 s.

ONNX Runtime has a flag for this. With `env.wasm.proxy` on, it creates its own Web
Worker (`onnxruntime-web-proxy-worker`) and forwards create, run and release over
`postMessage`. Same warmup as above: worst frame **18 ms**, zero frames over
50 ms.

Turn it on **once, before the first session**:

```tsx
import { env } from "onnxruntime-web";
import { Detector } from "tempest-react-sdk/vision";

env.wasm.proxy = true; // before the first Detector.create

const det = await Detector.create("/models/yolov8n.onnx", { labels: "coco" });
await det.warmup(); // now it warms up without freezing the loading screen
const result = (await det.predict(frame))[0];
```

!!! warning "Before the first session, not after"
    ORT reads `env.wasm` when it initialises the WASM runtime, which happens
    inside the first `InferenceSession.create`. Setting the flag after that is
    silently ignored — inference goes back to the main thread with nothing to say
    so. In an app with lazy sessions, the safe place is the top of the function
    that builds the session, not a boot hook a later refactor can reorder.

!!! note "The worker makes nothing cheaper"
    It changes *where* the cost is paid, not how much it is. The WASM heap and the
    pthread build's shared-memory reservation simply move threads: a device that
    cannot create the session on the main thread cannot create it in the worker
    either.

!!! info "Needs `onnxruntime-web` >= 1.17 and this SDK version"
    The proxy posts the input tensors with their `ArrayBuffer`s in the transfer
    list, which **detaches** them on this side. The preprocessing pipelines reuse
    one `Float32Array` across calls, and up to 0.42.0 they handed the detached
    buffer back — ORT rejected it with
    `Tensor's size(1228800) does not match data length(0).` on every other
    inference. Fixed in this version (vendored vision `0.7.1`).

## How long it took

Every envelope carries a `speed` breakdown of the `predict()` call, in
milliseconds:

```typescript
const results = await detector.predict(blob);
console.log(results[0].speed);
// { load: 84.2, preprocess: 11.7, inference: 118.9, postprocess: 6.4 }
```

`preprocess` / `inference` / `postprocess` are the same three keys Ultralytics
reports, measured over the same boundaries. `load` is the fetch/decode
`predict()` performs internally when you hand it a URL or `Blob` — on a cold
cache it is usually the largest slice of the call. Creating the task
(`Detector.create`) is **not** included: that is startup cost, paid once.

To measure your whole app pipeline — including what happens *between* two
`predict()` calls — use the [`perf` module](perf.md), and fold `speed` into the
report with `profiler.mark("forward-pass", results[0].speed.inference)`.
`SpeedTimer` is exported from here too, for code that wants the SDK's exact
boundaries.

!!! tip "Today's `preprocess` is ~2x faster than it used to be"
    All four tasks preprocess through a fused pipeline: a single `drawImage`
    resizes (and, where there is padding, positions) the content, plus one loop
    that reads the resulting RGBA and writes planar float32 into a buffer reused
    across frames. Measured in Chromium, letterboxing into 640×640: 19.8 → 10.7
    ms (1920×1080), 13.8 → 7.8 ms (1280×720), 6.8 → 3.1 ms (640×480) — with
    **bit-identical** output to the old path.

    There are two pipelines because the tasks want different things:
    `LetterboxPipeline` preserves aspect ratio and pads the rest (detection and
    segmentation have to undo that geometry afterwards), while `ResizePipeline`
    stretches straight to the model's input and normalizes with `mean`/`std` in
    the same pass — what `Classifier` does, since it maps nothing back onto the
    original image. The primitives (`letterbox`, `resize`, `normalize`, `toCHW`,
    …) are still exported; code that wants the fused path of its own uses the
    pipeline (or `letterboxToTensorData`/`resizeToTensorData`, the one-shot
    forms).

!!! warning "Classifying was the expensive path until 0.41.0"
    `Classifier` was the one task still on the composable route
    (`resize` → `normalize` → `toCHW`): three scans and three allocations per
    `predict()`, ~1.4 MB of fresh garbage per 224×224 image. On a device near
    ORT's memory ceiling that landed at the worst possible moment. If you pinned
    an older version over this, that is the release that fixes it.

## Reference: what else the subpath exports

The tasks cover the common path. Below is the rest of the surface — what you
reach for when you build a pipeline of your own, run a model with a head the SDK
does not know, or need to handle one specific failure.

| Group           | Exports                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| Session         | `OrtSession` (loads the `.onnx`, exposes `metadata`/`inputName`), `resolveProviders`, `DEFAULT_PROVIDERS`, `VisionTask` (task base class), `VERSION` |
| Input           | `loadImage` (any `ImageInput` → `RGBImage`), `normalize`, `toTensor`, `toFloat32`/`toFloat32Tensor`, `zeroTensorData`, `fromCv2`/`toCv2` (BGR ↔ RGB) |
| Fused preprocess | `LetterboxPipeline` + `letterboxToTensorData` (detect/segment), `ResizePipeline` + `resizeToTensorData` (classify), `writePlanarFloat32` (the shared planar write) |
| Decoding        | `decodeYolo` (anchor-free head, v8→v12), `decodeYoloAnchors` (anchor-based head), `decodeYoloSeg`, `nms`, `batchedNms` |
| Labels          | `resolveLabels`, `defaultLabels`, `parseNames`, `modelNames`, `readModelMetadata`, `COCO_CLASSES`        |
| Bulk views      | `Boxes`, `Masks`, `Probs` — the "numpy-style" collections behind `result.boxes`/`.masks`/`.probs`        |
| Errors          | `OrtVisionError` (base), `ModelLoadError`, `ImageLoadError`, `InferenceError`, `LabelMapError`, `ProviderNotAvailableError`, `NoDetectionsError`, `FusionError` |
| Fusion contract | `readFusionSpec`, `FusionSpec`, `CropSource`, `INPUT_IMAGE`/`INPUT_SOURCE`/`INPUT_SCALE`/`INPUT_PAD`, `OUTPUT_BOXES`/`OUTPUT_SCORES`/`OUTPUT_CLASSES`/`OUTPUT_PROBS`/`OUTPUT_NUM_DETECTIONS`, `METADATA_PREFIX`, `FUSION_KIND_DETECT_CLASSIFY` |
| Helpers         | `requireDetections` (the check behind `raiseOnEmpty`), `SpeedTimer`, `softmax`, `topK`                   |

!!! tip "Anchor-based head: `decodeYoloAnchors`"
    `decodeYolo` covers anchor-free heads (the default from v8 onward). An older
    model — YOLOv5/v7, or a custom export that keeps its anchors — decodes with
    `decodeYoloAnchors`. Feeding the wrong output to the wrong function does not
    raise: it puts boxes nowhere.

!!! info "Every error descends from `OrtVisionError`"
    One `catch (err) { if (err instanceof OrtVisionError) … }` catches
    everything the subpath throws, and the subclasses separate what you can act
    on: `ModelLoadError` (wrong URL, 404, corrupt file) wants another URL,
    `ProviderNotAvailableError` wants another provider, `LabelMapError` is your
    configuration, and `InferenceError` is the model rejecting the input.

## Parity with the Python `ort-vision-sdk`

This API deliberately mirrors the Python
[`ort-vision-sdk`](https://pypi.org/project/ort-vision-sdk/) package by the same
author: `Classifier` / `Detector` / `Segmenter`, a `predict()` that returns a
list of one result per image, and the same Ultralytics-style idiomatic names
(`cls`/`conf`/`name`/`box`, `boxes.xyxy`, `probs.top5`). Porting vision code
between the Python backend and the TypeScript frontend reuses the same mental
model with almost no friction.

Parity goes beyond API shape: `raiseOnEmpty` exists on both sides with the
**same message** (down to the threshold rendering the same — `conf_threshold=1`
does not become `1.0` on one side only), and a pipeline fused by Python's
`compose` is read here from the metadata it wrote itself. Fuse once, run under
both runtimes, get the same result.

## Recap

- Import from **`tempest-react-sdk/vision`** — a dedicated subpath. The code is
  vendored from `@mauriciobenjamin700/ort-vision-sdk-web` (MIT), so it **ships in
  the SDK** with no extra package.
- The **`onnxruntime-web` is an optional peer dep**: run `npm i onnxruntime-web`
  and **serve the matching `.wasm` files**. Apps that don't import from
  `/vision` pay nothing. Providers: **WebGPU → WASM** (`DEFAULT_PROVIDERS`).
- Four tasks, one shape: `await Task.create(model, options)` →
  `(await task.predict(image))[0]`. `predict` always returns a **1-element**
  array (one envelope per image).
- **`DetectClassify`** runs detector + classifier from a single **fused**
  `.onnx` (built by the Python SDK's `compose`): one download, one session, and
  each object's sub-category in `d.classification`. A model without fusion
  metadata throws `FusionError`.
- **`warmup()`** pays the shader-compile / arena cost before the user does —
  call it on the loading screen. **`raiseOnEmpty`** turns an empty result into
  `NoDetectionsError` when zero rows should stop the flow (default: empty
  envelope).
- Iterate the envelope with `for...of` for per-instance results:
  `d.name`/`d.className`, `d.confidence`/`d.conf`, `d.box`/`d.bbox` (with
  `.xyxy`/`.xywh`/`.asXywh()`/`.xyxyn()`). Or use the bulk view `result.boxes`
  (`.xyxy`/`.cls`/`.conf`) and `result.names`.
- Accepted inputs: URL `string`, `Blob`, `File`, `HTMLImageElement`, canvases
  (`HTMLCanvasElement`/`OffscreenCanvas`), `ImageBitmap`, `ImageData`, and
  `RGBImage`.
- Labels via `resolveLabels` / `COCO_CLASSES`: the `"coco"` preset, an array, a
  sparse dict, or auto-generated. `labels` is **optional** on all three tasks —
  when omitted, the `.onnx`'s own `names` win, and only a model carrying none
  falls back to the `"coco"` preset (det/seg) or to `class_<id>` (classification).
- The API mirrors the Python `ort-vision-sdk` — the same mental model on both
  sides.
- To **capture** the frame: `useCameraStream` (rear camera by default, stable
  `error.kind`, `retry()`), `computeImageLuminance` + `isLuminanceAcceptable` +
  `LowLuminanceError` to check brightness (threshold required), and
  `useLiveLuminance` for live feedback. To preview the captured `Blob`, use
  `useObjectUrl` (main barrel).
