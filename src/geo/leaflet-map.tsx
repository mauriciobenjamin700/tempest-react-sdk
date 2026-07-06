import { useEffect, useRef, useState } from "react";
import { boundingBox } from "./bounds";
import type { Coordinate } from "./types";

/**
 * Minimal structural typing for the slice of the Leaflet API this layer uses.
 * Declared locally so the SDK type-checks and builds even when `leaflet` (an
 * optional peer) is not installed — the real module is loaded at runtime.
 */
interface LeafletMapInstance {
    setView: (center: [number, number], zoom: number) => LeafletMapInstance;
    fitBounds: (bounds: [[number, number], [number, number]], options?: unknown) => void;
    remove: () => void;
}
interface LeafletLayer {
    addTo: (map: LeafletMapInstance) => LeafletLayer;
}
interface LeafletModule {
    map: (el: HTMLElement, options?: unknown) => LeafletMapInstance;
    tileLayer: (url: string, options?: unknown) => LeafletLayer;
    polyline: (latlngs: [number, number][], options?: unknown) => LeafletLayer;
    circleMarker: (latlng: [number, number], options?: unknown) => LeafletLayer;
}

export interface LeafletTrajectoryProps {
    points: readonly Coordinate[];
    current?: Coordinate | null;
    tileUrl: string;
    tileAttribution?: string;
    strokeColor?: string;
}

/**
 * Leaflet-backed tile layer for {@link TrajectoryMap}. Loaded lazily and only
 * when a `tileUrl` is provided. Requires `leaflet` to be installed by the app
 * (optional peer dependency) plus its stylesheet imported once:
 * `import "leaflet/dist/leaflet.css"`.
 */
export function LeafletTrajectory({
    points,
    current,
    tileUrl,
    tileAttribution,
    strokeColor,
}: LeafletTrajectoryProps) {
    const nodeRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let map: LeafletMapInstance | null = null;
        let cancelled = false;

        const specifier = "leaflet";
        import(/* @vite-ignore */ specifier)
            .then((mod: { default?: LeafletModule } & LeafletModule) => {
                if (cancelled || !nodeRef.current) return;
                const L: LeafletModule = mod.default ?? mod;

                map = L.map(nodeRef.current, { attributionControl: true });
                L.tileLayer(tileUrl, {
                    attribution: tileAttribution ?? "",
                    maxZoom: 19,
                }).addTo(map);

                const latlngs = points.map((p): [number, number] => [p.latitude, p.longitude]);
                if (latlngs.length > 0) {
                    L.polyline(latlngs, {
                        color: strokeColor ?? "#2563eb",
                        weight: 4,
                    }).addTo(map);
                    L.circleMarker(latlngs[0], { radius: 6, color: "#16a34a" }).addTo(map);
                }

                const marker = current ?? points[points.length - 1];
                if (marker) {
                    L.circleMarker([marker.latitude, marker.longitude], {
                        radius: 6,
                        color: strokeColor ?? "#2563eb",
                    }).addTo(map);
                }

                const box = boundingBox(current ? [...points, current] : [...points]);
                if (box) {
                    map.fitBounds(
                        [
                            [box.minLatitude, box.minLongitude],
                            [box.maxLatitude, box.maxLongitude],
                        ],
                        { padding: [24, 24] },
                    );
                } else {
                    map.setView([0, 0], 2);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setError(
                        "Leaflet não encontrado. Instale `leaflet` para usar tiles, ou remova `tileUrl` para o plot SVG.",
                    );
                }
            });

        return () => {
            cancelled = true;
            map?.remove();
        };
    }, [points, current, tileUrl, tileAttribution, strokeColor]);

    if (error) {
        return (
            <div style={{ padding: 16, fontSize: 13, color: "var(--tempest-danger-fg)" }}>
                {error}
            </div>
        );
    }

    return <div ref={nodeRef} style={{ width: "100%", height: "100%" }} />;
}
