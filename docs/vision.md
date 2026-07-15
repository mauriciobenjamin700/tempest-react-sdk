# Vision (ONNX Runtime Web)

Visão computacional **no dispositivo** — direto no navegador, sem servidor de
inferência, sem upload da imagem pra lugar nenhum. O subpath
`tempest-react-sdk/vision` roda três tarefas clássicas em modelos ONNX:
**classificação** (que imagem é essa?), **detecção** (onde estão os objetos?) e
**segmentação de instâncias** (qual o contorno exato de cada objeto?).

A API é a mesma para as três tarefas: você cria um objeto com
`await Tarefa.create(modelo, opções)`, chama `predict(imagem)` e recebe um array
de resultados — um por imagem. Aprende uma, sabe as três.

```tsx
import { Detector } from "tempest-react-sdk/vision";

const det = await Detector.create("/models/yolov8n.onnx", { labels: "coco" });
const result = (await det.predict("/images/street.jpg"))[0];

for (const d of result) {
  console.log(d.name, d.confidence, d.box.xyxy);
}
```

## Por que um subpath separado

As tarefas de visão não vêm do barrel principal. Você as importa de
`tempest-react-sdk/vision`:

```tsx
import { Classifier, Detector, Segmenter } from "tempest-react-sdk/vision";
```

!!! info "De onde vem esse módulo"
    O código de visão é **vendorizado** do
    [`@mauriciobenjamin700/ort-vision-sdk-web`](https://www.npmjs.com/package/@mauriciobenjamin700/ort-vision-sdk-web)
    (MIT, mesmo autor do SDK). Em vez de você instalar um pacote a mais, ele já
    vem **dentro** do `tempest-react-sdk` — basta importar do subpath `/vision`.
    A API espelha 1-para-1 a do pacote original.

### `onnxruntime-web` é peer dependency opcional

O motor que de fato roda os modelos `.onnx` — o
[`onnxruntime-web`](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)
— **não** vem junto. Ele é uma peer dependency **opcional**: o app o instala uma
vez, e o subpath de visão o reutiliza.

```bash
npm i onnxruntime-web
```

!!! warning "Sem o `onnxruntime-web`, a inferência não roda"
    Como o `onnxruntime-web` é peer dep **opcional**, o
    `npm install tempest-react-sdk` não o traz. Se você importar de
    `tempest-react-sdk/vision` sem ter rodado `npm i onnxruntime-web`, o build
    quebra com `Cannot find module 'onnxruntime-web'`. Ele fica **externalizado**
    no bundle do SDK — quem nunca importa do subpath `/vision` não paga esse peso
    (mesmo padrão do `recharts` nos charts e dos adapters que injetam a dep).

!!! danger "Você precisa servir os arquivos `.wasm`"
    O `onnxruntime-web` carrega o runtime via WebAssembly. Os arquivos `.wasm`
    correspondentes à **mesma versão** que você instalou têm que estar
    acessíveis em runtime (servidos pelo seu bundler ou copiados pra pasta
    pública). Versão do JS e dos `.wasm` desalinhadas é a causa nº 1 de "o modelo
    não carrega". Cada bundler tem sua receita (no Vite, costuma-se copiar os
    `.wasm` pra `public/` e apontar `ort.env.wasm.wasmPaths`).

!!! tip "WebGPU primeiro, WASM como fallback"
    Por padrão o SDK tenta os execution providers nesta ordem:
    `["webgpu", "wasm"]` (exportada como `DEFAULT_PROVIDERS`). O ORT-Web usa a
    GPU via **WebGPU** quando o navegador/dispositivo suporta e cai
    automaticamente para **WASM** (CPU) quando não. Você pode forçar a ordem
    passando `providers` nas opções de `create()`.

## A imagem de entrada

Todas as tarefas aceitam o **mesmo** conjunto de entradas — o tipo `ImageInput`.
Você não precisa decodificar nada na mão; o SDK resolve para o formato canônico
interno (`RGBImage`, HWC RGB uint8).

