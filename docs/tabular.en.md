# Tabular (scikit-learn in the browser)

A scikit-learn model answering **in the browser** — no inference server, and
the user's data never leaves the device. The `tempest-react-sdk/tabular`
subpath runs the `.onnx` file that
[`tempest-fastapi-sdk`](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/en/recipes/modelops/)
exports: same file, same contract, on the client instead of on a device.

```tsx
import { TabularPredictor } from "tempest-react-sdk/tabular";

const predictor = await TabularPredictor.create("/models/classifier.onnx");
const { labels, probabilities } = await predictor.predict([[5.1, 3.5, 1.4, 0.2]]);

console.log(labels[0], probabilities[0]);
```

```text
0 [0.6662, 0.1061, 0.2277]
```

## When this is worth it

| Worth it | Not worth it |
| --- | --- |
| A score that must appear while the user types | A model that changes hourly |
| Sensitive data that should not leave the device | A large (deep learning) model |
| An app that has to work without a network | A prediction needing data only the server has |

Measured in Chromium: **0.2 ms** for a 3-row batch on a logistic regression,
about 0.05 ms per row on a 10-tree forest. The win is not compute — it is the
network round trip that stops existing.

## The whole loop, end to end

### 1. Export (Python)

```python
from tempest_fastapi_sdk.modelops import export_sklearn_to_onnx

export = export_sklearn_to_onnx(model, X_train[:100], "dist/classifier.onnx")
print(export.path, export.size_bytes)
```

!!! danger "Exporting with raw `skl2onnx` breaks in the browser"
    Measured: skl2onnx's default leaves **ZipMap** enabled, which makes the
    probability output a *sequence of maps*. ONNX Runtime Web refuses
    non-tensor values — `Reading data from non-tensor typed value is not
    supported` — and the prediction dies at runtime, not at build time.

    `export_sklearn_to_onnx` disables ZipMap and exports float32 for exactly
    that reason. If your `.onnx` comes from somewhere else, this module
    detects the case and the error tells you what to do instead of repeating
    the runtime's message.

### 2. Serve the file

The `.onnx` is a static asset. Put it in `public/models/` and version the
name (`classifier-v3.onnx`), so a browser cache can never quietly serve a
stale model.

### 3. Predict (React)

```tsx
import { useTabularPredictor } from "tempest-react-sdk/tabular";

function RiskWidget() {
  const { predict, isReady, error } = useTabularPredictor("/models/risk-v3.onnx");
  const [score, setScore] = useState<number | null>(null);

  async function onScore(features: number[]) {
    const { probabilities } = await predict([features]);
    setScore(probabilities[0]?.[1] ?? null);
  }

  if (error) return <p>Model unavailable: {error.message}</p>;

  return (
    <button disabled={!isReady} onClick={() => onScore([1, 2, 3, 4])}>
      {isReady ? "Score" : "Loading model..."}
    </button>
  );
}
```

The hook owns what every component gets wrong the same way: the async load,
cancellation when the component unmounts mid-flight, and releasing the
session — the WebAssembly heap does not shrink on garbage collection alone.

## Installation

`onnxruntime-web` is an **optional peer dependency**: only users of this
subpath install it.

```bash
npm install onnxruntime-web
```

!!! danger "Import the default entry, never `onnxruntime-web/webgpu`"
    Measured in Chromium: the WebGPU build loads a WebAssembly binary
    **without the `ai.onnx.ml` domain**, and the session never even opens —
    `No Op registered for TreeEnsembleClassifier`.

    scikit-learn models are made of those operators
    (`TreeEnsembleClassifier`, `LinearClassifier`, `Scaler`), so there is no
    speed to chase on the GPU: the `wasm` backend is the only one that
    implements them, and it is this module's default. When the error does
    happen it becomes an `UnsupportedGraphError` naming the import to change.

## Actually offline

**Two** things have to be on the device, and forgetting the second one is
the classic mistake.

### The model

Cached in Cache Storage on the first visit:

```tsx
import { fetchModelBytes, isModelCached } from "tempest-react-sdk/tabular";

const bytes = await fetchModelBytes("/models/classifier-v3.onnx");
const predictor = await TabularPredictor.create(bytes);

console.log(await isModelCached("/models/classifier-v3.onnx")); // true
```

