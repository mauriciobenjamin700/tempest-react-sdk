import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import {
    Badge,
    Button,
    Input,
    LiveRouteMap,
    LiveRouteMapLegend,
    TrajectoryMap,
    bearingDeg,
    createRoadGraph,
    estimateTravel,
    haversineKm,
    pathLengthKm,
    usePositionTracker,
    type Coordinate,
    type LiveRouteMarker,
    type MatchedFix,
    type RoadEdge,
    type TrackPoint,
    type TravelMode,
} from "tempest-react-sdk";
import { Flag, LocateFixed, MapPin, Play, RotateCcw, Ruler, Square } from "lucide-react";
import { Example } from "../Example";

/** Build a plausible synthetic walk around a center, for GPS-free demoing. */
function simulateWalk(center: Coordinate, steps: number): TrackPoint[] {
    const points: TrackPoint[] = [];
    let { latitude, longitude } = center;
    for (let i = 0; i < steps; i += 1) {
        // Gentle drift + a sine wiggle so the path is visibly curvy.
        latitude += 0.0009 + Math.sin(i / 3) * 0.0004;
        longitude += 0.0012 + Math.cos(i / 4) * 0.0005;
        points.push({ latitude, longitude, timestamp: i * 1000, accuracy: 8 });
    }
    return points;
}

const SAO_PAULO: Coordinate = { latitude: -23.5505, longitude: -46.6333 };

const LOCAL_TILE_URL =
    "data:image/svg+xml," +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">' +
            '<rect width="256" height="256" fill="#edf2f7"/>' +
            '<path d="M0 64H256M0 192H256M64 0V256M192 0V256" stroke="#cbd5e1" stroke-width="2"/>' +
            '<path d="M0 128H256M128 0V256" stroke="#94a3b8" stroke-width="4"/>' +
            "</svg>",
    ) +
    "#z={z}&x={x}&y={y}";

const SINGLE_STORE_MARKERS = [
    {
        id: "store-1",
        latitude: -2.9037,
        longitude: -41.7539,
        label: "Loja Centro",
    },
];

/** Self-hosted tile rendering on TrajectoryMap with markers alone (no Leaflet). */
function TrajectoryTilesDemo(): ReactElement {
    const [selected, setSelected] = useState<string | null>(null);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <TrajectoryMap
                points={[]}
                markers={SINGLE_STORE_MARKERS}
                onMarkerClick={(marker) => setSelected(marker.label ?? marker.id ?? null)}
                tileUrl={LOCAL_TILE_URL}
                tileAttribution="© Mapa local"
                label="Localização da loja"
                height={220}
            />
            <span style={{ fontSize: 13, color: "var(--tempest-text-muted)" }}>
                {selected
                    ? `Marcador selecionado: ${selected}`
                    : "Clique no marcador para selecioná-lo."}
            </span>
        </div>
    );
}

/** Live SVG trajectory: real GPS tracking + a synthetic-walk fallback. */
function TrajectoryDemo(): ReactElement {
    const [simulated, setSimulated] = useState<TrackPoint[]>([]);
    const tracker = usePositionTracker({ minDistanceKm: 0.005 });

    const usingReal = tracker.points.length > 0 || tracker.isTracking;
    const points = usingReal ? tracker.points : simulated;
    const current = usingReal ? tracker.lastPoint : (simulated.at(-1) ?? null);
    const distanceKm = usingReal ? tracker.distanceKm : pathLengthKm(simulated);

    const grow = useCallback(() => {
        setSimulated((prev) =>
            prev.length === 0
                ? simulateWalk(SAO_PAULO, 8)
                : [...prev, ...simulateWalk(prev.at(-1)!, 4)],
        );
    }, []);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Button
                    size="sm"
                    onClick={tracker.isTracking ? tracker.stop : tracker.start}
                    variant={tracker.isTracking ? "ghost" : "primary"}
                >
                    {tracker.isTracking ? <Square size={14} /> : <LocateFixed size={14} />}
                    {tracker.isTracking ? "Parar GPS" : "Rastrear GPS real"}
                </Button>
                <Button size="sm" variant="secondary" onClick={grow} disabled={usingReal}>
                    <Play size={14} /> Simular caminhada
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                        tracker.clear();
                        setSimulated([]);
                    }}
                >
                    <RotateCcw size={14} /> Limpar
                </Button>
                <Badge variant={tracker.status === "error" ? "danger" : "neutral"}>
                    {tracker.status}
                </Badge>
                <span style={{ fontSize: 13, color: "var(--tempest-text-muted, #888)" }}>
                    {distanceKm.toFixed(2)} km · {points.length} pontos
                </span>
            </div>

            {tracker.status === "error" && (
                <p style={{ fontSize: 12, color: "var(--tempest-danger-fg, #c00)", margin: 0 }}>
                    GPS indisponível ou permissão negada — use “Simular caminhada”.
                </p>
            )}

            <TrajectoryMap points={points} current={current} height={340} />
        </div>
    );
}