| Entrada              | Exemplo                                          |
| -------------------- | ------------------------------------------------ |
| `string` (URL)       | `det.predict("/images/cat.jpg")`                 |
| `Blob`               | `det.predict(await (await fetch(url)).blob())`   |
| `File`               | `det.predict(inputFile.files[0])`                |
| `HTMLImageElement`   | `det.predict(document.querySelector("img"))`     |
| `HTMLCanvasElement`  | `det.predict(canvas)`                            |
| `OffscreenCanvas`    | `det.predict(offscreen)`                         |
| `ImageBitmap`        | `det.predict(await createImageBitmap(blob))`     |
| `ImageData`          | `det.predict(ctx.getImageData(0, 0, w, h))`      |
| `RGBImage`           | `det.predict(rgbImage)` (formato canônico do SDK)|

!!! note "`File` entra pela porta do `Blob`"
    O tipo `ImageInput` lista `Blob`, e `File` é uma subclasse de `Blob` — então
    um `File` vindo de um `<input type="file">` é aceito direto, sem conversão.
    É o caminho natural pra "usuário escolheu uma foto".

## Detector — onde estão os objetos

`Detector` roda modelos YOLO anchor-free (v8/v9/v10/v11/v12) e devolve uma caixa
por objeto encontrado.

```tsx
import { Detector } from "tempest-react-sdk/vision";

const det = await Detector.create("/models/yolov8n.onnx", { labels: "coco" });

const result = (await det.predict("/images/street.jpg"))[0];

console.log(`${result.length} objetos detectados`);
for (const d of result) {
  console.log(d.name, d.confidence.toFixed(2), d.box.xyxy);
}
```

### A forma do resultado

`predict()` sempre devolve uma **Promise de um array de 1 elemento** — um
envelope por imagem, espelhando o `YOLO("img.jpg")` do Ultralytics. Por isso o
`[0]` logo após o `await`:

```tsx
const results = await det.predict(img); // DetectionResults[]
const result = results[0]; // DetectionResults
```

O envelope (`DetectionResults`) é **iterável**: percorrer com `for...of` dá uma
`DetectionResult` por objeto. Cada objeto traz nomes idiomáticos do estilo
Ultralytics **e** os nomes verbosos equivalentes — use o que preferir:

| Estilo Ultralytics | Nome verboso  | Tipo          | O que é                                  |
| ------------------ | ------------- | ------------- | ---------------------------------------- |
| `d.cls`            | `d.classId`   | `number`      | id numérico da classe                    |
| `d.name`           | `d.className` | `string`      | nome da classe (rótulo resolvido)        |
| `d.conf`           | `d.confidence`| `number`      | confiança em `[0, 1]`                     |
| `d.box`            | `d.bbox`      | `BoundingBox` | a caixa delimitadora                     |

A `BoundingBox` expõe as coordenadas em vários formatos:

```tsx
for (const d of result) {
  d.box.xyxy; // [x1, y1, x2, y2] em pixels absolutos (readonly tuple)
  d.box.xywh; // [cx, cy, w, h] com centro em (cx, cy)
  d.box.asXywh(); // [x, y, w, h] com canto superior-esquerdo em (x, y)
  d.box.xyxyn([result.origShape[0], result.origShape[1]]); // normalizado [0,1]
  d.box.width;
  d.box.height;
  d.box.area;
}
```

!!! tip "Visão em massa: a coleção `boxes`"
    Pra desenhar tudo numa só passada (num canvas, por exemplo), em vez de
    iterar use a view "numpy-style" `result.boxes`. Ela expõe arrays achatados:
    `boxes.xyxy` (`Float32Array` de `4 * N`), `boxes.cls` (`Int32Array`),
    `boxes.conf` (`Float32Array`), além de `boxes.xywh`, `boxes.xyxyn`,
    `boxes.xywhn` e `boxes.length`. E `result.names` mapeia id → nome, igual ao
    `model.names` do Ultralytics.

### Filtros e thresholds

```tsx
const result = (
  await det.predict(img, {
    confThreshold: 0.4, // só mantém detecções com confiança ≥ 0.4
    iouThreshold: 0.5, // IoU do non-maximum suppression
    classes: [0, 2], // só "person" (0) e "car" (2)
  })
)[0];
```

