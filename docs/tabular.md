# Tabular (scikit-learn no navegador)

Modelo de scikit-learn respondendo **no navegador**, sem servidor de
inferência e sem enviar os dados do usuário pra lugar nenhum. O subpath
`tempest-react-sdk/tabular` roda o `.onnx` que o
[`tempest-fastapi-sdk`](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/recipes/modelops/)
exporta — mesmo arquivo, mesmo contrato, no cliente em vez de num
dispositivo.

```tsx
import { TabularPredictor } from "tempest-react-sdk/tabular";

const predictor = await TabularPredictor.create("/models/classifier.onnx");
const { labels, probabilities } = await predictor.predict([[5.1, 3.5, 1.4, 0.2]]);

console.log(labels[0], probabilities[0]);
```

```text
0 [0.6662, 0.1061, 0.2277]
```

## Quando isso vale a pena

| Vale | Não vale |
| --- | --- |
| Score que precisa aparecer enquanto o usuário digita | Modelo que muda de hora em hora |
| Dado sensível que não deve sair do dispositivo | Modelo grande (deep learning pesado) |
| App que precisa funcionar sem rede | Predição que exige dados que só o servidor tem |

Latência medida no Chromium: **0,2 ms** para um lote de 3 linhas numa
regressão logística; ~0,05 ms por linha numa floresta de 10 árvores. A conta
não é sobre computação — é sobre a viagem de rede que deixa de existir.

!!! tip "O que você economiza é a viagem, não o cálculo"
    Medido no lado do servidor com o `tempest-fastapi-sdk`: uma predição de
    uma linha custa **0,0075 ms de inferência dentro de 1,22 ms de HTTP** —
    160x mais transporte que modelo, e isso com cliente em processo, sem
    rede.

    No navegador esse 1,22 ms simplesmente não existe: a mesma predição sai
    em ~0,05 ms, local. Por isso o critério da tabela acima é sobre
    **frescor do modelo e tamanho**, não sobre velocidade de cálculo — a
    velocidade você já ganhou tirando a rede do caminho.

## O ciclo completo, de ponta a ponta

### 1. Exportar (Python)

```python
from tempest_fastapi_sdk.modelops import export_sklearn_to_onnx

export = export_sklearn_to_onnx(model, X_train[:100], "dist/classifier.onnx")
print(export.path, export.size_bytes)
```

!!! danger "Exportar com `skl2onnx` na mão quebra no navegador"
    Medido: o default do `skl2onnx` deixa o **ZipMap** ligado, e a saída de
    probabilidade vira uma *sequência de mapas*. O ONNX Runtime Web recusa
    valores que não são tensor — `Reading data from non-tensor typed value is
    not supported` — e a predição morre em runtime, não no build.

    `export_sklearn_to_onnx` desliga o ZipMap e exporta em float32 por
    isso. Se você tiver um `.onnx` de outra origem, o módulo detecta e o erro
    diz o que fazer em vez de repetir a mensagem do runtime.

### 2. Servir o arquivo

O `.onnx` é um asset estático. Coloque em `public/models/` e versione o nome
(`classifier-v3.onnx`) — assim o cache do navegador nunca serve um modelo
velho por engano.

### 3. Prever (React)

```tsx
import { useTabularPredictor } from "tempest-react-sdk/tabular";

function RiskWidget() {
  const { predict, isReady, error } = useTabularPredictor("/models/risk-v3.onnx");
  const [score, setScore] = useState<number | null>(null);

  async function onScore(features: number[]) {
    const { probabilities } = await predict([features]);
    setScore(probabilities[0]?.[1] ?? null);
  }

  if (error) return <p>Modelo indisponível: {error.message}</p>;

  return (
    <button disabled={!isReady} onClick={() => onScore([1, 2, 3, 4])}>
      {isReady ? "Calcular score" : "Carregando modelo..."}
    </button>
  );
}
```

O hook cuida do que todo componente erra igual: carregamento assíncrono,
cancelamento quando o componente desmonta antes de terminar, e liberação da
sessão (`release()`) — o heap do WebAssembly não encolhe sozinho no garbage
collector.

## Pacote de borda: o manifesto que vem do Python

Do lado do Python, `edge_pipeline` publica um **diretório**, não um arquivo:

```text
dist/risk/
├── risk.onnx          o grafo
├── risk.onnx.gz       o mesmo, ~10% do tamanho
├── baseline.json      referência de deriva
└── manifest.json      o contrato
```

