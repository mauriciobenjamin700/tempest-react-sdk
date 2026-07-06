import { useCallback, useMemo, useState, type ReactElement } from "react";
import {
    Badge,
    Button,
    Input,
    TrajectoryMap,
    estimateTravel,
    haversineKm,
    pathLengthKm,
    usePositionTracker,
    type Coordinate,
    type TrackPoint,
    type TravelMode,
} from "tempest-react-sdk";
import { LocateFixed, MapPin, Play, RotateCcw, Ruler, Square } from "lucide-react";
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
                        description: "Template {z}/{x}/{y} do SEU tile server → liga o Leaflet.",
                    },
                ]}
            >
                <TrajectoryDemo />
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
