// Types + validators
export type {
    Coordinate,
    GeoMarker,
    TrackPoint,
    TravelMode,
    TravelEstimate,
    GeoBounds,
} from "./types";
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
    estimateTravel,
} from "./estimate";
export type { EstimateTravelOptions } from "./estimate";

// Bounding box helpers
export { boundingBox, boundsCenter, expandBounds } from "./bounds";

// Web Mercator projection (tile-free plotting core)
export { projectMercator, unprojectMercator, fitProjection } from "./projection";
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

// Live trip map (route + trail + vehicle + markers with content, follow)
export { LiveRouteMap } from "./LiveRouteMap";
export type {
    LiveRouteMapProps,
    LiveRouteMarker,
    LiveRouteMarkerKind,
    LiveVehicle,
} from "./LiveRouteMap";
export { LiveRouteMapLegend } from "./LiveRouteMapLegend";
export type {
    LiveRouteLegendItem,
    LiveRouteLegendSymbol,
    LiveRouteMapLegendProps,
} from "./LiveRouteMapLegend";

// Road network + HMM map-matching (pure, data-source agnostic)
export { createRoadGraph } from "./road-graph";
export type { CreateRoadGraphInput, RoadEdge, RoadGraph } from "./road-graph";
export {
    matchToRoads,
    createRoadMatcher,
    ROAD_MATCH_DEFAULTS,
    ROAD_MATCHER_DEFAULT_LAG,
} from "./map-matching";
export type {
    MatchToRoadsOptions,
    CreateRoadMatcherOptions,
    MatchedFix,
    MatchedRoute,
    RoadTraversal,
    RoadMatchResult,
    RoadMatcher,
    RoadMatcherUpdate,
    CommittedMatch,
    RoadFix,
} from "./map-matching";
