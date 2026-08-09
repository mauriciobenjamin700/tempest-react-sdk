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
| `createThumbnails(source, specs, options?)` | Vários tamanhos, uma decodificação |
| `decodeImage(source)` / `readImageInfo(blob)` | Pixels orientados / dimensões e tamanho |
| `encodeImage(surface, options?)` | Canvas para bytes |
| `supportsImageType(type)` / `bestSupportedType(list)` | O que este navegador encoda mesmo |
| `createSurface` / `getContext` / `drawScaled` | Primitivas de canvas |
| `useImagePreview(blob)` / `useImageProcessing()` | Hooks |

Erros: `ImagingError` na raiz, com `ImageDecodeError`, `ImageEncodeError`,
`UnsupportedImageTypeError` e `ImagingUnavailableError`.

Os defaults de cada opção também saem exportados, para uma tela de ajustes
exibir o valor que está prestes a sobrescrever em vez de repeti-lo:
`DEFAULT_QUALITY` (0.85), `DEFAULT_TYPE` (`image/jpeg`), `DEFAULT_BACKGROUND`
(`#ffffff`, o fundo que substitui a transparência ao ir para JPEG) e, na busca do
`compressToTarget`, `DEFAULT_MIN_QUALITY` (0.4), `DEFAULT_MAX_QUALITY` (0.92) e
`DEFAULT_COMPRESS_STEPS` (6 iterações).

## Recapitulando

- Decodifique com `decodeImage` — orientação de celular já resolvida.
- Cheque o formato com `supportsImageType`; confie no `type` do retorno.
- `compressToTarget` para orçamento de bytes; `withoutEnlargement` fica ligado.
- Reencodar apaga EXIF — é a etapa de privacidade, além da de banda.
- Rode num worker: `OffscreenCanvas` é usado sozinho quando existe.
