# Imaging (processamento de imagem no navegador)

Foto tirada no celular, tratada **no aparelho**: redimensiona, corta, gira,
troca de formato e cabe num orçamento de bytes — sem servidor, sem
dependência, sem a imagem do usuário viajar antes da hora.

É o que um PWA de campo precisa. Pode estar offline, a conexão pode ser
cara, e a foto pode ter GPS embutido que ninguém pediu para enviar.

```tsx
import { compressToTarget } from "tempest-react-sdk/imaging";

// `file` é o que um <input type="file"> entrega: event.target.files[0]
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

## O que ele resolve por você

### Foto de celular vem deitada

Retrato é gravado como paisagem mais uma etiqueta de rotação. Quem decodifica
sem honrar a etiqueta mostra **toda** foto vertical de lado — o bug mais
reportado em fluxo de upload.

```tsx
import { decodeImage } from "tempest-react-sdk/imaging";

const { width, height } = await decodeImage(file); // já na orientação certa
```

Medido no Chromium: JPEG 120x60 com `Orientation=6` decodifica como 60x120.

### Formato não suportado falha em silêncio

```tsx
import { bestSupportedType, supportsImageType } from "tempest-react-sdk/imaging";

const type = await bestSupportedType(["image/avif", "image/webp", "image/jpeg"]);
```

!!! danger "Pedir AVIF onde não há encoder devolve PNG, sem erro"
    Medido em Chromium **e** Firefox: `convertToBlob({ type: "image/avif" })`
    não lança — devolve `image/png`. Um app que confiou no pedido sobe
    megabytes onde planejou centenas de kilobytes.

    Por isso todo retorno traz `type` — o formato **produzido**, não o
    pedido — e `supportsImageType` responde antes.

### Reencodar apaga o EXIF

Redimensionar passa pelo canvas, e o canvas não carrega metadado. GPS,
número de série da câmera e horário **não sobrevivem**. Para app que lida
com foto de usuário isso costuma ser exatamente o que se quer — e vale saber
que acontece.

## Medições reais

Foto sintética de 3000x2000 (731 KB), Chromium:

| Operação | Resultado |
| --- | --- |
| Redimensionar para 1200 px, JPEG q0.85 | 124 KB em 66 ms |
| Mesma coisa em WebP q0.85 | 75 KB (40% menor) |
| `compressToTarget` para 200 KB | 192 KB, q0.86, 7 encodes, 313 ms |

!!! info "O que foi removido depois de medir"
    A receita clássica para reduzir muito num canvas é **dividir por dois
    repetidamente**, porque um `drawImage` único supostamente aliasa. Isso
    chegou a ser implementado aqui, e aí foi medido: xadrez de 512 px
    reduzido para 32 px deu resultado **idêntico** (desvio padrão 0,0 nos
    dois) em Chromium e Firefox, enquanto o caminho em passos custou
    **39,19 ms contra 0,13 ms** numa foto 4000x3000 — 300 vezes mais, além
    de três canvas intermediários num aparelho que talvez não tenha memória.

    Motor moderno honra `imageSmoothingQuality = "high"`, que é o que o
    módulo liga. O código foi apagado em vez de mantido "por garantia":
    benefício não mensurável a 300x o custo não é garantia, é peso morto.

## Redimensionar

```tsx
import { resizeImage } from "tempest-react-sdk/imaging";

const thumb = await resizeImage(file, { width: 320, height: 320, fit: "cover" });
```

| `fit` | O que faz |
| --- | --- |
| `contain` (padrão) | Cabe dentro da caixa; resultado pode ser menor num lado |
| `cover` | Preenche a caixa; sobra é cortada, centralizada |
| `fill` | Estica para a caixa, mudando a proporção |
| `pad` | Como `contain`, mas completa a caixa com `background` |

Nunca aumenta por padrão (`withoutEnlargement`): ampliar não cria detalhe e
multiplica bytes.

!!! tip "JPEG não tem alpha"
    Encodar PNG transparente como JPEG pinta os pixels transparentes de
    preto. O módulo preenche de branco antes — passe `background` para outra
    cor.

## Cortar, girar, espelhar

```tsx
import { cropImage, flipImage, rotateImage } from "tempest-react-sdk/imaging";

const badge = await cropImage(file, { x: 120, y: 80, width: 400, height: 400 });
const upright = await rotateImage(file, 90);
const selfie = await flipImage(capture, { horizontal: true });
```

O retângulo é limitado à imagem, então corte arrastado além da borda produz
resultado menor em vez de borda transparente. `rotateImage` aceita só
múltiplos de 90 — ângulo livre exige decidir o que fazer com os cantos, e
isso é design do seu app, não default de utilitário.

## Várias miniaturas de uma decodificação

```tsx
import { createThumbnails } from "tempest-react-sdk/imaging";

