# Geolocalização

Módulo de geolocalização **100% self-hosted**: coleta de latitude/longitude pela API do navegador, cálculo de distância/trajetória e plot de mapas — **sem nenhuma API paga ou externa**. O mapa padrão é um plot **SVG tile-free** (sem imagens de tiles, sem requests). Espelha o módulo `geo` do [`tempest-fastapi-sdk`](https://pypi.org/project/tempest-fastapi-sdk/), então os tipos e a matemática batem entre cliente e servidor.

!!! info "Por que tile-free?"
    Qualquer mapa com imagem (OpenStreetMap, Mapbox, Google) baixa _tiles_ de um servidor externo. Isso colide com o requisito de "nada externo". Por isso o `TrajectoryMap` desenha a trajetória projetada em SVG (Web Mercator) sem fundo — zero request. Se você **hospeda seu próprio** servidor de tiles, dá pra ligar a camada Leaflet opcional passando `tileUrl`.

## Quando usar

- Coletar a posição do usuário (uma vez ou contínua) via `navigator.geolocation`.
- Gravar e exibir uma **trajetória** (corrida, entrega, trilha).
- Calcular distância entre pontos ou estimar tempo de viagem **offline**.
- Plotar tudo sem depender de mapa pago/externo.

## Tipos — `Coordinate`, `TrackPoint`, `TravelEstimate`

Os tipos espelham os schemas do FastAPI SDK (snake_case preservado no `TravelEstimate` pra desserializar direto de uma resposta):

```ts
import type { Coordinate, TrackPoint, TravelEstimate, TravelMode } from "tempest-react-sdk";

const sp: Coordinate = { latitude: -23.5505, longitude: -46.6333 };

// TrackPoint = Coordinate + quando foi capturado (+ accuracy opcional)
const ponto: TrackPoint = { ...sp, timestamp: Date.now(), accuracy: 12 };

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

### Versão imperativa — `createPositionTracker`

Fora do React (services), o controller expõe `start`/`stop`/`clear` + getters `points`/`distanceKm`/`status`:

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

## Recap

- **Coleta**: `usePositionTracker` / `createPositionTracker` gravam trajetória via `navigator.geolocation`, filtrando jitter — tudo no navegador.
- **Matemática**: `haversineKm`, `pathLengthKm`, `bearingDeg`, `estimateTravel` — offline, espelhando o `tempest-fastapi-sdk`.
- **Mapa**: `TrajectoryMap` plota em SVG sem tiles por padrão; `tileUrl` liga o Leaflet só com servidor **seu**.
- **Rota real**: `createOSRMBackend` é opt-in e aponta pro **seu** OSRM — o único ponto que toca a rede.

## Veja também

- [Hooks utilitários](./hooks.md) — `useGeolocation` (fix único / watch de baixo nível)
- [HTTP](./http.md) — enviar a trajetória pro backend
- [Offline](./offline.md) — persistir a trajetória localmente
