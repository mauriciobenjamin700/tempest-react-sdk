# Geolocalização

Módulo de geolocalização **100% self-hosted**: coleta de latitude/longitude pela API do navegador, cálculo de distância/trajetória e plot de mapas — **sem nenhuma API paga ou externa**. O mapa padrão é um plot **SVG tile-free** (sem imagens de tiles, sem requests). Espelha o módulo `geo` do [`tempest-fastapi-sdk`](https://pypi.org/project/tempest-fastapi-sdk/), então os tipos e a matemática batem entre cliente e servidor.

!!! info "Por que tile-free?"
    Qualquer mapa com imagem (OpenStreetMap, Mapbox, Google) baixa _tiles_ de um servidor externo. Isso colide com o requisito de "nada externo". Por isso o `TrajectoryMap` desenha a trajetória projetada em SVG (Web Mercator) sem fundo — zero request. Se você **hospeda seu próprio** servidor de tiles, basta passar `tileUrl` e os tiles são desenhados sob a mesma projeção SVG, sem biblioteca de mapa extra.

<!-- gallery:geo -->
[![Geolocalização (mapas & trajetória) na gallery](assets/gallery/geo.webp)](gallery.md)

*Seção `geo` da [gallery](gallery.md) — rode localmente para interagir.*
<!-- /gallery -->

## Quando usar

- Coletar a posição do usuário (uma vez ou contínua) via `navigator.geolocation`.
- Gravar e exibir uma **trajetória** (corrida, entrega, trilha).
- Calcular distância entre pontos ou estimar tempo de viagem **offline**.
- Acompanhar uma viagem **ao vivo**: rota planejada, trilha, veículo e pontos de embarque.
- Plotar tudo sem depender de mapa pago/externo.

## Tipos — `Coordinate`, `TrackPoint`, `TravelEstimate`

Os tipos espelham os schemas do FastAPI SDK (snake_case preservado no `TravelEstimate` pra desserializar direto de uma resposta):

```ts
import type { Coordinate, TrackPoint, TravelEstimate, TravelMode } from "tempest-react-sdk";

const sp: Coordinate = { latitude: -23.5505, longitude: -46.6333 };

// TrackPoint = Coordinate + quando foi capturado (+ accuracy, speed e heading opcionais)
const ponto: TrackPoint = { ...sp, timestamp: Date.now(), accuracy: 12, speed: 8.3, heading: 90 };

// TravelMode = "car" | "motorcycle" | "bus"
const modo: TravelMode = "car";
```

Validadores utilitários: `isValidLatitude`, `isValidLongitude`, `isCoordinate` (type guard), `clampLatitude`, `normalizeLongitude` (wrap no antimeridiano).

## Distância e trajetória — `haversineKm`, `pathLengthKm`, `bearingDeg`

Matemática pura, sem rede, idêntica ao servidor:

```ts
import { haversineKm, pathLengthKm, bearingDeg } from "tempest-react-sdk";

const sp = { latitude: -23.5505, longitude: -46.6333 };
const rio = { latitude: -22.9068, longitude: -43.1729 };

haversineKm(sp, rio); // ≈ 360.9 (km, grande-círculo)

// Comprimento total de uma trajetória (soma dos trechos):
pathLengthKm([sp, { latitude: -23.2, longitude: -45 }, rio]);

// Azimute inicial (graus, 0 = norte, sentido horário):
bearingDeg(sp, rio); // ≈ 65 (nordeste)
```

### Enquadrar um conjunto de pontos — `boundingBox`, `boundsCenter`, `expandBounds`

Para centralizar um mapa numa trajetória, ou decidir o zoom que a cobre:

```ts
import { boundingBox, boundsCenter, expandBounds } from "tempest-react-sdk";

const bounds = boundingBox([sp, rio]); // { north, south, east, west } | null

if (bounds) {
  boundsCenter(bounds); // o ponto médio, para centralizar
  expandBounds(bounds, 0.1); // 10% de folga, para a rota não colar na borda
}
```

O `boundingBox` devolve `null` para lista vazia — não existe moldura em volta
de ponto nenhum, e devolver uma caixa zerada jogaria o mapa no Atlântico.

`expandBounds` existe porque enquadrar exatamente nos extremos encosta o primeiro
e o último ponto na moldura — a margem é o que faz o traçado caber visualmente.

### A matemática crua

`haversineKm` é a fórmula pronta, mas as duas peças dela saem avulsas para quem
monta um cálculo próprio: `EARTH_RADIUS_KM` (6371, o raio médio que a fórmula
assume) e `toRadians(graus)`. E `unprojectMercator` é o par de
`projectMercator` — converte de volta de coordenada de tela para lat/long, que é
o que um clique no mapa precisa.

```ts
import { EARTH_RADIUS_KM, projectMercator, toRadians, unprojectMercator } from "tempest-react-sdk";

const xy = projectMercator({ latitude: -23.55, longitude: -46.63 });
unprojectMercator(xy); // de volta ao par lat/long

EARTH_RADIUS_KM * toRadians(1); // ≈ 111.2 km por grau de latitude
```

## Estimativa de viagem offline — `estimateTravel`

Sem rede: distância grande-círculo × fator de sinuosidade, duração por velocidade média ajustada ao modo. Espelha `estimate_travel` do FastAPI SDK.

```ts
import { estimateTravel } from "tempest-react-sdk";

const est = estimateTravel(sp, rio, "car");
// { mode: "car", distance_km: ~469, duration_minutes: ~562, source: "heuristic" }

// Ônibus é ~1.6× mais lento que carro no mesmo trecho:
estimateTravel(sp, rio, "bus").duration_minutes;

// Ajuste os fatores:
estimateTravel(sp, rio, "car", { circuityFactor: 1.4, carSpeedKmh: 60 });
```

!!! tip "Fatores padrão"
    `circuityFactor = 1.3` (a estrada é ~30% maior que a reta), `carSpeedKmh = 50`, multiplicadores de duração `car: 1.0 · motorcycle: 0.95 · bus: 1.6`.

    Eles também são exportados — `DEFAULT_CIRCUITY_FACTOR`, `DEFAULT_CAR_SPEED_KMH`
    e `DEFAULT_MODE_DURATION_FACTORS` — para uma tela de ajustes mostrar o valor
    que está prestes a sobrescrever, em vez de repeti-lo e sair de sincronia.

## Rota real (opt-in) — `createOSRMBackend`

Quando você **hospeda um OSRM** e quer rota por ruas de verdade, construa um backend injetando a URL do **seu** servidor. É o único ponto que faz request — e só quando você o cria.

```ts
import { createOSRMBackend } from "tempest-react-sdk";

const backend = createOSRMBackend({ baseUrl: "https://osrm.interno" });
const est = await backend.route(sp, rio, { mode: "car" });
// { …, source: "osrm" }
```

!!! warning "Isto faz request de rede"
    O SDK não embute nenhum endpoint. Aponte `baseUrl` pra um motor de roteamento **seu**. Pra estimativa zero-rede, use `estimateTravel`.

Qualquer motor (Valhalla, GraphHopper) serve: implemente a interface `RoutingBackend` (`route(origin, destination, { mode }) => Promise<TravelEstimate>`).

## Rastreamento ao vivo — `usePositionTracker`

Grava uma trajetória a partir de `watchPosition`, filtrando jitter e acumulando distância. Ciclo de vida amarrado ao componente (o watch é encerrado no unmount).

```tsx
import { usePositionTracker, TrajectoryMap } from "tempest-react-sdk";

export function CorridaAoVivo() {
  const { points, lastPoint, distanceKm, isTracking, start, stop, clear } =
    usePositionTracker({ minDistanceKm: 0.01, positionOptions: { enableHighAccuracy: true } });

  return (
    <div>
      <button onClick={isTracking ? stop : start}>
        {isTracking ? "Parar" : "Rastrear"}
      </button>
      <button onClick={clear}>Limpar</button>
      <span>{distanceKm.toFixed(2)} km · {points.length} pontos</span>
      <TrajectoryMap points={points} current={lastPoint} height={360} />
    </div>
  );
}
```

- `minDistanceKm` (default `0.005` = 5 m) descarta amostras muito próximas — filtra o tremido do GPS parado.
- `maxPoints` limita o array retido (a distância total continua contando).
- `onPoint(point)` é chamado **uma vez por ponto aceito** (depois do filtro de `minDistanceKm`), na ordem. É o caminho para transmitir cada posição: um `useEffect` sobre `lastPoint` vê só a última de duas leituras que chegam antes de um render — medido com duas leituras no mesmo `act`, o efeito viu `[2, 3]` de `[1, 2, 3]`, e o `onPoint` viu as três. O hook lê o `onPoint` do último render, então uma arrow inline enxerga o estado atual.
- `autoStart: true` já começa a rastrear na montagem.
- Cada ponto traz `speed` (m/s, a unidade do navegador — `× 3.6` dá km/h) e `heading` (graus a partir do norte), `null` quando o aparelho não informa. O `heading` `NaN` que alguns navegadores mandam com o aparelho parado também vira `null`.

### Erro passageiro, recusa e `lastError`

Num túnel ou numa área sem sinal o navegador manda `POSITION_UNAVAILABLE` (código `2`) ou `TIMEOUT` (código `3`) e o `status` vira `"error"`, mas o watch continua vivo: **a próxima leitura volta o `status` para `"tracking"`** — mesmo uma que o filtro de jitter descarta, porque ela já prova que o sinal voltou. `TIMEOUT` repetido mantém o `"error"` e chama `onError` a cada vez.

`PERMISSION_DENIED` (código `1`) é terminal: o navegador não manda mais leitura, então o watch é liberado e o `status` fica `"error"` até um novo `start()`. O `lastError` (no hook e no tracker) diz qual dos dois casos a tela está vendo; ele volta a `null` na recuperação, no `start()`, no `stop()` e no `clear()`.

```tsx
import { usePositionTracker } from "tempest-react-sdk";

export function StatusDoRastreio() {
  const { status, lastError, lastPoint, start } = usePositionTracker({ autoStart: true });

  if (status === "error" && lastError?.code === 1) {
    return (
      <p>
        Permita o acesso à localização. <button onClick={start}>Tentar de novo</button>
      </p>
    );
  }
  if (status === "error") return <p>Sem sinal de GPS — aguardando a próxima leitura…</p>;

  const kmh = lastPoint?.speed != null ? (lastPoint.speed * 3.6).toFixed(0) : "—";
  const direcao = lastPoint?.heading != null ? `${lastPoint.heading.toFixed(0)}°` : "—";
  return (
    <p>
      {kmh} km/h · direção {direcao}
    </p>
  );
}
```

### Versão imperativa — `createPositionTracker`

Fora do React (services), o controller expõe `start`/`stop`/`clear` + getters `points`/`distanceKm`/`status`/`lastError`:

```ts
import { createPositionTracker } from "tempest-react-sdk";

const tracker = createPositionTracker({
  minDistanceKm: 0.01,
  onUpdate: (pts) => console.log(pts.length),
});
tracker.start();
// …depois
tracker.stop();
console.log(tracker.distanceKm);
```

## Plot do mapa — `TrajectoryMap`

Por padrão, plot **SVG tile-free**: projeta os pontos (Web Mercator), auto-ajusta aos bounds, desenha a polyline + marcadores (início verde, atual pulsante) + grid + barra de escala em km. Zero dependência, zero rede.

```tsx
import { TrajectoryMap } from "tempest-react-sdk";

<TrajectoryMap
  points={points}
  current={lastPoint}
  height={360}
  showGrid
  showScale
/>;
```

### Tiles reais (opt-in, sem dependência)

Se você **hospeda tiles próprios**, passe `tileUrl` — o componente desenha os tiles `{z}/{x}/{y}` diretamente no SVG sob a mesma projeção Web Mercator da trajetória e dos marcadores, sem Leaflet e sem folha de estilo extra. Funciona inclusive só com `markers` (`points={[]}`).

```tsx
import { TrajectoryMap } from "tempest-react-sdk";

<TrajectoryMap
  points={[]}
  markers={[{ id: "loja-1", latitude: -23.5505, longitude: -46.6333, label: "Loja" }]}
  tileUrl="https://tiles.SEU-SERVIDOR/{z}/{x}/{y}.png"
  tileAttribution="© Seus dados de mapa"
  height={420}
/>;
```

!!! note "Zero dependência externa"
    Sem `tileUrl`, nenhum request sai da página. Com `tileUrl`, o mapa usa o mesmo motor de tiles SVG do `LiveRouteMap` — nenhuma biblioteca extra precisa ser instalada.

| Prop | Tipo | Default | Descrição |
| --- | --- | --- | --- |
| `points` | `readonly Coordinate[]` | — | Trajetória a desenhar. |
| `current` | `Coordinate \| null` | — | Marcador de posição atual (pulsante). |
| `markers` | `readonly GeoMarker[]` | — | Marcadores pontuais sobrepostos (entram no auto-fit com ou sem `points`). |
| `onMarkerClick` | `(marker: GeoMarker, index: number) => void` | — | Clique ou Enter/Espaço num marcador. |
| `height` | `number` | `320` | Altura do viewport em px. |
| `padding` | `number` | `24` | Margem interna em px. |
| `showGrid` / `showScale` | `boolean` | `true` | Grade (quando sem `tileUrl`) e barra de escala. |
| `strokeColor` | `string` | token primário | Cor da linha. |
| `tileUrl` | `string` | — | Template `{z}/{x}/{y}` do **seu** tile server — desenha os tiles direto no SVG. |
| `tileAttribution` | `string` | — | Atribuição exibida no canto inferior direito sobre os tiles. |
| `tileMaxZoom` | `number` | `19` | Zoom máximo servido pelo tile server. |

## Mapa de viagem ao vivo — `LiveRouteMap`

O `TrajectoryMap` plota uma trajetória **gravada** e reenquadra o mapa a cada mudança. Numa viagem que está acontecendo isso atrapalha: cada posição nova do veículo (por SSE, a cada poucos segundos) daria zoom-out. O `LiveRouteMap` é o mapa da viagem **em andamento**:

- a **rota planejada** (`route`, por exemplo a geometria do OSRM) tracejada, e a **trilha percorrida** (`trail`) sólida por cima;
- o **veículo** com ícone de **direção** (`vehicle.heading`), deslizando entre duas posições em vez de pular;
- os **pontos da viagem** (`markers`) por tipo — origem, parada, destino —, com **badge** numérico e um **conteúdo** que abre por toque, clique ou teclado;
- o modo **seguir** (`follow`): uma posição nova **não reenquadra** o mapa; ele só desliza, no mesmo zoom, quando o veículo chega perto da borda. Se o usuário arrasta o mapa, o seguir pausa e aparece o botão **Recentralizar**.

Um exemplo completo — rota, trilha, veículo com direção e 3 pontos de embarque com conteúdo:

```tsx
import { useEffect, useState } from "react";
import { LiveRouteMap, bearingDeg, type Coordinate, type LiveRouteMarker } from "tempest-react-sdk";

const ROUTE: Coordinate[] = [
  { latitude: -23.5505, longitude: -46.6333 },
  { latitude: -23.5535, longitude: -46.6301 },
  { latitude: -23.5571, longitude: -46.6268 },
  { latitude: -23.5612, longitude: -46.6239 },
  { latitude: -23.5648, longitude: -46.6197 },
];

const STOPS: LiveRouteMarker[] = [
  {
    id: "se",
    label: "Praça da Sé",
    kind: "origin",
    badge: 2,
    ...ROUTE[0],
    content: <p>Ana e Bruno embarcam aqui.</p>,
  },
  {
    id: "liberdade",
    label: "Liberdade",
    kind: "stop",
    badge: 3,
    ...ROUTE[2],
    content: (
      <ul>
        <li>Carla</li>
        <li>Diego</li>
        <li>Elisa</li>
      </ul>
    ),
  },
  {
    id: "paraiso",
    label: "Paraíso",
    kind: "destination",
    ...ROUTE[4],
    content: <p>Chegada prevista às 08:40.</p>,
  },
];

export function TripMap() {
  const [traveled, setTraveled] = useState<Coordinate[]>([ROUTE[0]]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTraveled((prev) =>
        prev.length < ROUTE.length ? [...prev, ROUTE[prev.length]] : prev,
      );
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  const position = traveled[traveled.length - 1];
  const previous = traveled[traveled.length - 2];
  const heading = previous ? bearingDeg(previous, position) : null;
  const minutes = (ROUTE.length - traveled.length) * 2;

  return (
    <LiveRouteMap
      route={ROUTE}
      trail={traveled}
      vehicle={{ position, heading, label: "Ônibus 42" }}
      markers={STOPS}
      follow
      etaLabel={`Chegada estimada em ${minutes} minutos`}
      height={400}
    />
  );
}
```

Pedaço por pedaço:

- **`route` decide o enquadramento inicial**, junto com os `markers`. O veículo e a trilha **não** entram nele — é isso que impede o zoom-out a cada posição.
- **`vehicle.heading`** é o rumo em graus (0 = norte, sentido horário). Sem ele, o veículo vira um ponto. Se o seu backend já manda o rumo, passe direto; se não, `bearingDeg(anterior, atual)` calcula.
- **`markers[].content`** é qualquer `ReactNode`. O marcador é um botão: abre com clique/toque, `Enter` ou `Espaço`; o foco vai para o painel e `Esc` fecha e devolve o foco ao marcador.
- **`etaLabel`** é o texto que o leitor de tela anuncia (região `status`, educada). O mapa **não calcula** a ETA: ela vem do app, que já sabe de onde tirar.

!!! tip "Movimento reduzido"
    O veículo desliza por `animationMs` (600 ms por padrão) entre duas posições. Com `prefers-reduced-motion: reduce` no sistema ele pula direto, sem você fazer nada. `animationMs={0}` desliga para todo mundo.

!!! note "Offline por padrão, tiles se você hospedar"
    Sem `tileUrl`, é SVG puro: zero request, funciona offline e no teste. Com `tileUrl` apontando para o **seu** servidor de tiles, o mapa desenha os tiles por baixo das linhas, na mesma projeção — sem Leaflet, sem dependência nova. Não existe caminho para Google Maps.

| Prop | Tipo | Default | Descrição |
| --- | --- | --- | --- |
| `route` | `readonly Coordinate[]` | — | Rota planejada, tracejada. Enquadra o mapa. |
| `trail` | `readonly Coordinate[]` | — | Caminho percorrido, sólido. |
| `vehicle` | `LiveVehicle \| null` | — | `{ position, heading?, label?, stale?, staleLabel? }`. |
| `markers` | `readonly LiveRouteMarker[]` | — | `{ id, label, latitude, longitude, kind?, badge?, emphasis?, glyphText?, icon?, visited?, content? }`. |
| `follow` | `boolean` | `false` | Mantém o veículo à vista sem mudar o zoom. |
| `etaLabel` | `string` | — | Texto anunciado ao leitor de tela. |
| `height` / `padding` | `number` | `360` / `32` | Altura e margem do enquadramento, em px. |
| `markerScale` | `number` | `1` | Tamanho dos glifos dos marcadores. O alvo de toque é 44 px em qualquer escala. |
| `animationMs` | `number` | `600` | Duração do deslize do veículo. `0` pula. |
| `showScale` | `boolean` | `true` | Barra de escala em m/km. |
| `tileUrl` / `tileAttribution` / `tileMaxZoom` | `string` / `string` / `number` | — / — / `19` | Tiles do **seu** servidor. |
| `label` / `recenterLabel` / `closeLabel` | `string` | `"Mapa da viagem"` / `"Recentralizar"` / `"Fechar"` | Textos acessíveis. |
| `kindLabels` | `Partial<Record<LiveRouteMarkerKind, string>>` | `origem` / `parada` / `destino` | Nome falado de cada tipo. |
| `visitedLabel` | `string` | `"visita concluída"` | Acrescentado ao nome falado de um marcador `visited`. |
| `onMarkerOpenChange` | `(id: string \| null) => void` | — | Painel de um marcador abriu (`id`) ou fechou (`null`). |
| `roads` | `RoadGraph<E>` | — | Grafo do `createRoadGraph`: desenha as ruas e encaixa veículo e trilha. |
| `onMatch` | `(match: MatchedFix<E> \| null) => void` | — | Cada posição nova encaixada (sua aresta, ponto, distância), ou `null` fora de qualquer rua. Só com `roads`. |

### Simbologia: destaque, número, ícone e tamanho

As cores e os nomes falados você já troca por token e por `kindLabels`. Quatro campos mudam o **glifo** em si:

- **`emphasis`** separa um marcador dos outros — o "Seu embarque" do passageiro entre as paradas da linha. O glifo cresce 1,4× e ganha um halo na própria cor, então continua sendo do mesmo tipo.
- **`glyphText`** escreve um texto curto **dentro** do glifo, como a ordem da parada (`"1"`, `"2"`). O `badge` continua livre para a contagem.
- **`icon`** desenha um SVG dentro do glifo, numa caixa 24×24 — um ícone do `lucide-react` cabe direto. A bandeira de chegada é `icon: <Flag />` no destino.
- **`markerScale`** (no mapa) aumenta todos os glifos juntos — forma, badge e anel de foco.

```tsx
import { Flag } from "lucide-react";
import { LiveRouteMap, type Coordinate, type LiveRouteMarker } from "tempest-react-sdk";

const ROUTE: Coordinate[] = [
  { latitude: -23.5505, longitude: -46.6333 },
  { latitude: -23.5571, longitude: -46.6268 },
  { latitude: -23.5612, longitude: -46.6239 },
  { latitude: -23.5648, longitude: -46.6197 },
];

const STOPS: LiveRouteMarker[] = [
  { id: "p1", label: "Parada 1 — Praça da Sé", kind: "origin", glyphText: "1", ...ROUTE[0] },
  { id: "p2", label: "Parada 2 — Liberdade", glyphText: "2", badge: 3, ...ROUTE[1] },
  {
    id: "p3",
    label: "Seu embarque — Parada 3, São Joaquim",
    glyphText: "3",
    emphasis: true,
    ...ROUTE[2],
  },
  { id: "fim", label: "Chegada — Paraíso", kind: "destination", icon: <Flag />, ...ROUTE[3] },
];

export function PassengerMap() {
  return <LiveRouteMap route={ROUTE} markers={STOPS} markerScale={1.25} height={360} />;
}
```

Pedaço por pedaço:

- **`emphasis`, `glyphText` e `icon` são só visuais.** O leitor de tela lê o `label` e o tipo — por isso o exemplo escreve "Seu embarque" e "Parada 3" **no `label`** também.
- **Com `glyphText` ou `icon`, a parada cresce de 16 para 20 px**, para o texto caber em 12 px. Um ou dois caracteres leem melhor; com mais, a fonte encolhe para caber. Se os dois vierem, vale o `glyphText`.
- **O `icon` herda a tinta do glifo** por `currentColor` — os ícones do `lucide-react` já pintam assim.

!!! info "Alvo de toque de 44 px, em qualquer tamanho"
    Medido no Chromium sobre a gallery da 0.91.0 (`elementFromPoint` em 16 direções, a cada 2 px): uma parada só respondia dentro do disco de **16 px**, e depois só num anel de 3 px a 16 px do centro — o traço transparente do anel de foco. Agora cada marcador tem um círculo invisível de **44 px** (WCAG 2.2, SC 2.5.5) que recebe o toque, e o `markerScale` não o encolhe. Por isso o `markerScale` padrão continua `1`: ele serve para **ler** o glifo de longe, não para conseguir tocá-lo.

### Estados: parada já visitada e posição velha

O que já passou e o que vem pela frente não podem ter a mesma cara, e uma posição de quatro minutos atrás não pode parecer ao vivo. Dois campos dizem isso no próprio glifo:

- **`visited`** no `LiveRouteMarker` pinta o marcador em cinza neutro (`--tempest-live-route-visited`, padrão `--tempest-text-muted`). A forma continua a do tipo — uma parada atendida segue redonda, o número segue dentro — e o nome acessível ganha `visitedLabel` (padrão `"visita concluída"`).
- **`stale`** no `vehicle` deixa o veículo onde ele foi visto pela última vez, sem o halo e em cinza (`--tempest-live-route-stale`), e acrescenta `staleLabel` (padrão `"posição desatualizada"`) ao nome que o leitor de tela lê.

```tsx
import { LiveRouteMap, type Coordinate, type LiveRouteMarker, type TrackPoint } from "tempest-react-sdk";

const STALE_AFTER_MS = 30_000;

export function TripNow({
  route,
  stops,
  position,
  now,
}: {
  route: Coordinate[];
  stops: (LiveRouteMarker & { departed: boolean })[];
  position: TrackPoint;
  now: number;
}) {
  return (
    <LiveRouteMap
      route={route}
      markers={stops.map(({ departed, ...stop }) => ({ ...stop, visited: departed }))}
      vehicle={{
        position,
        heading: position.heading ?? null,
        label: "Van 12",
        stale: now - position.timestamp > STALE_AFTER_MS,
      }}
    />
  );
}
```

- **Quem decide o "velho" é o app.** O mapa não tem relógio próprio: um timer dentro dele re-renderizaria um mapa que não tem nada novo a desenhar. O app já tem o `timestamp` da posição e um `now` que anda (veja o [`RelativeTime`](./components/utility.md#relativetime) com `updateEvery`).
- **O cinza mede 6,92:1 (claro) e 7,43:1 (escuro) contra o fundo do mapa** (`--tempest-surface-2`), e o número dentro, em `--tempest-surface`, 7,30 e 8,39:1 — medido no browser e afirmado em `src/geo/LiveRouteMap.states.test.tsx`.
- **Mesmo cinza nos dois estados, de propósito**: "já passou" e "parou de chegar" são o mesmo recado — isto é passado. A forma separa um do outro.

### Legenda — `LiveRouteMapLegend`

Cada app desenhava a própria legenda imitando os glifos do SDK com SVG próprio — e uma mudança de tema ou de glifo deixava a legenda para trás. O `LiveRouteMapLegend` desenha **os mesmos glifos**, com as mesmas classes e os mesmos tokens do mapa:

```tsx
import { Flag } from "lucide-react";
import { LiveRouteMapLegend } from "tempest-react-sdk";

export function PassengerLegend() {
  return (
    <LiveRouteMapLegend
      markerScale={1.25}
      items={[
        { symbol: "stop", label: "Seu embarque", emphasis: true },
        { symbol: "stop", label: "Parada (ordem da viagem)", glyphText: "1" },
        { symbol: "destination", label: "Chegada", icon: <Flag /> },
        { symbol: "vehicle", label: "Ônibus" },
        { symbol: "route", label: "Rota planejada" },
        { symbol: "trail", label: "Já percorrido" },
        { symbol: "stop", label: "Parada atendida", glyphText: "1", visited: true },
        { symbol: "vehicle", label: "Sem sinal do ônibus", stale: true },
        { symbol: "badge", label: "Embarques na parada", badge: 3 },
      ]}
    />
  );
}
```

- **`symbol`** é um tipo de marcador (`"origin"`, `"stop"`, `"destination"`), o `"vehicle"`, uma das linhas (`"route"`, `"trail"`) ou o `"badge"`, o selo de contagem. Os campos `emphasis`, `glyphText`, `icon` e `visited` valem para os tipos de marcador, iguais aos do `LiveRouteMarker`; `stale`, para o veículo; `badge` (padrão `1`), para o selo.
- **O selo da legenda é o mesmo desenho do mapa** (`BadgeShape` compartilhado): mesmo token de cor, mesma largura para `"99+"`. Antes não havia símbolo para ele, e a legenda não explicava o número sobre a parada.
- **Sem `items`**, a legenda lista os seis símbolos com rótulos em PT-BR.
- **Passe o mesmo `markerScale` do mapa** para os glifos baterem; veículo e linhas não escalam, como no mapa.
- É uma lista (`<ul>`) com nome acessível `"Legenda do mapa"` (troque com `label`); os desenhos são `aria-hidden`, e o leitor de tela lê o texto.

| Prop | Tipo | Default | Descrição |
| --- | --- | --- | --- |
| `items` | `readonly LiveRouteLegendItem[]` | os seis símbolos, PT-BR | `{ symbol, label, emphasis?, glyphText?, icon?, visited?, stale?, badge? }`, na ordem. |
| `markerScale` | `number` | `1` | O mesmo fator do mapa. |
| `label` | `string` | `"Legenda do mapa"` | Nome acessível da lista. |

### Variáveis CSS que o mapa lê

O mapa e a legenda são temados só por tokens. Para recolorir, sobrescreva no `:root` ou num ancestral comum — a legenda acompanha.

| Variável | Onde aparece | Padrão |
| --- | --- | --- |
| `--tempest-surface-2` / `--tempest-border` | Fundo e borda do mapa | tema |
| `--tempest-text` / `--tempest-text-muted` | Texto, barra de escala / rota planejada | tema |
| `--tempest-surface` | Contorno dos glifos e das linhas, painel, ponto da origem | tema |
| `--tempest-success-fg` | Glifo da origem | tema |
| `--tempest-info-solid` | Glifo da parada | tema |
| `--tempest-danger-solid` | Glifo do destino | tema |
| `--tempest-primary` / `--tempest-primary-foreground` | Trilha e veículo / seta do veículo | tema |
| `--tempest-focus-ring-color` | Anel de foco do marcador | tema |
| `--tempest-live-route-badge` / `--tempest-live-route-badge-text` | Fundo / número do `badge` | `--tempest-gray-700` / `--tempest-neutral-on-solid` |
| `--tempest-live-route-origin-ink` | `glyphText` e `icon` na origem | `--tempest-surface` |
| `--tempest-live-route-stop-ink` | `glyphText` e `icon` na parada | `--tempest-info-on-solid` |
| `--tempest-live-route-destination-ink` | `glyphText` e `icon` no destino | `--tempest-danger-on-solid` |
| `--tempest-live-route-road` / `--tempest-live-route-road-casing` | Ruas do `roads` | `--tempest-bg` / `--tempest-text-subtle` |
| `--tempest-live-route-visited` / `--tempest-live-route-visited-ink` | Marcador `visited` / seu `glyphText` e `icon` | `--tempest-text-muted` / `--tempest-surface` |
| `--tempest-live-route-stale` / `--tempest-live-route-stale-ink` | Veículo `stale` / sua seta | `--tempest-text-muted` / `--tempest-surface` |

!!! note "Por que o selo não usa mais `--tempest-text` sobre `--tempest-bg`"
    Até a 0.91.0 o `badge` era `--tempest-text` de fundo com o número em `--tempest-bg` — o par invertido. No tema do próprio SDK isso dava 17,75:1 (claro) e 17,51:1 (escuro). Mas o contraste dependia de **dois** tokens que o app troca separados: um tema que clareou `--tempest-text` e deixou `--tempest-bg` branco pôs o número branco num selo quase branco — **1,11:1**, medido no Chromium. Agora o selo usa o par neutro fixo (`--tempest-gray-700` + `--tempest-neutral-on-solid`), o mesmo do `Badge` sólido neutro: **10,46:1** nos dois temas, e também com o tema parcial. As tintas dos glifos usam os pares `*-solid`/`*-on-solid` medidos — 5,17 e 4,83:1 no claro, 5,25 e 5,13:1 no escuro; a origem, `--tempest-surface` sobre `--tempest-success-fg` (8,65 e 10,28:1). Se o seu tema troca `--tempest-surface` sem trocar `--tempest-success-fg`, ajuste `--tempest-live-route-origin-ink` junto.

### Ruas no mapa e veículo na rua — `roads`

O GPS erra de 3 a 30 m na cidade. Desenhado cru, o ônibus "anda" pela calçada, atravessa o quarteirão na curva e, numa avenida com uma rua paralela ao lado, pula de uma para a outra. Passe o grafo de ruas da região em `roads` e o mapa resolve isso **sem código no app**:

- desenha as **ruas** do grafo como camada vetorial, por baixo da rota e da trilha — sem tiles, funciona offline;
- passa cada `vehicle.position` por um [`createRoadMatcher`](#no-mapa-ao-vivo-createroadmatcher) interno e desenha o veículo **no ponto encaixado na rua**;
- quando a posição não traz `heading`, a seta segue a **direção da rua** em que o veículo está;
- desenha a `trail` **pelas ruas encaixadas**, dobrando a esquina em vez de cortar o quarteirão.

```tsx
import { useEffect, useState } from "react";
import {
  LiveRouteMap,
  createRoadGraph,
  type Coordinate,
  type MatchedFix,
  type RoadEdge,
  type RoadGraph,
} from "tempest-react-sdk";

interface Street extends RoadEdge {
  id: string;
  name: string;
}

interface RoadTile {
  nodes: Coordinate[];
  edges: Street[];
}

export function BusOnTheStreet({ fixes }: { fixes: Coordinate[] }) {
  const [roads, setRoads] = useState<RoadGraph<Street> | undefined>(undefined);
  const [street, setStreet] = useState<string>("");

  useEffect(() => {
    let alive = true;
    fetch("/api/roads?bbox=-46.66,-23.57,-46.64,-23.55")
      .then((response) => response.json() as Promise<RoadTile>)
      .then((tile) => {
        if (alive) setRoads(createRoadGraph({ ...tile, twoWay: true }));
      });
    return () => {
      alive = false;
    };
  }, []);

  const onMatch = (match: MatchedFix<Street> | null): void => {
    setStreet(match ? match.edge.name : "fora da malha viária");
  };

  return (
    <>
      <p aria-live="polite">{street}</p>
      <LiveRouteMap
        trail={fixes}
        vehicle={{ position: fixes[fixes.length - 1], label: "Ônibus 7" }}
        roads={roads}
        onMatch={onMatch}
        follow
        height={400}
      />
    </>
  );
}
```

Pedaço por pedaço:

- **`roads`** é o mesmo `RoadGraph` do [`createRoadGraph`](#de-onde-vem-o-grafo). Monte uma vez por região e passe **a mesma instância** a cada render: o encaixe guarda o histórico enquanto o objeto for o mesmo, e um grafo novo começa uma cadeia nova.
- **`vehicle.position` continua sendo a posição crua.** Você não encaixa nada: o mapa encaixa. Se o seu backend manda `heading`, ele vale; sem ele, a seta segue a rua.
- **Posição com `timestamp` fica encadeada mesmo esparsa.** Se o veículo reporta a cada 5–30 s, mande o `timestamp` de cada posição (um `TrackPoint` já tem): o encaixe passa a aceitar a volta no quarteirão entre dois reportes em vez de cortar a cadeia. Sem `timestamp`, tudo funciona como antes — veja [Fonte esparsa](#fonte-esparsa-timestamp).
- **`onMatch`** é chamado a cada posição nova com o encaixe — a aresta (o **seu** objeto, com nome, id, velocidade máxima), o ponto na rua (`point`) e a distância (`distanceM`) —, ou com `null` quando a posição está longe de qualquer rua.
- **O grafo não entra no enquadramento.** Uma cidade inteira de ruas não dá zoom-out no mapa: quem enquadra continua sendo `route` e `markers`.

!!! note "Fora de qualquer rua, o veículo aparece onde está"
    Sem rua a até 200 m (o `radiusM` do matcher), não há o que encaixar: o veículo é desenhado na posição crua, com o halo trocado por um **anel tracejado**, e o `onMatch` recebe `null`. O veículo nunca some — num pátio de garagem ou numa rua que o grafo ainda não tem, ele continua visível.

!!! info "Quem não passa `roads` não baixa o matcher"
    O encaixe (`createRoadMatcher` + `matchToRoads`) entra por **import dinâmico**, na primeira vez que um mapa com `roads` monta. Sem `roads`, nada muda: o mapa desenha exatamente o que desenhava, e o bundler deixa o matcher num chunk separado que ninguém pede.

As ruas usam dois tokens próprios, que você troca no tema: `--tempest-live-route-road` (o leito, padrão `--tempest-bg`) e `--tempest-live-route-road-casing` (a borda, padrão `--tempest-text-subtle`).

??? info "Detalhes técnicos: o que o mapa faz por baixo"
    - O veículo passa por um `createRoadMatcher(roads)` com os padrões medidos (`lag` 5). O ponto desenhado é o `current` — o melhor palpite para a posição que acabou de chegar, que já pesa todas as anteriores. É isso que segura o veículo na avenida quando o ruído o põe mais perto da rua paralela.
    - A trilha passa inteira pelo `matchToRoads` a cada mudança (~3 ms por mil posições, medido em desktop), e cada trecho sem quebra vira uma linha que passa pelos nós das ruas percorridas. Posições sem rua ao alcance ficam fora dessa linha.
    - Só as ruas que cruzam a tela entram no SVG.
    - Peso, medido sobre o `dist` da 0.90.0 com esbuild (`bundle` + `minify`, CSS fora, o import dinâmico como externo — que é o chunk que o bundler do app separa), em brotli: `{ LiveRouteMap }` sai em **5,33 kB brotli**, contra 4,67 kB antes do `roads`; com o matcher no mesmo arquivo seriam 8,42 kB.

## Encaixe na rua (map-matching) — `createRoadGraph`, `matchToRoads`, `createRoadMatcher`

O GPS erra de 3 a 30 m na cidade, e às vezes muito mais. Encaixar cada posição na rua **mais próxima** parece resolver, mas erra em 1 de cada 7 posições: a rua paralela a 15 m, o outro lado do cruzamento, a pista do sentido contrário. O `matchToRoads` olha a **sequência**: uma rua que o veículo não teria como alcançar em um segundo perde para a rua em que ele está andando.

É o modelo oculto de Markov de Newson & Krumm (2009), com Viterbi:

- **Candidatas**: as ruas a até `radiusM` do ponto, no máximo `maxCandidates`.
- **Emissão**: uma gaussiana na distância do ponto até a rua (`sigmaM`) — rua perto é mais provável.
- **Transição**: uma exponencial em `|linha reta − distância pela rede|` (`betaM`) — entre dois pontos seguidos, o caminho pela rede deve ter o tamanho do deslocamento. A distância pela rede vem de um Dijkstra limitado (`maxDetourM`, que cresce com o intervalo quando a posição traz `timestamp`).

### De onde vem o grafo

A API é **agnóstica de fonte**: `nodes` são coordenadas e `edges` são pares de **índices** de nó (`from` → `to`), cada um com o que o seu app quiser junto (`id`, nome, velocidade máxima). O caminho recomendado é o **OpenStreetMap servido pelo seu backend**, por tile ou por região:

- cada `way` com `highway=*` vira uma aresta por par de nós consecutivos;
- `oneway=yes` vira `twoWay: false`; sem `oneway`, `twoWay: true`; `oneway=-1`, inverta `from`/`to`;
- o backend corta a região (bounding box ou tile) e manda o JSON abaixo, que o app guarda em cache.

```json
{
  "nodes": [{ "latitude": -5.0892, "longitude": -42.8016 }, { "latitude": -5.0901, "longitude": -42.8003 }],
  "edges": [{ "from": 0, "to": 1, "twoWay": true, "id": "way/24680", "name": "Av. Frei Serafim" }]
}
```

Monte o grafo **uma vez** por região e reutilize para todo trajeto: montar é a parte cara (o índice espacial e a adjacência); consultar é barato.

### Encaixar um trajeto gravado

```ts
import {
  createRoadGraph,
  matchToRoads,
  type Coordinate,
  type RoadEdge,
  type RoadGraph,
} from "tempest-react-sdk";

interface Street extends RoadEdge {
  id: string;
  name: string;
}

interface RoadTile {
  nodes: Coordinate[];
  edges: Street[];
}

export async function loadRoads(bbox: string): Promise<RoadGraph<Street>> {
  const response = await fetch(`/api/roads?bbox=${bbox}`);
  if (!response.ok) throw new Error(`roads: HTTP ${response.status}`);
  const tile = (await response.json()) as RoadTile;
  return createRoadGraph(tile);
}

export async function streetsDriven(trace: Coordinate[]): Promise<string[]> {
  const graph = await loadRoads("-42.83,-5.11,-42.78,-5.06");
  const result = matchToRoads(trace, graph);

  for (const [i, match] of result.matches.entries()) {
    if (match === null) console.warn(`posição ${i}: nenhuma rua a até 200 m`);
  }
  console.log(`${result.breaks} quebras, ${result.dropped} posições paradas`);

  return result.routes.flatMap((route) => route.edges.map((step) => step.edge.name));
}
```

Pedaço por pedaço:

- **`matches`** tem uma entrada por posição, na mesma ordem: a aresta (`edge`, o **seu** objeto), o ponto projetado na rua (`point`), a distância (`distanceM`), a posição ao longo da aresta (`offsetM`) e `reversed` quando uma rua de mão dupla é percorrida de `to` para `from`. `null` quando não há rua a até `radiusM`.
- **`routes`** é a rota inferida: as arestas percorridas em ordem, **incluindo as que ficaram entre duas posições**, recuperadas pelo caminho mínimo na rede.
- **Quebra (`breaks`)**: quando nenhuma transição é possível (um buraco no sinal, uma rua que não está no grafo), a cadeia recomeça naquela posição em vez de falhar. Cada trecho sem quebra vira uma entrada em `routes`.
- **Posição parada (`dropped`)**: uma posição a menos de `minSpacingM` (padrão `2 × sigmaM`) da anterior não entra no modelo — o veículo andou menos que o ruído do GPS. Ela é projetada na aresta da posição anterior e volta com `inferred: true`, nunca `null`.

`TrackPoint` é um `Coordinate` com `timestamp`, então os `points` do `usePositionTracker` entram direto — e o `timestamp` deles já mantém a cadeia em [fonte esparsa](#fonte-esparsa-timestamp).

### No mapa ao vivo — `createRoadMatcher`

O `matchToRoads` precisa do trajeto inteiro. Para desenhar o veículo **agora**, o `createRoadMatcher` roda o mesmo modelo posição a posição, com Viterbi de atraso fixo:

!!! tip "No `LiveRouteMap`, é só passar `roads`"
    Se o seu mapa é o `LiveRouteMap`, você não precisa chamar o matcher: [`roads`](#ruas-no-mapa-e-veiculo-na-rua-roads) faz isso por dentro. Use o `createRoadMatcher` direto quando o desenho é seu.

```ts
import { createRoadMatcher, type Coordinate, type RoadGraph } from "tempest-react-sdk";

export function snapLive(graph: RoadGraph): (fix: Coordinate) => Coordinate {
  const matcher = createRoadMatcher(graph, { lag: 5 });
  return (fix) => {
    const { current, committed } = matcher.push(fix);
    for (const final of committed) {
      console.log(`posição ${final.index} confirmada em`, final.match?.edge);
    }
    return current?.point ?? fix;
  };
}
```

- **`current`** é o melhor palpite para a posição que acabou de chegar: use para desenhar o veículo. Ele ainda pode mudar.
- **`committed`** traz as posições que ficaram **definitivas**: cada uma espera `lag` posições novas antes de ser decidida. Uma posição confirmada não muda mais.
- A memória é limitada pelo `lag`; `flush()` confirma o que falta (fim da viagem). A rota entre posições não é reconstruída aqui: rode `matchToRoads` no trajeto terminado para ela.

### Fonte esparsa — `timestamp`

O desvio máximo fixo (`maxDetourM`, 100 m) foi calibrado a 1 Hz. Com uma posição a cada 5, 10 ou 30 s, o veículo dobra esquinas e dá a volta no quarteirão entre dois pontos, o caminho pela rede passa da linha reta por mais de 100 m e a cadeia **quebra**. Subir o `maxDetourM` para todo mundo não serve: a 1 Hz ele deixa o modelo inventar voltas que não aconteceram.

A saída é dizer **quando** cada posição foi tomada. Com `timestamp` nas duas posições, o desvio permitido entre elas vira:

```text
maxDetourM + detourPerSecondM × min(Δt, maxIntervalS)
```

Apertado onde as posições são densas, folgado onde são esparsas. Sem `timestamp` (ou com o relógio repetido ou voltando), o limite é exatamente o de antes.

```ts
import { matchToRoads, type RoadFix, type RoadGraph } from "tempest-react-sdk";

interface Ping {
  lat: number;
  lon: number;
  sentAt: string;
}

export function tripRuns(pings: Ping[], graph: RoadGraph): number {
  const fixes: RoadFix[] = pings.map((ping) => ({
    latitude: ping.lat,
    longitude: ping.lon,
    timestamp: Date.parse(ping.sentAt),
  }));
  const result = matchToRoads(fixes, graph);
  console.log(`${result.breaks} quebras em ${fixes.length} posições`);
  return result.routes.length;
}
```

- **`timestamp`** é em milissegundos desde a época, o mesmo do `GeolocationPosition.timestamp`. Os `points` do `usePositionTracker` já trazem.
- O `createRoadMatcher` e o `LiveRouteMap` com `roads` usam o `timestamp` do mesmo jeito: `matcher.push({ latitude, longitude, timestamp })`.
- **`detourPerSecondM`** (padrão `2`) é quanto desvio ganha cada segundo de intervalo. **`maxIntervalS`** (padrão `60`) é onde esse ganho para: depois de um buraco de 10 min, o limite é o de 60 s, e o Dijkstra não varre a cidade.

!!! info "O que sobra de quebra é contramão"
    Medido em rastros do Brasil (abaixo), quase toda quebra que fica com fonte esparsa some quando todas as ruas viram mão dupla: é bicicleta, ou `oneway` errado no OSM, andando contra o sentido. Para essas, folga maior não ajuda — ela troca a quebra por uma **volta no quarteirão que não aconteceu**, e é por isso que o padrão é pequeno.

??? info "Detalhes técnicos: como os padrões foram escolhidos"
    Dois conjuntos, a mesma varredura (`detourPerSecondM` 1/2/3/5/10, `maxIntervalS` 30/60/sem teto, contra o desvio fixo de 100/300/1000 m), cada trajeto raleado pelo próprio relógio:

    - Kubicka (`npm run build && node --expose-gc scripts/bench-map-matching.mjs`), com rota verdadeira;
    - rastros públicos do OSM em cinco centros brasileiros (`npm run build && node scripts/bench-br-osm.mjs [cache-dir]`), comparados com o encaixe denso da mesma corrida.

    `2` é a maior taxa que não piora o 1 Hz (92,33% → 92,34% de rua certa no Kubicka, com `timestamp`); `3` já perde 0,05 pp. Sem teto, os buracos longos dentro dos trajetos a 1 Hz custam 0,2 pp (92,13%); com 60 s, não.

| Brasil, todas as corridas (padrão sem → com `timestamp`) | 5 s | 10 s | 30 s |
| --- | --- | --- | --- |
| Quebras por 1000 posições | 5,7 → 5,4 | 10,1 → 8,9 | 24,2 → 13,8 |
| Rota a mais | 1,3% → 1,6% | 1,4% → 1,9% | 3,6% → 4,4% |
| Mesma via que o encaixe a 1 Hz | 95,0% → 95,0% | 93,7% → 93,7% | 89,6% → 90,1% |
| Quebras, só corridas a ≥ 6 m/s | 0,8 → **0** | 1,5 → **0** | 9,3 → **0** |
| Quebras com todas as ruas em mão dupla, com `timestamp` | 0,3 | 0,6 | 0 |

Para comparar: o desvio fixo de 1000 m leva as quebras a 1,9 a 5 s, mas a rota a mais a 6,1%.

### O que foi medido

`npm run build && node --expose-gc scripts/bench-map-matching.mjs`, sobre o dataset de Kubicka et al. (Zenodo 57731, CC BY-SA 4.0): 100 trajetos reais pelo mundo, 247 251 posições a ~1 Hz, com a rota verdadeira e o trecho do OpenStreetMap de cada um. "Rua certa" é a mesma métrica do encaixe ingênuo: a aresta encaixada pertence à rota verdadeira (sem considerar o sentido); `null` conta como erro.

| Medida (padrões) | Resultado |
| --- | --- |
| Rua certa, encaixe na rua mais próxima | 85,7% |
| Rua certa, `matchToRoads`, os 100 trajetos | **92,33%** |
| Rua certa, sem os 3 trajetos marcados `hives` (97 trajetos) | **98,53%** |
| Rua certa, mediana por trajeto | 99,9% (88 de 100 trajetos ≥ 97%) |
| Comprimento da rota verdadeira recuperado | 99,27% (0,78% de comprimento a mais) |
| Quebras | 48 em 100 trajetos |
| `createRoadMatcher`, `lag` 0 / 1 / 5 / 20 | 89,04% / 91,10% / 92,23% / 92,32% |
| Tempo (Node 24, i9-13900F) | 8,1 µs por posição; 1 h a 1 Hz (3600 posições) em 11 ms |

!!! warning "O limite medido"
    Dois trajetos (5 844 e 19 313 posições, 10% do dataset) andam por pátios e áreas sem rua no recorte do OSM — o próprio dataset os marca como `hives` — e acertam 18% e 43%. Nenhum ajuste de parâmetro os salva: não há rua certa para encaixar. É o mesmo sinal de "rua que a base não tem" que a inferência no backend vai tratar. Fora deles, o encaixe passa de 97%.

!!! note "Desempenho no aparelho"
    Medido em desktop, não em celular. Um grafo de 16 mil arestas (uma cidade média) monta em 8 ms e ocupa ~1 MB; o maior do dataset, 307 mil arestas, monta em 68 ms e ocupa 47 MB — corte a região em tiles. Encaixar 1 h a 1 Hz aloca ~30 MB transitórios e não retém quase nada; o modo ao vivo custa ~3 µs por posição. Mesmo com um celular 10× mais lento, é menos de 1 ms por posição.

| Opção | Default | O que faz |
| --- | --- | --- |
| `sigmaM` | `7` | Ruído do GPS, em metros (emissão gaussiana). |
| `betaM` | `3` | Escala da transição, em metros. Menor pune mais o desvio. |
| `radiusM` | `200` | Ruas além disso não são candidatas. |
| `maxCandidates` | `16` | No máximo esse número de ruas por posição (uma rua de mão dupla conta uma vez). |
| `minSpacingM` | `2 × sigmaM` | Posições mais perto que isso da anterior não entram no modelo. |
| `maxDetourM` | `100` | Desvio máximo da rede sobre a linha reta. Acima disso a transição é impossível. |
| `detourPerSecondM` | `2` | Desvio a mais por segundo entre duas posições com `timestamp`. `0` desliga. |
| `maxIntervalS` | `60` | Intervalo a partir do qual o desvio para de crescer. |
| `lag` (só `createRoadMatcher`) | `5` | Posições novas antes de confirmar uma. |

Os padrões estão em `ROAD_MATCH_DEFAULTS` e `ROAD_MATCHER_DEFAULT_LAG`. A tabela completa da varredura (raio × k, σ × β, desvio, pré-filtro) sai do mesmo comando.

## Recap

- **Coleta**: `usePositionTracker` / `createPositionTracker` gravam trajetória via `navigator.geolocation`, filtrando jitter — tudo no navegador.
- **Matemática**: `haversineKm`, `pathLengthKm`, `bearingDeg`, `estimateTravel` — offline, espelhando o `tempest-fastapi-sdk`.
- **Mapa**: `TrajectoryMap` plota em SVG sem tiles por padrão; `tileUrl` desenha tiles do **seu** servidor sob a mesma projeção, sem dependência externa.
- **Viagem ao vivo**: `LiveRouteMap` mostra rota planejada + trilha + veículo com direção, e segue o veículo sem reenquadrar a cada posição. Com `roads`, desenha as ruas e encaixa veículo e trilha nelas, sem código no app. `emphasis`, `glyphText`, `icon` e `markerScale` mudam o glifo, e o `LiveRouteMapLegend` desenha a legenda com os mesmos glifos.
- **Encaixe na rua**: `createRoadGraph` + `matchToRoads` (trajeto inteiro) e `createRoadMatcher` (ao vivo) colocam cada posição na rua certa — 98,5% medido fora das áreas sem rua. Com `timestamp`, uma posição a cada 5–30 s não quebra a cadeia na esquina.
- **Rota real**: `createOSRMBackend` é opt-in e aponta pro **seu** OSRM — o único ponto que toca a rede.

## Veja também

- [Hooks utilitários](./hooks.md) — `useGeolocation` (fix único / watch de baixo nível)
- [HTTP](./http.md) — enviar a trajetória pro backend
- [Offline](./offline.md) — persistir a trajetória localmente