Os defaults (definidos no `create()`) são `confThreshold: 0.25`,
`iouThreshold: 0.45`, `maxDetections: 300` e `inputSize: [640, 640]`.

## Classifier — que imagem é essa

`Classifier` aplica pré-processamento estilo ImageNet (224×224, normalização com
média/desvio do ImageNet) e devolve a distribuição de probabilidades. Aqui
`labels` é **obrigatório** (não há preset de ImageNet embutido):

```tsx
import { Classifier } from "tempest-react-sdk/vision";

const labels = await fetch("/models/imagenet-classes.json").then((r) => r.json());

const clf = await Classifier.create("/models/resnet50.onnx", { labels });

const result = (await clf.predict("/images/dog.jpg"))[0];

console.log(result.cls, result.conf, result.name); // top-1
console.log(result.probs.top5, result.probs.top5conf); // top-5
```

O envelope `ClassificationResults` expõe atalhos pro top-1 (`cls`, `conf`,
`name`) e a coleção `probs` com a distribuição completa:

| Acesso              | Tipo          | O que é                                  |
| ------------------- | ------------- | ---------------------------------------- |
| `result.cls`        | `number`      | id da classe top-1                       |
| `result.conf`       | `number`      | confiança da classe top-1                |
| `result.name`       | `string`      | nome da classe top-1                     |
| `result.probs.top1` | `number`      | id da classe mais provável               |
| `result.probs.top5` | `Int32Array`  | ids das 5 classes mais prováveis         |
| `result.probs.data` | `Float32Array`| vetor completo de probabilidades         |

Pra truncar a lista por-classe ao top-K, passe `topK` em `predict`:

```tsx
const result = (await clf.predict(img, { topK: 3 }))[0];
for (const p of result.probabilities) {
  console.log(p.name, p.conf);
}
```

## Segmenter — o contorno de cada objeto

`Segmenter` roda modelos YOLO-seg (v8-seg / v11-seg / ...) e devolve, além da
caixa, uma **máscara binária por instância**.

```tsx
import { Segmenter } from "tempest-react-sdk/vision";

const seg = await Segmenter.create("/models/yolov8n-seg.onnx", { labels: "coco" });

const result = (await seg.predict("/images/street.jpg"))[0];

for (const inst of result) {
  console.log(inst.name, inst.conf, inst.box.xyxy);
  console.log(inst.mask.width, inst.mask.height); // máscara recortada na caixa
}
```

O envelope `SegmentationResults` é iterável (dá uma `SegmentationResult` por
instância) e ainda expõe duas views em massa:

- `result.boxes` — a mesma view de caixas do `Detector`.
- `result.masks` — coleção iterável de máscaras binárias, cada uma recortada na
  caixa da sua instância (`masks.length`, e cada item tem `data`, `width`,
  `height`).

Cada `SegmentationResult` carrega os mesmos campos da detecção (`cls`/`conf`/
`name`/`box` + aliases) mais:

- `mask` — a máscara binária (`Mask`, valores `0`/`255`, recortada na caixa).
- `segmentedImage` — o recorte original com o fundo zerado (pronto pra exibir).

## Rótulos: presets, listas e dicts

Como o navegador não tem sistema de arquivos, o SDK **não** lê rótulos de um
caminho — você passa os nomes direto. A função `resolveLabels` (e o campo
`labels` de cada tarefa) aceita:

```tsx
import { resolveLabels, COCO_CLASSES } from "tempest-react-sdk/vision";

resolveLabels("coco"); // preset → as 80 classes do COCO
resolveLabels(["gato", "cachorro"]); // array explícito, indexado por id
resolveLabels({ 0: "gato", 2: "pássaro" }); // dict esparso (lacunas viram class_1)
resolveLabels(null, { numClasses: 3 }); // auto: ["class_0", "class_1", "class_2"]

COCO_CLASSES; // o array readonly das 80 classes, em ordem canônica
```