/** Planned bus route through central São Paulo, for the live-trip demo. */
const BUS_ROUTE: Coordinate[] = [
    { latitude: -23.5505, longitude: -46.6333 },
    { latitude: -23.552, longitude: -46.6318 },
    { latitude: -23.5535, longitude: -46.6301 },
    { latitude: -23.5553, longitude: -46.6285 },
    { latitude: -23.5571, longitude: -46.6268 },
    { latitude: -23.5592, longitude: -46.6255 },
    { latitude: -23.5612, longitude: -46.6239 },
    { latitude: -23.563, longitude: -46.6218 },
    { latitude: -23.5648, longitude: -46.6197 },
];

const BUS_STOPS: LiveRouteMarker[] = [
    {
        id: "se",
        label: "Praça da Sé",
        kind: "origin",
        badge: 2,
        ...BUS_ROUTE[0],
        content: <p style={{ margin: 0 }}>Ana e Bruno embarcam aqui.</p>,
    },
    {
        id: "liberdade",
        label: "Liberdade",
        kind: "stop",
        badge: 3,
        ...BUS_ROUTE[4],
        content: (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
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
        ...BUS_ROUTE[8],
        content: <p style={{ margin: 0 }}>Chegada prevista às 08:40.</p>,
    },
];

/** Live trip: a simulated bus moving along a planned route, one fix per tick. */
function LiveTripDemo(): ReactElement {
    const [step, setStep] = useState<number>(1);
    const [playing, setPlaying] = useState<boolean>(false);
    const [follow, setFollow] = useState<boolean>(true);

    useEffect(() => {
        if (!playing) return;
        const timer = window.setInterval(() => {
            setStep((prev) => (prev < BUS_ROUTE.length - 1 ? prev + 1 : prev));
        }, 1500);
        return () => window.clearInterval(timer);
    }, [playing]);

    const trail = BUS_ROUTE.slice(0, step + 1);
    const position = BUS_ROUTE[step];
    const heading = bearingDeg(BUS_ROUTE[step - 1], position);
    const minutes = (BUS_ROUTE.length - 1 - step) * 2;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Button
                    size="sm"
                    variant={playing ? "ghost" : "primary"}
                    onClick={() => setPlaying((p) => !p)}
                >
                    {playing ? <Square size={14} /> : <Play size={14} />}
                    {playing ? "Pausar" : "Rodar viagem"}
                </Button>
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setStep((s) => Math.min(BUS_ROUTE.length - 1, s + 1))}
                    data-testid="live-trip-next"
                >
                    Próxima posição
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setStep(1)}>
                    <RotateCcw size={14} /> Reiniciar
                </Button>
                <Button
                    size="sm"
                    variant={follow ? "primary" : "ghost"}
                    aria-pressed={follow}
                    onClick={() => setFollow((f) => !f)}
                >
                    Seguir veículo
                </Button>
                <span style={{ fontSize: 13, color: "var(--tempest-text-muted, #888)" }}>
                    {minutes > 0 ? `Chegada em ${minutes} min` : "Chegou"}
                </span>
            </div>
            <LiveRouteMap
                route={BUS_ROUTE}
                trail={trail}
                vehicle={{ position, heading, label: "Ônibus 42" }}
                markers={BUS_STOPS}
                follow={follow}
                etaLabel={minutes > 0 ? `Chegada estimada em ${minutes} minutos` : "Ônibus chegou"}
                height={380}
                data-testid="live-trip-map"
            />
        </div>
    );
}

