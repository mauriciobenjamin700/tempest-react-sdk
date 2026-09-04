# Imaging (image processing in the browser)

A photo taken on a phone, handled **on the device**: resized, cropped,
rotated, re-encoded and fitted into a byte budget — no server, no
dependency, and the user's picture does not travel before it has to.

That is what a field PWA needs. It may be offline, the connection may be
metered, and the photo may carry GPS coordinates nobody asked to upload.

```tsx
import { compressToTarget } from "tempest-react-sdk/imaging";

// `file` is what an <input type="file"> hands you: event.target.files[0]
const upload = await compressToTarget(file, {
  maxBytes: 1_000_000,
  width: 1600,
  type: "image/webp",
});

console.log(upload.bytes, upload.quality, upload.withinBudget);
```

```text
192512 0.86 true
```

## What it handles for you

### Phone photos arrive sideways

A portrait picture is stored landscape plus a rotation tag. Decoding without
honouring the tag shows **every** vertical photo on its side — the most
reported bug in upload flows.

```tsx
import { decodeImage } from "tempest-react-sdk/imaging";

const { width, height } = await decodeImage(file); // already upright
```

Measured in Chromium: a 120x60 JPEG with `Orientation=6` decodes as 60x120.

### An unsupported format fails silently

```tsx
import { bestSupportedType, supportsImageType } from "tempest-react-sdk/imaging";

const type = await bestSupportedType(["image/avif", "image/webp", "image/jpeg"]);
```

!!! danger "Asking for AVIF where there is no encoder returns PNG, with no error"
    Measured in Chromium **and** Firefox: `convertToBlob({ type: "image/avif" })`
    does not throw — it returns `image/png`. An app that trusted the request
    uploads megabytes where it planned for hundreds of kilobytes.

    So every result carries `type` — the format **produced**, not the one
    requested — and `supportsImageType` answers up front.

### Re-encoding drops EXIF

Resizing goes through a canvas, and a canvas carries no metadata. GPS,
camera serial and timestamp **do not survive**. For an app handling user
photos that is usually exactly what you want — and it is worth knowing it
happens.

## Real measurements

A synthetic 3000x2000 photo (731 KB), Chromium:

| Operation | Result |
| --- | --- |
| Resize to 1200 px, JPEG q0.85 | 124 KB in 66 ms |
| Same in WebP q0.85 | 75 KB (40% smaller) |
| `compressToTarget` to 200 KB | 192 KB, q0.86, 7 encodes, 313 ms |

!!! info "What was removed after measuring"
    The classic recipe for a steep canvas downscale is to **halve
    repeatedly**, because a single `drawImage` supposedly aliases. That was
    implemented here, and then measured: a 512 px checkerboard reduced to
    32 px produced an **identical** result (standard deviation 0.0 on both)
    in Chromium and Firefox, while the stepwise path cost **39.19 ms against
    0.13 ms** on a 4000x3000 photo — 300 times more, plus three intermediate
    canvases on a device that may not have the memory.

    Modern engines honour `imageSmoothingQuality = "high"`, which is what
    this module sets. The code was deleted rather than kept "just in case":
    unmeasurable benefit at 300x the cost is not insurance, it is ballast.

## Resizing

```tsx
import { resizeImage } from "tempest-react-sdk/imaging";

const thumb = await resizeImage(file, { width: 320, height: 320, fit: "cover" });
```

| `fit` | What it does |
| --- | --- |
| `contain` (default) | Fits inside the box; may be smaller on one side |
| `cover` | Fills the box; the overflow is cropped, centred |
| `fill` | Stretches to the box, changing the aspect ratio |
| `pad` | Like `contain`, but completes the box with `background` |

It never enlarges by default (`withoutEnlargement`): scaling up adds no
detail and multiplies the bytes.

!!! tip "JPEG has no alpha"
    Encoding a transparent PNG as JPEG paints the transparent pixels black.
    The module fills with white first — pass `background` for another colour.

## Crop, rotate, flip

```tsx
import { cropImage, flipImage, rotateImage } from "tempest-react-sdk/imaging";

const badge = await cropImage(file, { x: 120, y: 80, width: 400, height: 400 });
const upright = await rotateImage(file, 90);
const selfie = await flipImage(capture, { horizontal: true });
```

The rectangle is clamped to the image, so a crop dragged past the edge gives
a smaller result rather than transparent padding. `rotateImage` takes only
multiples of 90 — an arbitrary angle needs a decision about the corners, and
that is your app's design, not a utility default.

## Several thumbnails from one decode

```tsx
import { createThumbnails } from "tempest-react-sdk/imaging";

const [thumb, card] = await createThumbnails(file, [
  { name: "thumb", size: 96 },
  { name: "card", size: 480 },
]);
```