const [thumb, card] = await createThumbnails(file, [
  { name: "thumb", size: 96 },
  { name: "card", size: 480 },
]);
```

Três chamadas separadas de `resizeImage` decodificariam a mesma foto três
vezes — e numa imagem de 12 megapixels a decodificação é o custo, não a
escala. `size` é a **maior aresta**, então retrato e paisagem cabem na mesma
célula de grid sem conta separada.

## Um frame de um vídeo

O frame que está na tela não precisa de nada especial — um `<video>` é uma
fonte como qualquer outra, porque `createImageBitmap` aceita o elemento:

```tsx
import { resizeImage } from "tempest-react-sdk/imaging";

const print = await resizeImage(videoRef.current, { width: 1280, type: "image/webp" });
```

Um **instante escolhido** é outra história. Este é o código que todo app
escreve, e ele está errado:

```tsx
video.currentTime = 12.5;
await new Promise((r) => video.addEventListener("seeked", r, { once: true }));
context.drawImage(video, 0, 0); // pode desenhar o frame ANTERIOR
```

`seeked` diz que a busca terminou, não que o frame da nova posição já está
composto e legível pelo `drawImage`. O sintoma é o pior tipo: funciona na
máquina de quem escreveu e devolve o frame vizinho em outro navegador, sem erro
e sem log.

`captureFrame` é esse caminho feito uma vez:

```tsx
import { captureFrame } from "tempest-react-sdk/imaging";

const poster = await captureFrame(video, { atMs: 10_000, width: 640 });

setPoster(URL.createObjectURL(poster.blob));
console.log(`caiu em ${poster.atMs}ms, confirmado: ${poster.confirmed}`);
```

Sem `atMs` ele lê o frame corrente; com `atMs` ele busca, espera o frame
daquele instante ser apresentado, captura e **devolve o player onde estava**.

| Opção | O que faz |
| --- | --- |
| `atMs` | Instante a capturar. Omitido: o frame na tela agora |
| `restore` | Devolve `currentTime` e a reprodução. Padrão `true` |
| `timeoutMs` | Teto para a busca e para o frame depois dela. Padrão `3000` |
| `signal` | `AbortSignal`; rejeita com `AbortError` |
| `width` / `height` / `fit` / `type` / `quality` | Iguais ao `resizeImage` |

O retorno é um `ProcessedImage` com dois campos a mais: `atMs`, o instante que
de fato saiu, e `confirmed`.

!!! note "Por que `atMs` de volta é diferente do `atMs` que você pediu"
    Uma busca cai numa fronteira de frame. Pedir 12 500 ms num vídeo a 30 fps
    entrega 12 466,67 ms — o frame que **contém** aquele instante. O campo
    `atMs` do retorno é o que aconteceu; o que você pediu foi a intenção.

!!! note "`confirmed` diz o quanto dá para ter certeza — e num seek ele é `false`"
    `requestVideoFrameCallback` é o único sinal que diz "um frame foi
    apresentado". Medido no Chromium em 04/09/2026: ele dispara enquanto o
    vídeo **reproduz** e **não** dispara em seek de elemento pausado.

    Então:

    - captura de vídeo **tocando** (o print de gravação de tela) espera o
      próximo frame apresentado → `confirmed: true`;
    - captura com **`atMs`** espera `seeked` + dois animation frames →
      `confirmed: false`, sempre;
    - captura do frame corrente de vídeo **pausado** não espera nada — o frame
      na tela já é o frame.

    `false` num seek é o normal, não um aviso. Tratar como falha rejeitaria a
    maioria das capturas corretas. E é por isso que o seek **não** bloqueia no
    callback: esperar por um sinal que aquele estado não emite custaria o
    `timeoutMs` inteiro em cada captura, para seguir igual no fim.

!!! info "Gravação pode chegar sem duração"
    `MediaRecorder` não garante duração no header do WebM, então o blob que o
    `useVideoRecorder` acabou de te dar pode reportar `Infinity` — e é
    justamente desse vídeo que um app quer tirar frame. Buscar além do fim
    força o navegador a demuxar até o último frame, depois do que ele sabe o
    tamanho. Essa sondagem roda aqui dentro, não em cada chamada.

    Medido em 04/09/2026: o Chromium **escreve** a duração para uma gravação
    finalizada num único `stop()` (3.000197 s para 3 s de canvas), então nesse
    caminho a sondagem não roda. Ela existe para os caminhos que omitem —
    gravação em chunks por `timeslice`, e outros navegadores. O
    `useVideoRecorder` mantém o próprio relógio justamente por isso.

!!! warning "Vídeo de outra origem precisa de `crossOrigin`"
    Sem `crossOrigin="anonymous"` no elemento **antes** da fonte carregar, o
    vídeo contamina o canvas e a leitura é proibida. O `drawImage` passa e o
    erro aparece no encode, longe da causa — `captureFrame` reembala dizendo o
    que ajustar, mas o atributo é da sua tag e o servidor precisa mandar
    `Access-Control-Allow-Origin`.

Stream ao vivo (`srcObject` de `getUserMedia`, `getDisplayMedia` ou
`captureStream`) não tem linha do tempo: `atMs` ali levanta `FrameSeekError`.
Não passe `atMs` e você captura o agora, que é o único instante que existe.

### Print de uma gravação de tela

Junta com `useScreenCapture` e `share`:

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
      <button onClick={screen.start} disabled={!screen.supported}>Compartilhar tela</button>
      <video ref={video} autoPlay muted playsInline />
      <button onClick={print} disabled={screen.stream === null}>Tirar print</button>
    </>
  );
}
```