/** The same trip seen by one passenger: stops numbered, their pickup set apart, a finish flag. */
const SYMBOL_STOPS: LiveRouteMarker[] = [
    {
        id: "s1",
        label: "Parada 1 — Praça da Sé",
        kind: "origin",
        glyphText: "1",
        visited: true,
        ...BUS_ROUTE[0],
    },
    { id: "s2", label: "Parada 2 — Liberdade", glyphText: "2", badge: 3, ...BUS_ROUTE[3] },
    {
        id: "s3",
        label: "Seu embarque — Parada 3, São Joaquim",
        glyphText: "3",
        emphasis: true,
        ...BUS_ROUTE[5],
        content: <p style={{ margin: 0 }}>Embarque previsto às 08:31.</p>,
    },
    { id: "s4", label: "Parada 4 — Vergueiro", glyphText: "4", ...BUS_ROUTE[7] },
    {
        id: "end",
        label: "Chegada — Paraíso",
        kind: "destination",
        icon: <Flag />,
        ...BUS_ROUTE[8],
    },
];

/** Marker symbology: emphasis, glyph text, an icon, markerScale and the shared legend. */
function LiveSymbolsDemo(): ReactElement {
    const [large, setLarge] = useState<boolean>(false);
    const [stale, setStale] = useState<boolean>(false);
    const scale = large ? 1.5 : 1;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button
                    size="sm"
                    variant={large ? "primary" : "secondary"}
                    aria-pressed={large}
                    onClick={() => setLarge((v) => !v)}
                >
                    Glifos maiores (markerScale 1.5)
                </Button>
                <Button
                    size="sm"
                    variant={stale ? "primary" : "secondary"}
                    aria-pressed={stale}
                    onClick={() => setStale((v) => !v)}
                    data-testid="live-symbols-stale"
                >
                    Sinal perdido (vehicle.stale)
                </Button>
            </div>
            <LiveRouteMap
                route={BUS_ROUTE}
                trail={BUS_ROUTE.slice(0, 3)}
                vehicle={{
                    position: BUS_ROUTE[2],
                    heading: bearingDeg(BUS_ROUTE[1], BUS_ROUTE[2]),
                    label: "Ônibus 42",
                    stale,
                }}
                markers={SYMBOL_STOPS}
                markerScale={scale}
                height={340}
                label="Mapa da viagem com legenda"
                data-testid="live-symbols-map"
            />
            <LiveRouteMapLegend
                markerScale={scale}
                items={[
                    { symbol: "stop", label: "Seu embarque", emphasis: true },
                    { symbol: "stop", label: "Parada (ordem)", glyphText: "1" },
                    { symbol: "destination", label: "Chegada", icon: <Flag /> },
                    { symbol: "vehicle", label: "Ônibus" },
                    { symbol: "route", label: "Rota planejada" },
                    { symbol: "trail", label: "Já percorrido" },
                    { symbol: "stop", label: "Parada atendida", glyphText: "1", visited: true },
                    { symbol: "vehicle", label: "Sem sinal", stale: true },
                    { symbol: "badge", label: "Embarques na parada", badge: 3 },
                ]}
                data-testid="live-symbols-legend"
            />
        </div>
    );
}

const TOWN: Coordinate = { latitude: -23.5614, longitude: -46.6559 };
const METRE_LAT = 1 / 111_320;
const METRE_LON = 1 / (111_320 * Math.cos((TOWN.latitude * Math.PI) / 180));

/** A point `east` / `north` metres from the centre of the demo town. */
function townPoint(east: number, north: number): Coordinate {
    return {
        latitude: TOWN.latitude + north * METRE_LAT,
        longitude: TOWN.longitude + east * METRE_LON,
    };
}

interface Street extends RoadEdge {
    name: string;
}

/**
 * A small street grid: the avenue the bus drives, a parallel street 22 m to
 * the north (the trap for nearest-road snapping), the cross street it turns
 * into and two side streets.
 */