Sirva esse diretório como asset estático e o navegador lê o mesmo contrato:

```tsx
import { loadEdgePackage } from "tempest-react-sdk/tabular";

const pkg = await loadEdgePackage("/models/risk/");

console.log(pkg.featureNames); // ["age", "income", "tenure", "score"]
console.log(pkg.classes);      // ["0", "1", "2"]

const { probabilities } = await pkg.predictor.predict([[41, 5200, 3, 0.82]]);
console.log(pkg.explain(probabilities[0]!));
```

```text
[{ name: "2", score: 0.7484 }, { name: "0", score: 0.1564 }, { name: "1", score: 0.0952 }]
```

!!! danger "A ordem das colunas é o campo que salva você"
    Modelo alimentado com as features certas **na ordem errada** responde com
    confiança e errado. Não existe checagem em runtime que pegue isso — o
    tensor tem a largura certa, os números são plausíveis, e a resposta é
    lixo.

    `featureNames` vem do treino, gravado pelo `edge_pipeline`. Use-o para
    montar a linha a partir do seu formulário, em vez de confiar que a ordem
    do `<form>` bate com a do `DataFrame` de seis meses atrás.

!!! info "Modelo que nasceu de um `.pkl`"
    Se o pacote foi gerado por `edge_pipeline_from_pickle`, o manifesto traz
    `source` — nome, SHA-256 e a versão do scikit-learn que converteu:

    ```tsx
    const manifest = await fetchEdgeManifest("/models/risk/");
    console.log(manifest.source?.file, manifest.source?.sha256.slice(0, 12));
    ```

    O `.pkl` **não** viaja para o navegador, e não é limitação: pickle é
    programa Python, não dado. O que viaja é o ONNX mais o carimbo de qual
    arquivo o produziu — o suficiente para rastrear um modelo rodando numa
    aba de volta até a esteira, seis meses depois.

### Checar versão sem baixar o modelo

```tsx
import { fetchEdgeManifest } from "tempest-react-sdk/tabular";

const manifest = await fetchEdgeManifest("/models/risk/");
if (manifest.version !== localStorage.getItem("risk-version")) {
  // modelo novo publicado — vale baixar
}
```

O manifesto tem algumas centenas de bytes. A `version` é derivada do
conteúdo, então republicar os mesmos bytes **não** parece versão nova.

!!! info "Compatibilidade é explícita"
    O `schema_version` é conferido. Pacote escrito por um SDK mais novo do
    que este leitor entende é **recusado**, com a instrução de atualizar —
    ler assim mesmo arriscaria interpretar errado justamente o campo de
    ordem das colunas. Campos desconhecidos, ao contrário, são ignorados: um
    acréscimo compatível não quebra nada.

## Instalação

`onnxruntime-web` é **peer dependency opcional**: só quem usa esse subpath
instala.

```bash
npm install onnxruntime-web
```

!!! danger "Importe o pacote padrão, nunca `onnxruntime-web/webgpu`"
    Medido no Chromium: o build WebGPU carrega um binário WebAssembly **sem o
    domínio `ai.onnx.ml`**, e a sessão nem chega a abrir —
    `No Op registered for TreeEnsembleClassifier`.

    Modelos de scikit-learn são feitos desses operadores
    (`TreeEnsembleClassifier`, `LinearClassifier`, `Scaler`), então não há
    velocidade sobrando pra buscar na GPU: o backend `wasm` é o único que os
    implementa, e é o default do módulo. Quando o erro acontece, ele vira
    `UnsupportedGraphError` com a instrução de trocar o import.

## Offline de verdade

São **duas** coisas que precisam estar no dispositivo, e esquecer a segunda é
o erro clássico.

### O modelo

Fica em Cache Storage na primeira visita:

```tsx
import { fetchModelBytes, isModelCached } from "tempest-react-sdk/tabular";

const bytes = await fetchModelBytes("/models/classifier-v3.onnx");
const predictor = await TabularPredictor.create(bytes);

console.log(await isModelCached("/models/classifier-v3.onnx")); // true
```

Cache-first, não network-first: um arquivo de modelo é imutável para uma dada
versão, então revalidar a cada carga gasta uma ida à rede pra não aprender
nada. Publique versão nova sob URL nova (ou passe `revalidate: true`).

O hook faz isso sozinho quando a fonte é uma URL — `cache: false` desliga.

### O runtime

