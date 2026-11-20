# Geolocalização

Módulo de geolocalização **100% self-hosted**: coleta de latitude/longitude pela API do navegador, cálculo de distância/trajetória e plot de mapas — **sem nenhuma API paga ou externa**. O mapa padrão é um plot **SVG tile-free** (sem imagens de tiles, sem requests). Espelha o módulo `geo` do [`tempest-fastapi-sdk`](https://pypi.org/project/tempest-fastapi-sdk/), então os tipos e a matemática batem entre cliente e servidor.

!!! info "Por que tile-free?"
    Qualquer mapa com imagem (OpenStreetMap, Mapbox, Google) baixa _tiles_ de um servidor externo. Isso colide com o requisito de "nada externo". Por isso o `TrajectoryMap` desenha a trajetória projetada em SVG (Web Mercator) sem fundo — zero request. Se você **hospeda seu próprio** servidor de tiles, dá pra ligar a camada Leaflet opcional passando `tileUrl`.

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

### Tiles reais (opt-in) com Leaflet

Se você **hospeda tiles próprios**, passe `tileUrl` — o componente carrega o Leaflet sob demanda (import dinâmico) e sobe uma camada de tiles de verdade. Requer o `leaflet` instalado no app e a folha de estilo importada uma vez.

```tsx
// npm install leaflet
import "leaflet/dist/leaflet.css";
import { TrajectoryMap } from "tempest-react-sdk";

<TrajectoryMap
  points={points}
  tileUrl="https://tiles.SEU-SERVIDOR/{z}/{x}/{y}.png"
  tileAttribution="© Seus dados de mapa"
  height={420}
/>;
```

!!! note "Leaflet é peer opcional"
    Sem `tileUrl`, o Leaflet **nunca** entra no bundle (o import é lazy). Se `tileUrl` for passado e o `leaflet` não estiver instalado, o componente mostra uma mensagem em vez de quebrar.

| Prop | Tipo | Default | Descrição |
| --- | --- | --- | --- |
| `points` | `readonly Coordinate[]` | — | Trajetória a desenhar. |
| `current` | `Coordinate \| null` | — | Marcador de posição atual (pulsante). |
| `height` | `number` | `320` | Altura do viewport em px. |
| `padding` | `number` | `24` | Margem interna em px. |
| `showGrid` / `showScale` | `boolean` | `true` | Grid e barra de escala (modo SVG). |
| `strokeColor` | `string` | token primário | Cor da linha. |
| `tileUrl` | `string` | — | Template `{z}/{x}/{y}` do **seu** tile server → liga o Leaflet. |
| `tileAttribution` | `string` | — | Atribuição sobre os tiles. |

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
| `vehicle` | `LiveVehicle \| null` | — | `{ position, heading?, label? }`. |
| `markers` | `readonly LiveRouteMarker[]` | — | `{ id, label, latitude, longitude, kind?, badge?, content? }`. |
| `follow` | `boolean` | `false` | Mantém o veículo à vista sem mudar o zoom. |
| `etaLabel` | `string` | — | Texto anunciado ao leitor de tela. |
| `height` / `padding` | `number` | `360` / `32` | Altura e margem do enquadramento, em px. |
| `animationMs` | `number` | `600` | Duração do deslize do veículo. `0` pula. |
| `showScale` | `boolean` | `true` | Barra de escala em m/km. |
| `tileUrl` / `tileAttribution` / `tileMaxZoom` | `string` / `string` / `number` | — / — / `19` | Tiles do **seu** servidor. |
| `label` / `recenterLabel` / `closeLabel` | `string` | `"Mapa da viagem"` / `"Recentralizar"` / `"Fechar"` | Textos acessíveis. |
| `kindLabels` | `Partial<Record<LiveRouteMarkerKind, string>>` | `origem` / `parada` / `destino` | Nome falado de cada tipo. |
| `onMarkerOpenChange` | `(id: string \| null) => void` | — | Painel de um marcador abriu (`id`) ou fechou (`null`). |
| `roads` | `RoadGraph<E>` | — | Grafo do `createRoadGraph`: desenha as ruas e encaixa veículo e trilha. |
| `onMatch` | `(match: MatchedFix<E> \| null) => void` | — | Cada posição nova encaixada (sua aresta, ponto, distância), ou `null` fora de qualquer rua. Só com `roads`. |

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
- **Transição**: uma exponencial em `|linha reta − distância pela rede|` (`betaM`) — entre dois pontos seguidos, o caminho pela rede deve ter o tamanho do deslocamento. A distância pela rede vem de um Dijkstra limitado (`maxDetourM`).

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

`TrackPoint` é um `Coordinate`, então os `points` do `usePositionTracker` entram direto.

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
| `lag` (só `createRoadMatcher`) | `5` | Posições novas antes de confirmar uma. |

Os padrões estão em `ROAD_MATCH_DEFAULTS` e `ROAD_MATCHER_DEFAULT_LAG`. A tabela completa da varredura (raio × k, σ × β, desvio, pré-filtro) sai do mesmo comando.

## Recap

- **Coleta**: `usePositionTracker` / `createPositionTracker` gravam trajetória via `navigator.geolocation`, filtrando jitter — tudo no navegador.
- **Matemática**: `haversineKm`, `pathLengthKm`, `bearingDeg`, `estimateTravel` — offline, espelhando o `tempest-fastapi-sdk`.
- **Mapa**: `TrajectoryMap` plota em SVG sem tiles por padrão; `tileUrl` liga o Leaflet só com servidor **seu**.
- **Viagem ao vivo**: `LiveRouteMap` mostra rota planejada + trilha + veículo com direção, e segue o veículo sem reenquadrar a cada posição. Com `roads`, desenha as ruas e encaixa veículo e trilha nelas, sem código no app.
- **Encaixe na rua**: `createRoadGraph` + `matchToRoads` (trajeto inteiro) e `createRoadMatcher` (ao vivo) colocam cada posição na rua certa — 98,5% medido fora das áreas sem rua.
- **Rota real**: `createOSRMBackend` é opt-in e aponta pro **seu** OSRM — o único ponto que toca a rede.

## Veja também

- [Hooks utilitários](./hooks.md) — `useGeolocation` (fix único / watch de baixo nível)
- [HTTP](./http.md) — enviar a trajetória pro backend
- [Offline](./offline.md) — persistir a trajetória localmente