const TOWN_ROADS = createRoadGraph<Street>({
    nodes: [
        townPoint(0, 0),
        townPoint(150, 0),
        townPoint(300, 0),
        townPoint(450, 0),
        townPoint(600, 0),
        townPoint(0, 22),
        townPoint(150, 22),
        townPoint(300, 22),
        townPoint(450, 22),
        townPoint(600, 22),
        townPoint(450, 150),
        townPoint(450, 300),
        townPoint(150, -150),
    ],
    edges: [
        { from: 0, to: 1, name: "Avenida Central" },
        { from: 1, to: 2, name: "Avenida Central" },
        { from: 2, to: 3, name: "Avenida Central" },
        { from: 3, to: 4, name: "Avenida Central" },
        { from: 5, to: 6, name: "Rua Paralela" },
        { from: 6, to: 7, name: "Rua Paralela" },
        { from: 7, to: 8, name: "Rua Paralela" },
        { from: 8, to: 9, name: "Rua Paralela" },
        { from: 0, to: 5, name: "Travessa Oeste" },
        { from: 4, to: 9, name: "Travessa Leste" },
        { from: 3, to: 8, name: "Rua das Flores" },
        { from: 8, to: 10, name: "Rua das Flores" },
        { from: 10, to: 11, name: "Rua das Flores" },
        { from: 1, to: 12, name: "Rua do Mercado" },
    ],
    twoWay: true,
});

/** Lateral GPS noise of the demo, in metres: up to ~12 m, mostly toward the parallel street. */
const NOISE = [4, 9, -3, 12, 7, 11, -6, 10, 3, 12, 8, -4, 11, 9, 6, 12, -2, 10];

/**
 * The drive: east on the avenue every 25 m with the noise pushed north (often
 * closer to Rua Paralela than to the avenue), a left turn into Rua das Flores
 * with the noise now east–west, and a last fix far from every street.
 */
const NOISY_DRIVE: Coordinate[] = [
    ...NOISE.map((noise, i) => townPoint(10 + i * 25, noise)),
    ...[30, 60, 90, 120, 150, 180, 210, 240, 270].map((north, i) =>
        townPoint(450 + (i % 2 === 0 ? 8 : -9), north),
    ),
    townPoint(700, 310),
];

const TOWN_ROUTE: Coordinate[] = [townPoint(0, 0), townPoint(450, 0), townPoint(450, 300)];

const TOWN_STOPS: LiveRouteMarker[] = [
    { id: "start", label: "Terminal", kind: "origin", ...TOWN_ROUTE[0] },
    { id: "end", label: "Escola", kind: "destination", ...TOWN_ROUTE[2] },
];

/** Live trip on a road graph: the same noisy fixes, snapped or raw. */
function RoadSnapDemo(): ReactElement {
    const [step, setStep] = useState<number>(0);
    const [playing, setPlaying] = useState<boolean>(false);
    const [snap, setSnap] = useState<boolean>(true);
    const [match, setMatch] = useState<MatchedFix<Street> | null>(null);

    useEffect(() => {
        if (!playing) return;
        const timer = window.setInterval(() => {
            setStep((prev) => (prev < NOISY_DRIVE.length - 1 ? prev + 1 : prev));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [playing]);

    const trail = useMemo(() => NOISY_DRIVE.slice(0, step + 1), [step]);
    const where = !snap
        ? "Sem grafo: posição crua do GPS"
        : match
          ? `${match.edge.name} · ${match.distanceM.toFixed(0)} m da posição`
          : "Fora de qualquer rua: posição crua";

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Button
                    size="sm"
                    variant={playing ? "ghost" : "primary"}
                    onClick={() => setPlaying((p) => !p)}
                >
                    {playing ? <Square size={14} /> : <Play size={14} />}
                    {playing ? "Pausar" : "Rodar viagem"}
                </Button>
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setStep((s) => Math.min(NOISY_DRIVE.length - 1, s + 1))}
                    data-testid="road-snap-next"
                >
                    Próxima posição
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setStep(0)}>
                    <RotateCcw size={14} /> Reiniciar
                </Button>
                <Button
                    size="sm"
                    variant={snap ? "primary" : "ghost"}
                    aria-pressed={snap}
                    onClick={() => setSnap((v) => !v)}
                >
                    Encaixar na rua
                </Button>
            </div>
            <span
                style={{ fontSize: 13, color: "var(--tempest-text-muted, #888)" }}
                data-testid="road-snap-status"
            >
                Posição {step + 1}/{NOISY_DRIVE.length} · {where}
            </span>
            <LiveRouteMap
                route={TOWN_ROUTE}
                trail={trail}
                vehicle={{ position: NOISY_DRIVE[step], label: "Ônibus 7" }}
                markers={TOWN_STOPS}
                roads={snap ? TOWN_ROADS : undefined}
                onMatch={setMatch}
                follow
                height={380}
                data-testid="road-snap-map"
            />
        </div>
    );
}