Three separate `resizeImage` calls would decode the same photo three times —
and on a 12-megapixel image the decode is the cost, not the scaling. `size`
is the **longest edge**, so portrait and landscape both fit the same grid
cell without a separate calculation.

## One frame out of a video

The frame already on screen needs nothing special — a `<video>` is a source
like any other, because `createImageBitmap` accepts the element:

```tsx
import { resizeImage } from "tempest-react-sdk/imaging";

const print = await resizeImage(videoRef.current, { width: 1280, type: "image/webp" });
```

A **chosen instant** is another story. This is the code every app writes, and
it is wrong:

```tsx
video.currentTime = 12.5;
await new Promise((r) => video.addEventListener("seeked", r, { once: true }));
context.drawImage(video, 0, 0); // may draw the PREVIOUS frame
```

`seeked` says the seek finished, not that the frame for the new position is
composited and readable by `drawImage`. The symptom is the worst kind: it works
on the machine it was written on and returns the neighbouring frame elsewhere,
with no error and no log.

`captureFrame` is that path, done once:

```tsx
import { captureFrame } from "tempest-react-sdk/imaging";

const poster = await captureFrame(video, { atMs: 10_000, width: 640 });

setPoster(URL.createObjectURL(poster.blob));
console.log(`landed on ${poster.atMs}ms, confirmed: ${poster.confirmed}`);
```

Without `atMs` it reads the current frame; with `atMs` it seeks, waits for that
instant's frame to be presented, captures, and **puts the player back**.

| Option | What it does |
| --- | --- |
| `atMs` | Instant to capture. Left out: the frame on screen now |
| `restore` | Put `currentTime` and playback back. Default `true` |
| `timeoutMs` | Ceiling for the seek and the frame after it. Default `3000` |
| `signal` | `AbortSignal`; rejects with `AbortError` |
| `width` / `height` / `fit` / `type` / `quality` | Same as `resizeImage` |

The result is a `ProcessedImage` with two extra fields: `atMs`, the instant
that actually came out, and `confirmed`.

!!! note "Why the `atMs` you get back differs from the one you asked for"
    A seek lands on a frame boundary. Asking for 12,500 ms in a 30 fps video
    gives you 12,466.67 ms — the frame **containing** that instant. The
    result's `atMs` is what happened; what you passed was the intent.

!!! note "`confirmed` says how sure the capture is — and for a seek it is `false`"
    `requestVideoFrameCallback` is the only signal that says "a frame was
    presented". Measured in Chromium, 2026-09-04: it fires while the video
    **plays** and does **not** fire for a seek on a paused element.

    So:

    - capturing from a **playing** video (the screen-recording print) waits for
      the next presented frame → `confirmed: true`;
    - capturing at an **`atMs`** waits for `seeked` plus two animation frames →
      `confirmed: false`, always;
    - capturing the current frame of a **paused** video waits for nothing — the
      frame on screen already is the frame.

    `false` on a seek is the normal result, not a warning. Treating it as a
    failure would reject the majority of correct captures. It is also why the
    seek does **not** block on the callback: waiting for a signal that state
    never emits would cost the whole `timeoutMs` on every capture and then
    proceed anyway.

!!! info "A recording may arrive with no duration"
    `MediaRecorder` does not guarantee a duration in the WebM header, so the
    blob `useVideoRecorder` just handed you may report `Infinity` — and that is
    exactly the video an app wants a frame from. Seeking past the end forces the
    browser to demux to the last frame, after which it knows the length. That
    probe runs in here, not in every caller.

    Measured 2026-09-04: Chromium **does** write the duration for a recording
    finalised in a single `stop()` (3.000197 s for 3 s of canvas), so the probe
    does not run on that path. It exists for the paths that omit it — chunked
    `timeslice` recording, and other browsers. `useVideoRecorder` keeps its own
    clock for the same reason.

!!! warning "A cross-origin video needs `crossOrigin`"
    Without `crossOrigin="anonymous"` on the element **before** the source
    loads, the video taints the canvas and reading it is not allowed.
    `drawImage` passes and the error shows up at encode time, far from its
    cause — `captureFrame` re-throws saying what to fix, but the attribute is on
    your tag and the server has to send `Access-Control-Allow-Origin`.

A live stream (`srcObject` from `getUserMedia`, `getDisplayMedia` or
`captureStream`) has no timeline: `atMs` there raises `FrameSeekError`. Leave
`atMs` out and you capture now, which is the only instant that exists.

### A print of a screen recording

It composes with `useScreenCapture` and `share`:

```tsx
import { useScreenCapture, shareOrDownloadBlob } from "tempest-react-sdk";
import { captureFrame } from "tempest-react-sdk/imaging";

function ScreenPrint() {
  const screen = useScreenCapture();
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (video.current) video.current.srcObject = screen.stream;
  }, [screen.stream]);

  async function print() {
    if (!video.current) return;
    const shot = await captureFrame(video.current, { type: "image/webp", quality: 0.9 });
    await shareOrDownloadBlob(shot.blob, "print.webp");
  }

  return (
    <>
      <button onClick={screen.start} disabled={!screen.supported}>Share screen</button>
      <video ref={video} autoPlay muted playsInline />
      <button onClick={print} disabled={screen.stream === null}>Take a print</button>
    </>
  );
}
```

## In React

```tsx
import { useImagePreview, useImageProcessing } from "tempest-react-sdk/imaging";

function PhotoUpload() {
  const [file, setFile] = useState<File | null>(null);
  const { url } = useImagePreview(file);
  const { compress, isWorking } = useImageProcessing();

  async function send() {
    if (file === null) return;
    const ready = await compress(file, { maxBytes: 1_000_000, width: 1600 });
    await fetch("/api/photos", { method: "POST", body: ready.blob });
  }

  return (
    <>
      {url !== null && <img src={url} alt="" />}
      <button disabled={isWorking || file === null} onClick={send}>Send</button>
    </>
  );
}
```

`useImagePreview` revokes the object URL when the source changes or the
component unmounts — without that the whole blob stays in memory for the
page's lifetime. `useImageProcessing` does not write state after unmount,
which is the case of a large photo finishing after the user left the screen.

## Off the main thread

Every function uses `OffscreenCanvas` where it exists, so they run inside a
worker unchanged:

```ts
// worker.ts
import { compressToTarget } from "tempest-react-sdk/imaging";

self.onmessage = async (event: MessageEvent<File>) => {
  const result = await compressToTarget(event.data, { maxBytes: 1_000_000 });
  self.postMessage(result.blob);
};
```

Worth doing: resizing a 12-megapixel photo on the main thread blocks the UI
for tens of milliseconds per image.

## API

| Symbol | What it is |
| --- | --- |
| `resizeImage(source, options?)` | Resizes and re-encodes |
| `cropImage(source, rect, options?)` | Crops in source pixels |
| `rotateImage(source, degrees, options?)` | Rotates by multiples of 90 |
| `flipImage(source, axes, options?)` | Mirrors |
| `compressToTarget(source, options)` | Binary-searches quality until it fits |
| `captureFrame(video, options?)` | One frame of a `<video>`, at the instant asked for |
| `createThumbnails(source, specs, options?)` | Several sizes, one decode |
| `decodeImage(source)` / `readImageInfo(blob)` | Oriented pixels / dimensions and size |
| `encodeImage(surface, options?)` | Canvas to bytes |
| `supportsImageType(type)` / `bestSupportedType(list)` | What this browser really encodes |
| `createSurface` / `getContext` / `drawScaled` | Canvas primitives |
| `useImagePreview(blob)` / `useImageProcessing()` | Hooks |

Errors: `ImagingError` at the root, with `ImageDecodeError`,
`ImageEncodeError`, `FrameSeekError`, `UnsupportedImageTypeError` and
`ImagingUnavailableError`. `FrameSeekError` is `captureFrame`'s: the seek never
landed, or the video has no timeline. It is its own class because the
alternative is returning a frame from the wrong instant, which is
indistinguishable from a correct one to everything downstream.

Each option's default is exported too, so a settings screen can show the value it
is about to override instead of restating it: `DEFAULT_QUALITY` (0.85),
`DEFAULT_TYPE` (`image/jpeg`), `DEFAULT_BACKGROUND` (`#ffffff`, the background
that replaces transparency on the way to JPEG) and, for `compressToTarget`'s
search, `DEFAULT_MIN_QUALITY` (0.4), `DEFAULT_MAX_QUALITY` (0.92) and
`DEFAULT_COMPRESS_STEPS` (6 iterations). `captureFrame` brings
`DEFAULT_FRAME_TIMEOUT_MS` (3000 ms), the ceiling on waiting for a seek.

## Recap

- Decode with `decodeImage` — phone orientation is already handled.
- Check the format with `supportsImageType`; trust the returned `type`.
- `compressToTarget` for a byte budget; `withoutEnlargement` stays on.
- Re-encoding drops EXIF — it is the privacy step as well as the bandwidth one.
- Video frames: `captureFrame` for a chosen instant — `seeked` alone draws the
  neighbouring frame. Read `confirmed` before trusting the instant.
- Run it in a worker: `OffscreenCanvas` is picked up automatically.
