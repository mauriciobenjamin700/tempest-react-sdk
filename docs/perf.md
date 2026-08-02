# Custo de inferência on-device

Quando a inferência roda no dispositivo do usuário, você perde o gráfico do
servidor. O que chega é um relato: *"o app está lento no celular do fulano"*.
E sem número, "lento" pode ser três coisas diferentes que pedem correções
opostas. 🤔

O módulo `perf` mede o que o navegador **realmente** consegue observar sobre
uma execução: quanto tempo cada etapa levou, o que o dispositivo diz sobre si
mesmo, e o tamanho dos pesos que você precachou.

!!! info "Não existe contador de energia no navegador"
    Nenhuma API web reporta joules ou FLOPs. "Custo computacional" aqui é
    montado com o que dá para observar de dentro da página. O que a
    plataforma não expõe vem `null` — nunca um número inventado.

## Cronometrando um pipeline

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

Três formas de registrar tempo:

| Método | Para |
| --- | --- |
| `stage(nome, fn)` | Trabalho assíncrono — o valor resolvido passa direto |
| `stageSync(nome, fn)` | Trabalho síncrono — idem, sem `await` |
| `mark(nome, ms)` | Duração que **você já tem** medida em outro lugar |

Nomes repetidos **acumulam**, então duas passadas da mesma natureza somam numa
linha só.

!!! tip "Uma etapa que lança ainda é medida"
    O `stage()` registra a duração no `finally` e repropaga o erro. Um pipeline
    que falhou também tem uma história de tempo para contar — geralmente a mais
    interessante.

## ⚠️ Etapas concorrentes não fatiam o total

Etapas são medidas de forma **independente**, não como um ladrilhamento da
execução. Duas etapas iniciadas juntas recebem cada uma o seu span de relógio
inteiro:

```typescript
const profiler = createInferenceProfiler();

const [modelo, imagem] = await Promise.all([
    profiler.stage("models", () => Detector.create("/models/detect.onnx")),
    profiler.stage("decode", () => createImageBitmap(blob)),
]);

const report = await profiler.report();
// timings.models + timings.decode > report.totalMs — e está certo:
// as duas rodaram ao mesmo tempo.
```

Isso é a leitura honesta para um pipeline que decodifica a imagem enquanto as
sessões carregam. Só cuide de **não** desenhar as barras como se fossem uma
divisão do total — diga na interface que são frações indicativas.

## Aproveitando o `speed` do `/vision`

Cada `predict()` do subpath `/vision` já devolve o próprio detalhamento em
`results[0].speed` (`load`, `preprocess`, `inference`, `postprocess`). Dobre o
que interessa para dentro do relatório com `mark`:

```typescript
const results = await profiler.stage("detect", () => detector.predict(blob));
profiler.mark("forward-pass", results[0].speed.inference);
```

Agora o relatório tem o custo da chamada inteira **e** o do kernel — e a
diferença entre os dois é exatamente quanto pré/pós-processamento você está
pagando.

## O perfil do dispositivo

```typescript
import { readDeviceProfile } from "tempest-react-sdk";

const device = readDeviceProfile();
// { hardwareConcurrency: 8, deviceMemoryGb: 8, jsHeapUsedMb: 137.4 }
```

| Campo | Origem | Disponível em |
| --- | --- | --- |
| `hardwareConcurrency` | `navigator.hardwareConcurrency` | Todos os navegadores modernos |
| `deviceMemoryGb` | `navigator.deviceMemory` | Chromium apenas |
| `jsHeapUsedMb` | `performance.memory` | Chromium apenas (não padronizado) |

Em Firefox e Safari os dois últimos vêm `null`. O `report()` já inclui esse
perfil, então normalmente você não precisa chamar direto — a função existe para
quando você quer o dado fora de uma execução.

!!! note "Seguro em SSR"
    Sem `navigator`, todos os campos vêm `null` em vez de estourar.

## Quanto pesam os modelos

Modelos que você baixa e precacha em Cache Storage são o maior custo fixo de um
app de inferência on-device. O `report()` mede quem você listar:

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

`bytes: null` significa uma de três coisas: o modelo não está em cache, o
Cache Storage não está disponível, ou a resposta guardada não tem
`Content-Length` (transferência chunked).

!!! warning "Por que o header e não o corpo"
    Ler `(await response.blob()).size` traria dezenas de megabytes de pesos
    para a memória só para descobrir o comprimento — a cada medição. O
    `cachedResponseBytes` lê só o `Content-Length`.

## Renderizando

`formatDurationMs` cobre a faixa que interessa aqui: milissegundos para um
forward pass, segundos para um cold start.

```typescript
import { formatBytes, formatDurationMs } from "tempest-react-sdk";

formatDurationMs(0.04); // "<1 ms"   — medido, mas rápido demais
formatDurationMs(142.6); // "143 ms"
formatDurationMs(4321); // "4.32 s"
formatDurationMs(NaN); // "—"

formatBytes(12582912); // "12 MB"
```

O `"<1 ms"` existe de propósito: `"0 ms"` seria lido como "não medido".

## Recap

- `createInferenceProfiler()` → `stage` / `stageSync` / `mark` → `report()`. ✅
- Etapas concorrentes somam mais que o `totalMs` — mostre isso na interface.
- `results[0].speed` do `/vision` entra no relatório via `mark`.
- Campos que a plataforma não expõe vêm `null`, para a UI mostrar "—".
- `formatDurationMs` + `formatBytes` para exibir.