/** Distance + offline travel-estimate calculator between two coordinates. */
function DistanceDemo(): ReactElement {
    const [origin, setOrigin] = useState<Coordinate>(SAO_PAULO);
    const [destination, setDestination] = useState<Coordinate>({
        latitude: -22.9068,
        longitude: -43.1729,
    });
    const [mode, setMode] = useState<TravelMode>("car");

    const distance = useMemo(() => haversineKm(origin, destination), [origin, destination]);
    const estimate = useMemo(
        () => estimateTravel(origin, destination, mode),
        [origin, destination, mode],
    );

    const field = (label: string, value: number, onChange: (n: number) => void): ReactElement => (
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ color: "var(--tempest-text-muted, #888)" }}>{label}</span>
            <Input
                type="number"
                value={String(value)}
                onChange={(e) => onChange(Number(e.target.value))}
                style={{ width: 130 }}
            />
        </label>
    );

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <fieldset
                    style={{
                        border: "1px solid var(--tempest-border,#ddd)",
                        borderRadius: 8,
                        padding: 10,
                    }}
                >
                    <legend style={{ fontSize: 12, padding: "0 6px" }}>
                        <MapPin size={12} /> Origem
                    </legend>
                    <div style={{ display: "flex", gap: 8 }}>
                        {field("lat", origin.latitude, (n) =>
                            setOrigin((o) => ({ ...o, latitude: n })),
                        )}
                        {field("lon", origin.longitude, (n) =>
                            setOrigin((o) => ({ ...o, longitude: n })),
                        )}
                    </div>
                </fieldset>
                <fieldset
                    style={{
                        border: "1px solid var(--tempest-border,#ddd)",
                        borderRadius: 8,
                        padding: 10,
                    }}
                >
                    <legend style={{ fontSize: 12, padding: "0 6px" }}>
                        <MapPin size={12} /> Destino
                    </legend>
                    <div style={{ display: "flex", gap: 8 }}>
                        {field("lat", destination.latitude, (n) =>
                            setDestination((d) => ({ ...d, latitude: n })),
                        )}
                        {field("lon", destination.longitude, (n) =>
                            setDestination((d) => ({ ...d, longitude: n })),
                        )}
                    </div>
                </fieldset>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(["car", "motorcycle", "bus"] as const).map((m) => (
                    <Button
                        key={m}
                        size="sm"
                        variant={mode === m ? "primary" : "ghost"}
                        onClick={() => setMode(m)}
                    >
                        {m}
                    </Button>
                ))}
            </div>

            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 14 }}>
                <span>
                    <Ruler size={14} /> Grande-círculo: <strong>{distance.toFixed(1)} km</strong>
                </span>
                <span>
                    Estimativa ({estimate.mode}):{" "}
                    <strong>{estimate.distance_km.toFixed(1)} km</strong> ·{" "}
                    <strong>{estimate.duration_minutes.toFixed(0)} min</strong>
                </span>
            </div>
        </div>
    );
}