```tsx
import { configureOrtAssets, ortAssetUrls } from "tempest-react-sdk/tabular";

configureOrtAssets("/ort/");
```

!!! warning "O ONNX Runtime Web não embute o WebAssembly — nem nos builds `.bundle`"
    Medido: servindo o app sem os `.wasm` ao lado, a criação da sessão falha
    com `Aborted(both async and sync fetching of the wasm failed)` — uma
    mensagem que não diz qual arquivo faltou. No Chromium o arquivo buscado
    foi `ort-wasm-simd-threaded.jsep.wasm`.

    Copie os binários de `node_modules/onnxruntime-web/dist/` para o seu
    diretório público no build, e precache junto:

    ```ts
    import { installPrecache } from "tempest-react-sdk/sw";
    import { ortAssetUrls } from "tempest-react-sdk/tabular";

    installPrecache([...ortAssetUrls("/ort/"), "/index.html"]);
    ```

    Qual binário é buscado depende do suporte a threads e SIMD do navegador,
    então um app que precisa funcionar em todo lugar leva todos —
    `ORT_WASM_ASSETS` tem a lista.

## Detalhes que o módulo resolve por você

!!! info "Rótulo int64 chega como `bigint`"
    O ONNX Runtime Web devolve o tensor de rótulo como `BigInt64Array`. Quem
    compara `label === 1` recebe `false` em silêncio, e `JSON.stringify`
    lança. O módulo converte para `number` — índice de classe nunca chega
    perto de `Number.MAX_SAFE_INTEGER`.

!!! info "Qual saída é qual"
    Classificador devolve `label` + `probabilities`; regressor devolve um
    único `variable`. Indexar por posição funciona até o dia em que você
    publica o outro tipo. `predictor.info` diz o que foi carregado:

    ```ts
    console.log(predictor.info);
    // { inputName: "input", numFeatures: 4, isClassifier: true, ... }
    ```

!!! info "Linha de largura errada falha antes do runtime"
    `FeatureShapeError` nomeando a expectativa (`o modelo espera 4 features
    por linha, recebeu 2`), em vez de um erro opaco vindo do WebAssembly.
    Lote irregular também: o erro diz **qual linha**.

## Erros

Todos herdam de `TabularError`, então dá pra pegar a família inteira. O
`name` é literal — o minificador renomeia classes, e um build real reportava
`error.name === "t"` antes disso ser corrigido.

| Erro | Quando |
| --- | --- |
| `UnsupportedGraphError` | Runtime sem os operadores `ai.onnx.ml` (build WebGPU) |
| `ModelLoadError` | Bytes não viraram sessão |
| `ModelFetchError` | Offline e nada em cache — problema de deploy, não de modelo |
| `FeatureShapeError` | Lote vazio, irregular ou da largura errada |
| `InferenceError` | Rodou mas a saída não é legível (export com ZipMap) |

## API

| Símbolo | O que é |
| --- | --- |
| `TabularPredictor.create(source, options?)` | Carrega um modelo (URL ou bytes) |
| `predictor.predict(rows)` | Prediz um lote; devolve `labels`, `probabilities`, `ms` |
| `predictor.info` | Entrada, nº de features, saídas, providers em uso |
| `predictor.dispose()` | Libera a sessão |
| `useTabularPredictor(source, options?)` | Hook com `status`/`isReady`/`predict`/`reload` |
| `loadEdgePackage(directoryUrl, options?)` | Carrega um pacote publicado pelo `edge_pipeline` |
| `fetchEdgeManifest(directoryUrl)` | Só o manifesto — versão, colunas, classes |
| `fetchModelBytes(url, options?)` | Bytes do cache, com rede como fallback |
| `isModelCached(url)` / `cacheModelBytes` / `clearModelCache` | Gestão do cache |
| `configureOrtAssets(basePath)` / `ortAssetUrls(basePath)` / `ORT_WASM_ASSETS` | Assets do runtime |
| `DEFAULT_TABULAR_PROVIDERS` | `["wasm"]`, pelo motivo acima |

## Recapitulando

- Exporte com `export_sklearn_to_onnx` — ZipMap ligado não roda no navegador.
- Importe `onnxruntime-web`, **não** o subpath `/webgpu`.
- Sirva o `.onnx` como asset versionado; o cache cuida do resto.
- Copie e precache os `.wasm`, senão "offline" só funciona online.
- Use o hook em componente; a classe direto em worker ou fora do React.
