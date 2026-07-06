import type { FittedProjection } from "@/geo/projection";
import type { GeoMarker } from "@/geo/types";
import styles from "./BrazilMap.module.css";

export interface MapMarkersProps {
    /** Projection used by the host map (markers must share it to line up). */
    projection: FittedProjection;
    /** Pins to plot. */
    markers: readonly GeoMarker[];
    /** Fired when a marker is clicked. */
    onMarkerClick?: (marker: GeoMarker, index: number) => void;
}

/**
 * SVG overlay of point markers, projected with the host map's projection so
 * they align with its shapes. Each marker carries a native `<title>` (its
 * `label`) and is clickable when `onMarkerClick` is set.
 */
export function MapMarkers({ projection, markers, onMarkerClick }: MapMarkersProps) {
    return (
        <g className={styles.markers}>
            {markers.map((marker, index) => {
                const p = projection.project(marker);
                const interactive = Boolean(onMarkerClick);
                return (
                    <circle
                        key={marker.id ?? index}
                        className={styles.marker}
                        cx={p.x}
                        cy={p.y}
                        r={marker.radius ?? 6}
                        fill={marker.color ?? "var(--tempest-primary)"}
                        data-marker-id={marker.id ?? index}
                        tabIndex={interactive ? 0 : undefined}
                        role={interactive ? "button" : undefined}
                        aria-label={marker.label}
                        onClick={interactive ? () => onMarkerClick?.(marker, index) : undefined}
                        onKeyDown={
                            interactive
                                ? (e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          onMarkerClick?.(marker, index);
                                      }
                                  }
                                : undefined
                        }
                    >
                        {marker.label ? <title>{marker.label}</title> : null}
                    </circle>
                );
            })}
        </g>
    );
}