Cache-first, not network-first: a model file is immutable for a given
version, so revalidating on every load spends a round trip to learn nothing.
Publish a new version under a new URL (or pass `revalidate: true`).

The hook does this for you when the source is a URL — `cache: false` opts
out.

### The runtime

```tsx
import { configureOrtAssets, ortAssetUrls } from "tempest-react-sdk/tabular";

configureOrtAssets("/ort/");
```

!!! warning "ONNX Runtime Web does not embed its WebAssembly — not even in the `.bundle` builds"
    Measured: serving the app without the `.wasm` files alongside it, session
    creation fails with `Aborted(both async and sync fetching of the wasm
    failed)` — a message that never names the missing file. In Chromium the
    file requested was `ort-wasm-simd-threaded.jsep.wasm`.

    Copy the binaries from `node_modules/onnxruntime-web/dist/` into your
    public directory at build time, and precache them:

    ```ts
    import { installPrecache } from "tempest-react-sdk/sw";
    import { ortAssetUrls } from "tempest-react-sdk/tabular";

    installPrecache([...ortAssetUrls("/ort/"), "/index.html"]);
    ```

    Which binary is fetched depends on the browser's threading and SIMD
    support, so an app that must work everywhere ships all of them —
    `ORT_WASM_ASSETS` has the list.

## Details the module handles for you

!!! info "int64 labels arrive as `bigint`"
    ONNX Runtime Web returns the label tensor as a `BigInt64Array`. A caller
    comparing `label === 1` silently gets `false`, and `JSON.stringify`
    throws. The module converts to `number` — a class index never approaches
    `Number.MAX_SAFE_INTEGER`.

!!! info "Which output is which"
    A classifier returns `label` + `probabilities`; a regressor returns a
    single `variable`. Indexing by position works until the day you ship the
    other kind. `predictor.info` says what was loaded:

    ```ts
    console.log(predictor.info);
    // { inputName: "input", numFeatures: 4, isClassifier: true, ... }
    ```

!!! info "A row of the wrong width fails before the runtime"
    A `FeatureShapeError` naming the expectation (`the model expects 4
    features per row, got 2`) instead of an opaque WebAssembly error. Ragged
    batches too — the error says **which row**.

## Errors

They all extend `TabularError`, so the whole family can be caught at once.
`name` is a literal string: minifiers rename classes, and a real build
reported `error.name === "t"` before that was fixed.

| Error | When |
| --- | --- |
| `UnsupportedGraphError` | Runtime without the `ai.onnx.ml` operators (WebGPU build) |
| `ModelLoadError` | The bytes did not become a session |
| `ModelFetchError` | Offline with nothing cached — a deployment problem, not a model problem |
| `FeatureShapeError` | Empty, ragged, or wrong-width batch |
| `InferenceError` | It ran but the output is unreadable (ZipMap export) |

## API

| Symbol | What it is |
| --- | --- |
| `TabularPredictor.create(source, options?)` | Loads a model (URL or bytes) |
| `predictor.predict(rows)` | Predicts a batch; returns `labels`, `probabilities`, `ms` |
| `predictor.info` | Input, feature count, outputs, providers in use |
| `predictor.dispose()` | Releases the session |
| `useTabularPredictor(source, options?)` | Hook with `status`/`isReady`/`predict`/`reload` |
| `fetchModelBytes(url, options?)` | Bytes from cache, network as fallback |
| `isModelCached(url)` / `cacheModelBytes` / `clearModelCache` | Cache management |
| `configureOrtAssets(basePath)` / `ortAssetUrls(basePath)` / `ORT_WASM_ASSETS` | Runtime assets |
| `DEFAULT_TABULAR_PROVIDERS` | `["wasm"]`, for the reason above |

## Recap

- Export with `export_sklearn_to_onnx` — a ZipMap export does not run in a browser.
- Import `onnxruntime-web`, **not** the `/webgpu` subpath.
- Serve the `.onnx` as a versioned asset; the cache handles the rest.
- Copy and precache the `.wasm` files, or "offline" only works online.
- Use the hook in a component; the class directly in a worker or outside React.