!!! note "Default de rótulos por tarefa"
    `Detector` e `Segmenter` assumem o preset **`"coco"`** quando você omite
    `labels` — afinal os pesos YOLO mais comuns são treinados no COCO. O
    `Classifier` **não** tem default: `labels` é obrigatório, porque não há um
    preset de ImageNet embutido. Passar `numClasses` valida que a contagem de
    rótulos bate com a do modelo (`LabelMapError` se divergir).

## Hooks de câmera e luminância

Antes de rodar qualquer modelo você precisa de um **frame** — e de um frame que
preste. O subpath `/vision` traz três primitivas de navegador pra isso: abrir a
câmera, medir o brilho ao vivo e rejeitar capturas escuras demais. Elas são
genéricas (não dependem de nenhum modelo), mas moram no `/vision` porque é ali
que a captura acontece.

### `useCameraStream` — abrir a câmera

Pede um `MediaStream` via `getUserMedia`, prende num `<video>` e expõe
`status`/`error` já classificados, pra você renderizar os estados de permissão e
erro sem decorar os nomes de `DOMException`. O stream é liberado sozinho no
unmount e no `retry()`.

```tsx
import { useCameraStream } from "tempest-react-sdk/vision";

function CameraView() {
  const { status, error, videoRef, retry } = useCameraStream();

  if (status === "error") {
    return (
      <div>
        <p>{error?.message}</p>
        <button onClick={retry}>Tentar de novo</button>
      </div>
    );
  }

  return (
    <video ref={videoRef} playsInline muted style={{ opacity: status === "ready" ? 1 : 0.4 }} />
  );
}
```

Por padrão pede a câmera **traseira** (`facingMode: "environment"`) em Full-HD —
o ideal pra tirar foto de algo à sua frente. Desktops caem na única câmera que
expõem. Pra sobrescrever, passe `constraints`:

```tsx
const cam = useCameraStream({
  constraints: { video: { facingMode: "user" }, audio: false }, // câmera frontal
});
```

O `error.kind` é um enum estável — mapeie-o pra UI, não pra `error.message`:

| `kind`              | Quando acontece                                             |
| ------------------- | ----------------------------------------------------------- |
| `unsupported`       | navegador sem `getUserMedia` (ou SSR).                      |
| `insecure`          | página fora de HTTPS (contexto não seguro).                 |
| `permission-denied` | usuário negou (ou o SO bloqueou) o acesso.                  |
| `no-camera`         | nenhum dispositivo de câmera / constraints impossíveis.     |
| `in-use`            | a câmera está presa por outro app.                          |
| `unknown`           | qualquer outra falha (a mensagem original vem em `message`).|

!!! warning "Câmera só em contexto seguro"
    `getUserMedia` só funciona sob **HTTPS** (ou `localhost`). Numa origem
    insegura o hook devolve `status: "error"` com `kind: "insecure"` — não é bug,
    é política do navegador. As mensagens em `error.message` são em **inglês**;
    traduza na sua camada de i18n se precisar.

### `computeImageLuminance` + `useLiveLuminance` — medir o brilho

`computeImageLuminance` calcula a **luminância média BT.709**
(`0.2126*R + 0.7152*G + 0.0722*B`, escala `0..255`) de um `<img>`, `<video>` ou
`<canvas>` já decodificado. Faz downsample até no máximo
`LUMINANCE_SAMPLE_MAX_EDGE` (256px) antes de ler os pixels — estatisticamente
equivalente pra um threshold e ordens de magnitude mais rápido que ler o frame
inteiro.

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

!!! note "O threshold é seu"
    `isLuminanceAcceptable(luminance, threshold)` recebe o `threshold`
    **obrigatoriamente** — o valor ideal depende do seu modelo, da luz em que ele
    foi treinado e da taxa de rejeição aceitável. O SDK não crava um default.
    `LowLuminanceError` carrega `.luminance` e `.threshold` pra você mostrar
    feedback acionável.

Pra feedback **ao vivo** (barra de brilho, borda que muda de cor enquanto a
câmera está aberta), `useLiveLuminance` amostra o `<video>` num laço de
`requestAnimationFrame`, reaproveitando um único canvas offscreen:

```tsx
import { useCameraStream, useLiveLuminance, isLuminanceAcceptable } from "tempest-react-sdk/vision";

function BrightnessGuardedCamera() {
  const { status, videoRef } = useCameraStream();
  const luminance = useLiveLuminance(videoRef, { enabled: status === "ready" });
  const bright = isLuminanceAcceptable(luminance, 70);

  return (
    <div style={{ border: `3px solid ${bright ? "green" : "orange"}` }}>
      <video ref={videoRef} playsInline muted />
      {!bright && <p>Ambiente escuro — aproxime-se de uma luz.</p>}
    </div>
  );
}
```

Ele pausa sozinho quando `enabled` é `false` ou enquanto o vídeo ainda não está
pronto (`readyState < 2`), e é limitado por `intervalMs` (padrão `160`, ~6 fps —
mais que suficiente pra UX).

!!! tip "Pré-visualizar o frame capturado: `useObjectUrl`"
    Depois de exportar o frame pra um `Blob` (`canvas.toBlob(...)`), use o
    [`useObjectUrl`](hooks.md) (barrel principal, `tempest-react-sdk`) pra virar
    um `src` de `<img>` sem vazar memória — ele cria o `URL.createObjectURL` e o
    revoga sozinho quando o blob muda ou o componente desmonta.

    ```tsx
    import { useObjectUrl } from "tempest-react-sdk";

    const previewUrl = useObjectUrl(capturedBlob);
    return previewUrl ? <img src={previewUrl} alt="Prévia" /> : null;
    ```

## Paridade com o `ort-vision-sdk` em Python

Essa API espelha de propósito a do pacote Python
[`ort-vision-sdk`](https://pypi.org/project/ort-vision-sdk/) do mesmo autor:
`Classifier` / `Detector` / `Segmenter`, `predict()` devolvendo uma lista de 1
resultado por imagem, e os mesmos nomes idiomáticos do Ultralytics
(`cls`/`conf`/`name`/`box`, `boxes.xyxy`, `probs.top5`). Quem porta código de
visão entre o backend Python e o frontend TypeScript reaproveita o modelo mental
quase sem atrito.

## Recap

- Importe de **`tempest-react-sdk/vision`** — subpath dedicado. O código é
  vendorizado do `@mauriciobenjamin700/ort-vision-sdk-web` (MIT), então **já vem
  no SDK**, sem pacote extra.
- O **`onnxruntime-web` é peer dep opcional**: rode `npm i onnxruntime-web` e
  **sirva os `.wasm` da mesma versão**. Quem não importa do `/vision` não paga o
  peso. Providers: **WebGPU → WASM** (`DEFAULT_PROVIDERS`).
- Três tarefas, mesma forma: `await Tarefa.create(modelo, opções)` →
  `(await tarefa.predict(imagem))[0]`. O `predict` sempre devolve um array de
  **1 elemento** (um envelope por imagem).
- Itere o envelope com `for...of` pra resultados por-instância:
  `d.name`/`d.className`, `d.confidence`/`d.conf`, `d.box`/`d.bbox` (com
  `.xyxy`/`.xywh`/`.asXywh()`/`.xyxyn()`). Ou use a view em massa `result.boxes`
  (`.xyxy`/`.cls`/`.conf`) e `result.names`.
- Entradas aceitas: URL `string`, `Blob`, `File`, `HTMLImageElement`, canvas
  (`HTMLCanvasElement`/`OffscreenCanvas`), `ImageBitmap`, `ImageData` e
  `RGBImage`.
- Rótulos via `resolveLabels` / `COCO_CLASSES`: preset `"coco"`, array, dict
  esparso ou auto-gerado. `Detector`/`Segmenter` assumem `"coco"`; `Classifier`
  exige `labels`.
- A API espelha o `ort-vision-sdk` em Python — mesmo modelo mental nos dois
  lados.
- Pra **capturar** o frame: `useCameraStream` (câmera traseira por padrão,
  `error.kind` estável, `retry()`), `computeImageLuminance` +
  `isLuminanceAcceptable` + `LowLuminanceError` pra checar o brilho (threshold
  obrigatório) e `useLiveLuminance` pro feedback ao vivo. Pra pré-visualizar o
  `Blob` capturado, `useObjectUrl` (barrel principal).
