# Imaging (image processing in the browser)

A photo taken on a phone, handled **on the device**: resized, cropped,
rotated, re-encoded and fitted into a byte budget — no server, no
dependency, and the user's picture does not travel before it has to.

That is what a field PWA needs. It may be offline, the connection may be
metered, and the photo may carry GPS coordinates nobody asked to upload.

```tsx
import { compressToTarget } from "tempest-react-sdk/imaging";

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
| `createThumbnails(source, specs, options?)` | Several sizes, one decode |
| `decodeImage(source)` / `readImageInfo(blob)` | Oriented pixels / dimensions and size |
| `encodeImage(surface, options?)` | Canvas to bytes |
| `supportsImageType(type)` / `bestSupportedType(list)` | What this browser really encodes |
| `createSurface` / `getContext` / `drawScaled` | Canvas primitives |
| `useImagePreview(blob)` / `useImageProcessing()` | Hooks |

Errors: `ImagingError` at the root, with `ImageDecodeError`,
`ImageEncodeError`, `UnsupportedImageTypeError` and
`ImagingUnavailableError`.

## Recap

- Decode with `decodeImage` — phone orientation is already handled.
- Check the format with `supportsImageType`; trust the returned `type`.
- `compressToTarget` for a byte budget; `withoutEnlargement` stays on.
- Re-encoding drops EXIF — it is the privacy step as well as the bandwidth one.
- Run it in a worker: `OffscreenCanvas` is picked up automatically.
