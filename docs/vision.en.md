# Vision (ONNX Runtime Web)

**On-device** computer vision — right in the browser, with no inference server
and no image upload anywhere. The `tempest-react-sdk/vision` subpath runs three
classic tasks on ONNX models: **classification** (what is this image?),
**detection** (where are the objects?), and **instance segmentation** (what is
the exact outline of each object?).

The API is the same for all three tasks: you create an object with
`await Task.create(model, options)`, call `predict(image)`, and get back an array
of results — one per image. Learn one, you know all three.

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
`maxDetections: 300`, and `inputSize: [640, 640]`.

## Classifier — what is this image

`Classifier` applies ImageNet-style preprocessing (224×224, normalization with
ImageNet mean/std) and returns the probability distribution. Here `labels` is
**required** (there is no built-in ImageNet preset):

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
    `Detector` and `Segmenter` assume the **`"coco"`** preset when you omit
    `labels` — after all, the most common YOLO weights are trained on COCO. The
    `Classifier` has **no** default: `labels` is required, because there's no
    built-in ImageNet preset. Passing `numClasses` validates that the label count
    matches the model (`LabelMapError` if they disagree).

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
`<img>`, `<video>`, or `<canvas>`. It downsamples to at most
`LUMINANCE_SAMPLE_MAX_EDGE` (256px) before reading pixels — statistically
equivalent for a threshold and orders of magnitude faster than reading the whole
frame.

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

## Parity with the Python `ort-vision-sdk`

This API deliberately mirrors the Python
[`ort-vision-sdk`](https://pypi.org/project/ort-vision-sdk/) package by the same
author: `Classifier` / `Detector` / `Segmenter`, a `predict()` that returns a
list of one result per image, and the same Ultralytics-style idiomatic names
(`cls`/`conf`/`name`/`box`, `boxes.xyxy`, `probs.top5`). Porting vision code
between the Python backend and the TypeScript frontend reuses the same mental
model with almost no friction.

## Recap

- Import from **`tempest-react-sdk/vision`** — a dedicated subpath. The code is
  vendored from `@mauriciobenjamin700/ort-vision-sdk-web` (MIT), so it **ships in
  the SDK** with no extra package.
- The **`onnxruntime-web` is an optional peer dep**: run `npm i onnxruntime-web`
  and **serve the matching `.wasm` files**. Apps that don't import from
  `/vision` pay nothing. Providers: **WebGPU → WASM** (`DEFAULT_PROVIDERS`).
- Three tasks, one shape: `await Task.create(model, options)` →
  `(await task.predict(image))[0]`. `predict` always returns a **1-element**
  array (one envelope per image).
- Iterate the envelope with `for...of` for per-instance results:
  `d.name`/`d.className`, `d.confidence`/`d.conf`, `d.box`/`d.bbox` (with
  `.xyxy`/`.xywh`/`.asXywh()`/`.xyxyn()`). Or use the bulk view `result.boxes`
  (`.xyxy`/`.cls`/`.conf`) and `result.names`.
- Accepted inputs: URL `string`, `Blob`, `File`, `HTMLImageElement`, canvases
  (`HTMLCanvasElement`/`OffscreenCanvas`), `ImageBitmap`, `ImageData`, and
  `RGBImage`.
- Labels via `resolveLabels` / `COCO_CLASSES`: the `"coco"` preset, an array, a
  sparse dict, or auto-generated. `Detector`/`Segmenter` assume `"coco"`;
  `Classifier` requires `labels`.
- The API mirrors the Python `ort-vision-sdk` — the same mental model on both
  sides.
- To **capture** the frame: `useCameraStream` (rear camera by default, stable
  `error.kind`, `retry()`), `computeImageLuminance` + `isLuminanceAcceptable` +
  `LowLuminanceError` to check brightness (threshold required), and
  `useLiveLuminance` for live feedback. To preview the captured `Blob`, use
  `useObjectUrl` (main barrel).
