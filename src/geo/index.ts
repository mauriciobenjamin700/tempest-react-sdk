// Types + validators
export type { Coordinate, TrackPoint, TravelMode, TravelEstimate, GeoBounds } from "./types";
export {
    isValidLatitude,
    isValidLongitude,
    isCoordinate,
    clampLatitude,
    normalizeLongitude,
} from "./types";

// Distance / trajectory math
export { EARTH_RADIUS_KM, toRadians, haversineKm, pathLengthKm, bearingDeg } from "./distance";

// Offline travel estimate
export {
    DEFAULT_CIRCUITY_FACTOR,
    DEFAULT_CAR_SPEED_KMH,
    DEFAULT_MODE_DURATION_FACTORS,
    durationFactor,
    estimateTravel,
} from "./estimate";
export type { EstimateTravelOptions } from "./estimate";

// Bounding box helpers
export { boundingBox, boundsCenter, expandBounds } from "./bounds";

// Web Mercator projection (tile-free plotting core)
export {
    MERCATOR_MAX_LATITUDE,
    projectMercator,
    unprojectMercator,
    fitProjection,
} from "./projection";
export type {
    MercatorPoint,
    PixelPoint,
    FittedProjection,
    FitProjectionOptions,
} from "./projection";

// Pluggable routing backend (opt-in, self-hosted OSRM)
export { createOSRMBackend } from "./routing";
export type { RoutingBackend, OSRMBackendOptions } from "./routing";

// Live GPS trajectory tracker
export { createPositionTracker } from "./create-position-tracker";
export type {
    CreatePositionTrackerOptions,
    PositionTracker,
    TrackerStatus,
} from "./create-position-tracker";
export { usePositionTracker } from "./use-position-tracker";
export type { UsePositionTrackerOptions, UsePositionTrackerResult } from "./use-position-tracker";

// Trajectory map component (tile-free SVG + optional Leaflet tiles)
export { TrajectoryMap } from "./TrajectoryMap";
export type { TrajectoryMapProps } from "./TrajectoryMap";
