# Vision (ONNX Runtime Web)

Visão computacional **no dispositivo** — direto no navegador, sem servidor de
inferência, sem upload da imagem pra lugar nenhum. O subpath
`tempest-react-sdk/vision` roda três tarefas clássicas em modelos ONNX:
**classificação** (que imagem é essa?), **detecção** (onde estão os objetos?) e
**segmentação de instâncias** (qual o contorno exato de cada objeto?) — mais o
pipeline fundido **detect→classify** num arquivo só.

A API é a mesma para todas: você cria um objeto com
`await Tarefa.create(modelo, opções)`, chama `predict(imagem)` e recebe um array
de resultados — um por imagem. Aprende uma, sabe as quatro.

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
`iouThreshold: 0.45`, `maxDetections: 300` e `inputSize: [640, 640]` — este
último só entra em cena quando o modelo não declara resolução (ver
[A resolução vem do modelo](#a-resolucao-vem-do-modelo)).

### `raiseOnEmpty` — quando "não achei nada" é erro

Por padrão, uma run que não encontra nada resolve com um envelope **vazio**:
olhar e não achar é uma inferência bem-sucedida. Quando o vazio deve **parar** o
fluxo em volta (um wizard que exige ao menos um documento na foto, por exemplo),
ligue `raiseOnEmpty` e trate o `NoDetectionsError`:

```tsx
import { Detector, NoDetectionsError } from "tempest-react-sdk/vision";

const det = await Detector.create("/models/yolov8n.onnx", {
  confThreshold: 0.7,
  raiseOnEmpty: true,
});

try {
  const result = (await det.predict("/images/doc.jpg"))[0];
  console.log(result.length); // sempre ≥ 1 aqui
} catch (err) {
  if (err instanceof NoDetectionsError) {
    // NoDetectionsError: No detections in /images/doc.jpg: nothing cleared
    // confThreshold=0.7.
    console.warn(err.message);
  }
}
```

A flag existe no `create()` e como override por chamada
(`det.predict(img, { raiseOnEmpty: false })`). Vale para `Detector`, `Segmenter`
e [`DetectClassify`](#detectclassify-detectar-e-classificar-num-modelo-so) — os
três compartilham a mesma mensagem, que nomeia o threshold aplicado e, quando
existirem, a imagem e o filtro de classes que estreitaram a busca.

!!! note "Vazio continua sendo o default — de propósito"
    Coleção vazia não é erro (é a mesma regra dos endpoints de listagem do
    SDK). `raiseOnEmpty` é opt-in porque só quem conhece o fluxo em volta sabe
    se zero linhas é resultado ou falha.

## Classifier — que imagem é essa

`Classifier` aplica pré-processamento estilo ImageNet (224×224 por padrão,
normalização com média/desvio do ImageNet) e devolve a distribuição de
probabilidades. `labels` é opcional: sem ele valem os `names` que o export
gravou no `.onnx` (ver [Rótulos vêm do modelo](#rotulos-vem-do-modelo)). Um
ResNet ImageNet baixado pronto normalmente **não** traz `names`, então aí você
passa a lista:

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

## DetectClassify — detectar e classificar num modelo só

O caso clássico de duas etapas: um detector acha os objetos, e um classificador
diz **qual sub-categoria** cada objeto é ("tem um pássaro aqui" → "é um
bem-te-vi"). Fazer isso com dois `.onnx` custa dois downloads, duas
inicializações de sessão (WASM/WebGPU) e uma ida-e-volta pelo JavaScript por
recorte — cortar, redimensionar e reempilhar as regiões antes do segundo modelo
ver qualquer coisa.

`DetectClassify` roda um `.onnx` **fundido**: os dois modelos mais a ponte de
crop-and-resize entre eles vivem no mesmo grafo. Um download, uma sessão,
nenhuma ida-e-volta.

```tsx
import { DetectClassify } from "tempest-react-sdk/vision";

const pipeline = await DetectClassify.create("/models/birds-pipeline.onnx");

const result = (await pipeline.predict("/images/flock.jpg"))[0];

for (const d of result) {
  console.log(d.name, d.conf.toFixed(2)); // o que o detector viu
  console.log(d.classification?.name, d.classification?.conf); // a espécie
}
```

!!! info "O arquivo fundido é construído em Python"
    A fusão é um passo de build do `ort-vision-sdk` em Python
    (`ort_vision_sdk.compose.fuse_detect_classify`, 0.7.0+). O navegador só
    **roda** o pipeline pronto. Carregar um `.onnx` comum aqui lança
    `FusionError` com a mensagem apontando o caminho certo (usar
    `Detector`/`Classifier`, ou fundir antes).

Nada é reconfigurado do lado do JavaScript: a resolução do letterbox, o tamanho
do crop, se a saída do classificador ainda precisa de softmax e os nomes de
classe **das duas etapas** são lidos do metadata `ovs.*` que a fusão gravou no
arquivo. Por isso um pipeline fundido uma vez se comporta igual nos dois
runtimes. Pra inspecionar isso na mão, `readFusionSpec(session.metadata)` devolve
o `FusionSpec`, e a task expõe o seu em `pipeline.spec`.

### O envelope tem dois espaços de rótulo

`DetectClassifyResults` é iterável como o do `Detector`, e cada item é uma
`DetectionResult` normal (`cls`/`conf`/`name`/`box` + aliases, `croppedImage`)
com um campo a mais:

| Acesso                     | Tipo                          | O que é                                        |
| -------------------------- | ----------------------------- | ---------------------------------------------- |
| `d.classification`         | `ClassificationResult \| null`| o que o classificador disse **daquele recorte** |
| `result.names`             | `Record<number, string>`      | rótulos da etapa de **detecção**                |
| `result.classifierNames`   | `Record<number, string>`      | rótulos da etapa de **classificação**           |
| `result.boxes`             | `Boxes`                       | a mesma view em massa do `Detector`             |

Os dois mapas são separados porque as duas etapas respondem perguntas
diferentes, com espaços de classe sem relação entre si — colapsar num só perderia
uma das respostas. Para sobrescrever, `labels` vale pra detecção e
`classifierLabels` pra classificação.

### Filtros do pipeline

```tsx
const result = (
  await pipeline.predict(img, {
    confThreshold: 0.5, // filtra **além** do NMS já fixado na fusão
    classes: [14], // só a classe 14 do detector
    topK: 3, // trunca d.classification.probabilities
    raiseOnEmpty: true, // vazio vira NoDetectionsError
  })
)[0];
```

!!! warning "O threshold da fusão é um piso, não um teto"
    O NMS e o `confThreshold` do grafo foram fixados **no momento da fusão**.
    `confThreshold` aqui só filtra mais — não dá pra afrouxar pra baixo do que
    o arquivo já decidiu. Precisa de um piso menor? Refunda o pipeline em
    Python.

## A resolução vem do modelo

`inputSize` é opcional e serve de **fallback**. A resolução em que a task
pré-processa é lida do shape que o grafo `.onnx` declara:

```tsx
const clf = await Classifier.create("/models/classify.onnx", { labels: LABELS });
console.log(clf.inputSize); // [224, 224] — lido do arquivo, não configurado
```

!!! danger "Por que isso não podia ficar na configuração"
    Um export `-cls` do Ultralytics sai em 224×224; um detector, em 640×640.
    Alimentar o grafo com o tamanho errado faz o ORT abortar a run com
    `Got invalid dimensions for input: images ... Got: 640 Expected: 224` — e o
    número só existe dentro do `.onnx`, então nenhuma constante, manifest ou env
    var ao lado dele podia acertar sozinha.

Passar um `inputSize` que contradiz um grafo estático emite um aviso no console
e é ignorado: obedecer ali só trocaria um problema corrigível por uma execução
que falha. Em modelos com eixo dinâmico o seu valor vale, e o default da task é
o último recurso.

A sessão também expõe o que leu, e agora sabe se liberar:

```tsx
console.log(clf.session.inputShape); // [1, 3, 224, 224] — null em eixo dinâmico
await clf.session.release(); // libera a sessão nativa
```

!!! tip "Telemetria honesta"
    `task.inputSize` é a resolução que a inferência **realmente** usou. Reportar
    o valor configurado esconde justamente o bug que você está caçando.

!!! warning "Celular com pouca memória: `release()` não é opcional"
    O ORT copia o `.onnx` para o heap WASM e aloca grafo e pesos **em cima** dessa
    cópia. Enquanto isso, os bytes que o SDK baixou para ler os metadados também
    estão vivos no heap JS — um modelo de 5 MB custa 5 MB + 5 MB + pesos no mesmo
    instante. O SDK lê os metadados **antes** de construir a sessão justamente para
    esse buffer morrer o quanto antes (desde a v0.38.1 — antes disso ele sobrevivia
    a toda a construção).

    Quando a conta não fecha, o ORT desiste com `Can't create a session. failed to
    allocate a buffer of size N`. Na ordem: **carregue um modelo por vez** (dois
    `create` concorrentes dobram o pico), chame `session.release()` no que sai de
    uso — soltar a referência JS **não** libera a sessão nativa — e decodifique a
    foto já reduzida, que num celular pesa mais que os dois modelos juntos. Se
    ainda não bastar, `readMetadata: false` **com `labels` explícito** tira o SDK do
    caminho: o ORT busca o modelo sozinho e nada aqui segura os bytes (o tamanho de
    entrada continua vindo do grafo; só os nomes das classes se perdem).

Os helpers puros por trás disso (`spatialInputSize`, `resolveInputSize`,
`declaredShapesFrom`) também são exportados, para quem monta o próprio pipeline
sem precisar importar tipos do `onnxruntime-web`.

## Rótulos vêm do modelo

`labels` é opcional nas três tarefas. Omitido, valem os `names` que o export
gravou nos metadados do `.onnx` — o Ultralytics escreve
`{0: 'deworm', 1: 'not_deworm'}` — e só um modelo sem `names` cai no preset COCO
(detecção/segmentação) ou em `class_<id>` (classificação):

```tsx
const det = await Detector.create("/models/detect.onnx");

console.log(det.labels); // ["ocular-mucosa"] — do modelo, não de um preset
console.log(det.numClasses); // 1 — deduzido do shape de saída (B, 4 + nc, N)
```

A precedência é a mesma do `ort-vision-sdk` em Python: o que você passa ganha,
depois os `names` do modelo, e por último o preset. Passar `numClasses` continua
validando os rótulos contra o modelo (`LabelMapError` se divergir).

!!! danger "Lista de rótulos à mão é o pior tipo de configuração"
    Ela não falha quando está errada — as predições só trocam de classe, e você
    descobre olhando resultado. Isso também consertou um tropeço real: um detector
    de **uma** classe **falhava** sem `labels` explícito, porque o default COCO de
    80 nomes discordava da contagem de classes do modelo.

A sessão expõe o que leu do arquivo, para quem quer os dados crus:

```tsx
console.log(det.session.metadata.task); // "detect" — o mapa que o export gravou
console.log(det.session.outputShape); // [1, 5, 8400] — null em eixo dinâmico
```

Os helpers puros também são exportados: `readModelMetadata`, `modelNames`,
`detectionNumClasses` e `classificationNumClasses`.

!!! info "Um modelo informado por URL é baixado pelo SDK"
    O `onnxruntime-web` não expõe o mapa de metadados do modelo (diferente do
    `custom_metadata_map` do Python), então os `metadata_props` são lidos dos
    próprios bytes do `.onnx`. É o mesmo download único, e `readMetadata: false`
    nas opções da sessão restaura o caminho anterior (o ORT busca a URL). Um fetch
    que falha ainda entrega a URL ao ORT, para não transformar perda de metadados
    em falha de carregamento.

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
    Omitir `labels` primeiro tenta os `names` do próprio modelo
    ([Rótulos vêm do modelo](#rotulos-vem-do-modelo)). Só quando o `.onnx` não
    carrega nenhum é que `Detector` e `Segmenter` assumem o preset **`"coco"`** —
    afinal os pesos YOLO mais comuns são treinados no COCO — e o `Classifier` gera
    `class_<id>` a partir da contagem de classes lida do shape de saída. Passar
    `numClasses` valida que a contagem de rótulos bate com a do modelo
    (`LabelMapError` se divergir).

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
(`0.2126*R + 0.7152*G + 0.0722*B`, escala `0..255`) de um frame já
decodificado — `<img>`, `<video>`, `<canvas>`, `ImageBitmap` ou
`OffscreenCanvas`. Faz downsample até no máximo `LUMINANCE_SAMPLE_MAX_EDGE`
(256px) antes de ler os pixels — estatisticamente equivalente pra um threshold e
ordens de magnitude mais rápido que ler o frame inteiro.

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

!!! tip "Foto de celular: decodifique reduzido e meça o mesmo frame"
    Uma foto de 12 MP virá a ~48 MB de RGBA se você decodificar inteira — mais que
    os dois modelos somados, e o pico onde o ORT começa a recusar sessão. Peça o
    frame já reduzido e trabalhe nele; `ImageBitmap` é aceito tanto aqui quanto no
    `predict()` das tasks, então o frame que você mede é o frame que você infere:

    ```tsx
    const frame = await createImageBitmap(photoBlob, {
      resizeWidth: 1280,
      resizeQuality: "high",
    });
    const luminance = computeImageLuminance(frame); // 0..255, sem outro decode
    const result = (await det.predict(frame))[0];
    frame.close(); // libera na hora, sem esperar o GC
    ```

    As caixas voltam no espaço do frame reduzido — multiplique pelo fator de
    escala se você persiste coordenadas na resolução original. E `close()` importa:
    é a única forma determinística de devolver a memória.

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

## `warmup()` — a primeira inferência não é representativa

A primeira run de uma sessão paga custos que nenhuma das seguintes paga: o
WebGPU compila os shaders nela, e o backend WASM materializa suas arenas. Num
celular isso vira "o primeiro frame demorou segundos, os outros levam dezenas de
milissegundos". `warmup()` roda o modelo uma vez num tensor de zeros, movendo
esse custo pra onde o usuário já está olhando um spinner:

```tsx
const det = await Detector.create("/models/yolov8n.onnx", { labels: "coco" });
await det.warmup(); // ainda na tela de carregamento

// a partir daqui, cada predict() é tempo de inferência de verdade
const result = (await det.predict(frame))[0];
```

Disponível em `Detector`, `Segmenter` e `DetectClassify`. `warmup(2)` roda duas
vezes — uma basta pro WASM, e o WebGPU às vezes só assenta na segunda. Em
`DetectClassify` é onde mais rende: dois modelos e a ponte compilam juntos na
primeira inferência.

## Quanto tempo levou

Todo envelope traz um `speed` com o tempo de cada etapa do `predict()`, em
milissegundos:

```typescript
const results = await detector.predict(blob);
console.log(results[0].speed);
// { load: 84.2, preprocess: 11.7, inference: 118.9, postprocess: 6.4 }
```

`preprocess` / `inference` / `postprocess` são as mesmas três chaves do
Ultralytics, medidas nas mesmas fronteiras. `load` é o fetch/decode que o
`predict()` faz por dentro quando você passa uma URL ou `Blob` — com cache
frio costuma ser a maior fatia da chamada. Criar a tarefa
(`Detector.create`) **não** entra: é custo de inicialização, pago uma vez.

Para medir o pipeline inteiro do app — incluindo o que acontece *entre* dois
`predict()` — use o [módulo `perf`](perf.md), e dobre o `speed` para dentro do
relatório com `profiler.mark("forward-pass", results[0].speed.inference)`.
O `SpeedTimer` também é exportado daqui, para quem quiser as mesmas fronteiras
do SDK em código próprio.

!!! tip "O `preprocess` de hoje é ~2x mais rápido que o de antes"
    As tarefas pré-processam pela `LetterboxPipeline`: um único `drawImage`
    redimensiona **e** posiciona o conteúdo dentro do alvo com padding, e um
    laço só lê o RGBA resultante escrevendo float32 planar num buffer reusado
    entre frames. Medido no Chromium, letterbox pra 640×640: 19,8 → 10,7 ms
    (1920×1080), 13,8 → 7,8 ms (1280×720), 6,8 → 3,1 ms (640×480) — com saída
    **bit-idêntica** à do caminho antigo. Os primitivos (`letterbox`, `resize`,
    `toCHW`, `toFloat32`, …) continuam exportados; quem quiser o caminho fundido
    em código próprio usa a `LetterboxPipeline` (ou `letterboxToTensorData`, a
    forma de uma chamada só).

## Referência: o que mais o subpath exporta

As tarefas cobrem o caminho comum. Abaixo está o resto da superfície — o que
você usa quando monta um pipeline próprio, roda um modelo com uma cabeça que o
SDK não conhece, ou precisa tratar uma falha específica.

| Grupo             | Exports                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| Sessão            | `OrtSession` (carrega o `.onnx`, expõe `metadata`/`inputName`), `resolveProviders`, `DEFAULT_PROVIDERS`, `VisionTask` (base das tarefas), `VERSION` |
| Entrada           | `loadImage` (qualquer `ImageInput` → `RGBImage`), `normalize`, `toTensor`, `toFloat32Tensor`, `zeroTensorData`, `fromCv2`/`toCv2` (BGR ↔ RGB) |
| Decodificação     | `decodeYolo` (cabeça anchor-free, v8→v12), `decodeYoloAnchors` (cabeça com âncoras), `decodeYoloSeg`, `nms`, `batchedNms` |
| Rótulos           | `resolveLabels`, `defaultLabels`, `parseNames`, `modelNames`, `readModelMetadata`, `COCO_CLASSES`      |
| Views em massa    | `Boxes`, `Masks`, `Probs` — as coleções "numpy-style" por trás de `result.boxes`/`.masks`/`.probs`    |
| Erros             | `OrtVisionError` (base), `ModelLoadError`, `ImageLoadError`, `InferenceError`, `LabelMapError`, `ProviderNotAvailableError`, `NoDetectionsError`, `FusionError` |
| Contrato de fusão | `readFusionSpec`, `FusionSpec`, `CropSource`, `INPUT_IMAGE`/`INPUT_SOURCE`/`INPUT_SCALE`/`INPUT_PAD`, `OUTPUT_BOXES`/`OUTPUT_SCORES`/`OUTPUT_CLASSES`/`OUTPUT_PROBS`/`OUTPUT_NUM_DETECTIONS`, `METADATA_PREFIX`, `FUSION_KIND_DETECT_CLASSIFY` |
| Auxiliares        | `requireDetections` (a checagem por trás do `raiseOnEmpty`), `SpeedTimer`, `softmax`, `topK`          |

!!! tip "Cabeça com âncoras: `decodeYoloAnchors`"
    `decodeYolo` cobre as cabeças anchor-free (o padrão de v8 em diante).
    Um modelo mais antigo — YOLOv5/v7, ou um export customizado que mantém as
    âncoras — decodifica com `decodeYoloAnchors`. Passar a saída errada pra
    função errada não dá erro: dá caixa em lugar nenhum.

!!! info "Todos os erros descendem de `OrtVisionError`"
    Um `catch (err) { if (err instanceof OrtVisionError) … }` pega tudo que o
    subpath lança, e as subclasses separam o que dá pra tratar: `ModelLoadError`
    (URL errada, 404, arquivo corrompido) pede outra URL,
    `ProviderNotAvailableError` pede outro provider, `LabelMapError` é
    configuração sua, e `InferenceError` é o modelo recusando a entrada.

## Paridade com o `ort-vision-sdk` em Python

Essa API espelha de propósito a do pacote Python
[`ort-vision-sdk`](https://pypi.org/project/ort-vision-sdk/) do mesmo autor:
`Classifier` / `Detector` / `Segmenter`, `predict()` devolvendo uma lista de 1
resultado por imagem, e os mesmos nomes idiomáticos do Ultralytics
(`cls`/`conf`/`name`/`box`, `boxes.xyxy`, `probs.top5`). Quem porta código de
visão entre o backend Python e o frontend TypeScript reaproveita o modelo mental
quase sem atrito.

A paridade vai além da forma da API: o `raiseOnEmpty` existe dos dois lados com
a **mesma mensagem** (inclusive o threshold formatado igual — `conf_threshold=1`
não vira `1.0` de um lado só), e um pipeline fundido pelo `compose` do Python é
lido aqui a partir do metadata que ele mesmo gravou. Fundir uma vez, rodar nos
dois runtimes, com o mesmo resultado.

## Recap

- Importe de **`tempest-react-sdk/vision`** — subpath dedicado. O código é
  vendorizado do `@mauriciobenjamin700/ort-vision-sdk-web` (MIT), então **já vem
  no SDK**, sem pacote extra.
- O **`onnxruntime-web` é peer dep opcional**: rode `npm i onnxruntime-web` e
  **sirva os `.wasm` da mesma versão**. Quem não importa do `/vision` não paga o
  peso. Providers: **WebGPU → WASM** (`DEFAULT_PROVIDERS`).
- Quatro tarefas, mesma forma: `await Tarefa.create(modelo, opções)` →
  `(await tarefa.predict(imagem))[0]`. O `predict` sempre devolve um array de
  **1 elemento** (um envelope por imagem).
- **`DetectClassify`** roda detector + classificador num `.onnx` **fundido**
  (construído pelo `compose` do SDK Python): um download, uma sessão, e a
  sub-categoria de cada objeto em `d.classification`. Modelo sem metadata de
  fusão → `FusionError`.
- **`warmup()`** paga a compilação de shader / arenas antes do usuário —
  chame na tela de carregamento. **`raiseOnEmpty`** transforma resultado vazio
  em `NoDetectionsError` quando zero linhas deve parar o fluxo (default:
  envelope vazio).
- Itere o envelope com `for...of` pra resultados por-instância:
  `d.name`/`d.className`, `d.confidence`/`d.conf`, `d.box`/`d.bbox` (com
  `.xyxy`/`.xywh`/`.asXywh()`/`.xyxyn()`). Ou use a view em massa `result.boxes`
  (`.xyxy`/`.cls`/`.conf`) e `result.names`.
- Entradas aceitas: URL `string`, `Blob`, `File`, `HTMLImageElement`, canvas
  (`HTMLCanvasElement`/`OffscreenCanvas`), `ImageBitmap`, `ImageData` e
  `RGBImage`.
- Rótulos via `resolveLabels` / `COCO_CLASSES`: preset `"coco"`, array, dict
  esparso ou auto-gerado. `labels` é **opcional** nas três tarefas — omitido,
  valem os `names` do próprio `.onnx`, e só um modelo sem eles cai no preset
  `"coco"` (det/seg) ou em `class_<id>` (classificação).
- A API espelha o `ort-vision-sdk` em Python — mesmo modelo mental nos dois
  lados.
- Pra **capturar** o frame: `useCameraStream` (câmera traseira por padrão,
  `error.kind` estável, `retry()`), `computeImageLuminance` +
  `isLuminanceAcceptable` + `LowLuminanceError` pra checar o brilho (threshold
  obrigatório) e `useLiveLuminance` pro feedback ao vivo. Pra pré-visualizar o
  `Blob` capturado, `useObjectUrl` (barrel principal).