/** Recipe section for the self-hosted geolocation module. */
export function GeoSection(): ReactElement {
    return (
        <section className="gallery-section" id="geo">
            <h3>Geolocalização (self-hosted)</h3>
            <p className="description">
                Coleta de latitude/longitude pela API do navegador, cálculo de distância/trajetória
                e plot de mapa <strong>sem nenhuma API paga ou externa</strong>. O mapa padrão é um
                plot SVG tile-free (zero request). Espelha o módulo <code>geo</code> do{" "}
                <code>tempest-fastapi-sdk</code>.
            </p>

            <Example
                id="ex-trajectory-map"
                title="usePositionTracker + TrajectoryMap — trajetória ao vivo"
                note={
                    <>
                        “Rastrear GPS real” usa <code>navigator.geolocation.watchPosition</code>{" "}
                        (pede permissão). Sem GPS, use “Simular caminhada” pra ver o plot SVG
                        tile-free desenhando a rota — <strong>nenhum tile externo é baixado</strong>
                        .
                    </>
                }
                code={`import { usePositionTracker, TrajectoryMap } from "tempest-react-sdk";

function LiveRun() {
  const { points, lastPoint, distanceKm, isTracking, start, stop } =
    usePositionTracker({ minDistanceKm: 0.01 });

  return (
    <div>
      <button onClick={isTracking ? stop : start}>
        {isTracking ? "Parar" : "Rastrear"}
      </button>
      <span>{distanceKm.toFixed(2)} km</span>
      <TrajectoryMap points={points} current={lastPoint} height={340} />
    </div>
  );
}`}
                props={[
                    {
                        name: "usePositionTracker → points",
                        type: "readonly TrackPoint[]",
                        description: "Trajetória gravada (mais novo por último).",
                    },
                    {
                        name: "→ distanceKm",
                        type: "number",
                        description: "Distância total acumulada (haversine).",
                    },
                    {
                        name: "minDistanceKm",
                        type: "number",
                        default: "0.005",
                        description: "Filtra jitter do GPS parado (5 m).",
                    },
                    {
                        name: "TrajectoryMap.tileUrl",
                        type: "string",
                        description:
                            "Template {z}/{x}/{y} do SEU tile server — desenha tiles direto no SVG, sem dependência extra.",
                    },
                ]}
            >
                <TrajectoryDemo />
            </Example>

            <Example
                id="ex-trajectory-map-tiles"
                title="TrajectoryMap — tiles próprios com marcador (sem Leaflet)"
                note={
                    <>
                        Com <code>tileUrl</code>, o mapa desenha os tiles{" "}
                        <code>{"{z}/{x}/{y}"}</code> direto no SVG sob a mesma projeção Web
                        Mercator, sem Leaflet. Funciona inclusive com <code>points={"[]"}</code> e
                        apenas <code>markers</code>.
                    </>
                }
                code={`import { TrajectoryMap } from "tempest-react-sdk";

<TrajectoryMap
  points={[]}
  markers={[{ id: "store-1", latitude: -2.9037, longitude: -41.7539, label: "Loja Centro" }]}
  onMarkerClick={(marker) => console.log(marker.id)}
  tileUrl="https://tiles.SEU-SERVIDOR/{z}/{x}/{y}.png"
  tileAttribution="© OpenStreetMap"
  height={220}
/>`}
            >
                <TrajectoryTilesDemo />
            </Example>

            <Example
                id="ex-live-route-map"
                title="LiveRouteMap — viagem ao vivo"
                note={
                    <>
                        Rota planejada tracejada, trilha sólida, ônibus com direção e 3 pontos de
                        embarque. Clique (ou <kbd>Tab</kbd> + <kbd>Enter</kbd>) num ponto para ver
                        quem embarca. Arraste o mapa: o seguir pausa e aparece{" "}
                        <strong>Recentralizar</strong>.
                    </>
                }
                code={`import { LiveRouteMap, bearingDeg } from "tempest-react-sdk";

<LiveRouteMap
  route={osrmGeometry}
  trail={traveled}
  vehicle={{ position: fix, heading: bearingDeg(previousFix, fix) }}
  markers={[
    { id: "se", label: "Praça da Sé", kind: "origin", badge: 2, ...se,
      content: <p>Ana e Bruno embarcam aqui.</p> },
  ]}
  follow
  etaLabel="Chegada estimada em 6 minutos"
/>`}
                props={[
                    {
                        name: "route / trail",
                        type: "readonly Coordinate[]",
                        description: "Rota planejada (tracejada) e trilha percorrida (sólida).",
                    },
                    {
                        name: "vehicle",
                        type: "{ position, heading?, label? }",
                        description: "Veículo com seta de direção; desliza entre posições.",
                    },
                    {
                        name: "markers",
                        type: "LiveRouteMarker[]",
                        description: "kind (origem/parada/destino), badge e content (ReactNode).",
                    },
                    {
                        name: "follow",
                        type: "boolean",
                        default: "false",
                        description: "Segue o veículo sem reenquadrar nem mudar o zoom.",
                    },
                ]}
            >
                <LiveTripDemo />
            </Example>

            <Example
                id="ex-live-route-symbols"
                title="LiveRouteMap — simbologia e legenda"
                note={
                    <>
                        Paradas numeradas (<code>glyphText</code>), o embarque do passageiro em
                        destaque (<code>emphasis</code>), parada já atendida (<code>visited</code>),
                        veículo sem sinal (<code>vehicle.stale</code>), bandeira de chegada (
                        <code>icon</code>) e a legenda exportada, que usa os mesmos glifos e cores
                        do mapa — inclusive o selo de contagem.
                    </>
                }
                code={`import { Flag } from "lucide-react";
import { LiveRouteMap, LiveRouteMapLegend } from "tempest-react-sdk";

<LiveRouteMap
  route={route}
  markers={[
    { id: "s3", label: "Seu embarque — Parada 3", glyphText: "3", emphasis: true, ...p3 },
    { id: "end", label: "Chegada", kind: "destination", icon: <Flag />, ...end },
  ]}
  markerScale={1.5}
/>
<LiveRouteMapLegend
  markerScale={1.5}
  items={[
    { symbol: "stop", label: "Seu embarque", emphasis: true },
    { symbol: "destination", label: "Chegada", icon: <Flag /> },
  ]}
/>`}
                props={[
                    {
                        name: "markers[].emphasis",
                        type: "boolean",
                        description: "Glifo 1,4× maior com halo, mesma cor do tipo.",
                    },
                    {
                        name: "markers[].glyphText / icon",
                        type: "string / ReactNode",
                        description: "Texto curto ou ícone SVG dentro do glifo.",
                    },
                    {
                        name: "markerScale",
                        type: "number",
                        default: "1",
                        description:
                            "Tamanho dos glifos; o alvo de toque é 44 px em qualquer escala.",
                    },
                    {
                        name: "markers[].visited",
                        type: "boolean",
                        default: "false",
                        description:
                            "Parada já atendida: cinza neutro, mesmo tipo, dito ao leitor.",
                    },
                    {
                        name: "vehicle.stale",
                        type: "boolean",
                        default: "false",
                        description: "Posição velha: veículo cinza, sem halo, staleLabel no nome.",
                    },
                ]}
            >
                <LiveSymbolsDemo />
            </Example>

            <Example
                id="ex-live-route-roads"
                title="LiveRouteMap + roads — veículo encaixado na rua"
                note={
                    <>
                        As mesmas posições com ~10 m de ruído lateral, várias delas mais perto da{" "}
                        <strong>Rua Paralela</strong> do que da avenida. Com o grafo, o ônibus fica
                        na avenida, a seta segue a rua e a trilha dobra a esquina. Desligue
                        &ldquo;Encaixar na rua&rdquo; para ver o GPS cru. A última posição fica fora
                        de qualquer rua: o ônibus aparece onde está, com um anel tracejado.
                    </>
                }
                code={`import { LiveRouteMap, createRoadGraph, type RoadEdge } from "tempest-react-sdk";

interface Street extends RoadEdge {
  name: string;
}

const roads = createRoadGraph<Street>({ nodes, edges, twoWay: true });

<LiveRouteMap
  route={plannedRoute}
  trail={rawFixes}
  vehicle={{ position: lastFix }}
  roads={roads}
  onMatch={(match) => setStreet(match?.edge.name ?? null)}
/>`}
                props={[
                    {
                        name: "roads",
                        type: "RoadGraph<E>",
                        description:
                            "Desenha as ruas e encaixa veículo e trilha (matcher carregado sob demanda).",
                    },
                    {
                        name: "onMatch",
                        type: "(match: MatchedFix<E> | null) => void",
                        description: "Cada posição nova encaixada: sua aresta, ponto e distância.",
                    },
                ]}
            >
                <RoadSnapDemo />
            </Example>

            <Example
                id="ex-distance-estimate"
                title="haversineKm + estimateTravel — distância e tempo offline"
                note={
                    <>
                        Distância grande-círculo e estimativa de viagem{" "}
                        <strong>100% offline</strong> (sem rede), com a mesma matemática do{" "}
                        <code>tempest-fastapi-sdk</code>.
                    </>
                }
                code={`import { haversineKm, estimateTravel } from "tempest-react-sdk";

const sp = { latitude: -23.5505, longitude: -46.6333 };
const rio = { latitude: -22.9068, longitude: -43.1729 };

haversineKm(sp, rio);              // ≈ 360.9 km
estimateTravel(sp, rio, "bus");    // { distance_km, duration_minutes, source: "heuristic" }`}
            >
                <DistanceDemo />
            </Example>
        </section>
    );
}