## No React

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
      <button disabled={isWorking || file === null} onClick={send}>Enviar</button>
    </>
  );
}
```

`useImagePreview` revoga o object URL quando a fonte muda ou o componente
desmonta — sem isso o blob inteiro fica na memória pelo resto da vida da
página. `useImageProcessing` não escreve estado depois do unmount, o caso de
uma foto grande que termina depois do usuário sair da tela.

## Fora da main thread

Todas as funções usam `OffscreenCanvas` quando existe, então rodam dentro de
um worker sem alteração:

```ts
// worker.ts
import { compressToTarget } from "tempest-react-sdk/imaging";

self.onmessage = async (event: MessageEvent<File>) => {
  const result = await compressToTarget(event.data, { maxBytes: 1_000_000 });
  self.postMessage(result.blob);
};
```

Vale a pena: redimensionar foto de 12 megapixels na main thread congela a UI
por dezenas de milissegundos por imagem.

## API

| Símbolo | O que é |
| --- | --- |
| `resizeImage(source, options?)` | Redimensiona e reencoda |
| `cropImage(source, rect, options?)` | Corta em pixels da origem |
| `rotateImage(source, degrees, options?)` | Gira em múltiplos de 90 |
| `flipImage(source, axes, options?)` | Espelha |
| `compressToTarget(source, options)` | Busca binária de qualidade até caber |
| `captureFrame(video, options?)` | Um frame de um `<video>`, no instante pedido |
| `createThumbnails(source, specs, options?)` | Vários tamanhos, uma decodificação |
| `decodeImage(source)` / `readImageInfo(blob)` | Pixels orientados / dimensões e tamanho |
| `encodeImage(surface, options?)` | Canvas para bytes |
| `supportsImageType(type)` / `bestSupportedType(list)` | O que este navegador encoda mesmo |
| `createSurface` / `getContext` / `drawScaled` | Primitivas de canvas |
| `useImagePreview(blob)` / `useImageProcessing()` | Hooks |

Erros: `ImagingError` na raiz, com `ImageDecodeError`, `ImageEncodeError`,
`FrameSeekError`, `UnsupportedImageTypeError` e `ImagingUnavailableError`. O
`FrameSeekError` é o do `captureFrame`: a busca não chegou, ou o vídeo não tem
linha do tempo. Ele existe como classe própria porque a alternativa seria
devolver frame do instante errado, que é indistinguível de um correto para tudo
o que vem depois.

Os defaults de cada opção também saem exportados, para uma tela de ajustes
exibir o valor que está prestes a sobrescrever em vez de repeti-lo:
`DEFAULT_QUALITY` (0.85), `DEFAULT_TYPE` (`image/jpeg`), `DEFAULT_BACKGROUND`
(`#ffffff`, o fundo que substitui a transparência ao ir para JPEG) e, na busca do
`compressToTarget`, `DEFAULT_MIN_QUALITY` (0.4), `DEFAULT_MAX_QUALITY` (0.92) e
`DEFAULT_COMPRESS_STEPS` (6 iterações). O `captureFrame` traz
`DEFAULT_FRAME_TIMEOUT_MS` (3000 ms), o teto de espera da busca.

## Recapitulando

- Decodifique com `decodeImage` — orientação de celular já resolvida.
- Cheque o formato com `supportsImageType`; confie no `type` do retorno.
- `compressToTarget` para orçamento de bytes; `withoutEnlargement` fica ligado.
- Reencodar apaga EXIF — é a etapa de privacidade, além da de banda.
- Frame de vídeo: `captureFrame` para instante escolhido — `seeked` sozinho
  desenha o frame vizinho. Leia `confirmed` antes de confiar no instante.
- Rode num worker: `OffscreenCanvas` é usado sozinho quando existe.
