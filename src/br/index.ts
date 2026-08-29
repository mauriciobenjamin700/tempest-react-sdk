// Brazilian locations data (states + cities) — mirrors the `utils/locations`
// module of tempest-fastapi-sdk.
export {
    listStates,
    getState,
    citiesByUf,
    statesByRegion,
    isValidUf,
    normalizeUf,
    isValidCity,
    ufChoices,
    cityChoices,
    municipalitiesByUf,
    administrativeRegionsByUf,
    resolveMunicipality,
    datasetVintage,
    pendingGeometryIds,
} from "./locations";
export type {
    UF,
    BrRegion,
    BrazilState,
    BrazilMunicipality,
    BrazilAdministrativeRegion,
    Choice,
} from "./locations";

// UF GeoJSON types (the geometry itself is lazy-loaded by BrazilMap).
import type { BrUfFeatureCollection } from "./br-geo";
export type { BrUfFeature, BrUfFeatureCollection, BrUfGeometry, Ring } from "./br-geo";

/**
 * Lazily load the bundled simplified UF GeoJSON (~36 KB gzip). Kept out of the
 * synchronous barrel so a data-only import never pulls the geometry.
 */
export async function loadBrUfGeoJson(): Promise<BrUfFeatureCollection> {
    const mod = await import("./br-geo");
    return mod.BR_UF_GEOJSON;
}

// Per-state municipality geometry (lazy, one chunk per UF).
export { loadStateMunicipalities } from "./state-geo";
export type { MunicipalityFeature, StateMunicipalities } from "./state-geo";

// Offline geocoding (lazy centroid index).
export {
    nearestMunicipality,
    reverseGeocode,
    geocodeMunicipality,
    searchMunicipalities,
    municipalityCentroid,
    stateCentroid,
} from "./geocode";
export type { MunicipalityCentroid, NearestMunicipality, ReverseGeocodeResult } from "./geocode";

// Components
export { BrazilMap } from "./BrazilMap";
export type { BrazilMapProps, BrazilMapTooltipData } from "./BrazilMap";
export { BrazilStateMap } from "./BrazilStateMap";
export type {
    BrazilStateMapProps,
    BrazilStateMapTooltipData,
    Municipality,
} from "./BrazilStateMap";
export { BrazilStateCitySelect } from "./BrazilStateCitySelect";
export type { BrazilStateCitySelectProps, BrazilStateCitySelection } from "./BrazilStateCitySelect";
export { MunicipalitySearch } from "./MunicipalitySearch";
export type { MunicipalitySearchProps } from "./MunicipalitySearch";
export type { GeoMarker } from "@/geo/types";
export type { MapMarkersProps } from "./MapMarkers";
export { MapLegend } from "./MapLegend";
export type { MapLegendProps, LegendItem } from "./MapLegend";

// Pix — BR Code (EMV MPM) payload + the QR that carries it.
export {
    normalizePixKey,
    parsePixPayload,
    PixError,
    pixCrc16,
    pixKeyType,
    pixPayload,
} from "./pix";
export type {
    NormalizedPixKey,
    ParsePixOptions,
    PixData,
    PixDynamicInput,
    PixField,
    PixInput,
    PixKeyType,
    PixStaticInput,
} from "./pix";
export { PixQRCode } from "./PixQRCode";
export type { PixQRCodeLabels, PixQRCodeProps } from "./PixQRCode";

// Boleto — 47/48-digit typed line, 44-digit barcode, FEBRABAN check digits.
export {
    boletoDueDate,
    BoletoError,
    boletoKind,
    codigoBarrasToLinhaDigitavel,
    fatorVencimento,
    formatLinhaDigitavel,
    linhaDigitavelToCodigoBarras,
    mod10Dac,
    mod11DacArrecadacao,
    mod11DacCobranca,
    parseCodigoBarras,
    parseLinhaDigitavel,
    validateBoleto,
} from "./boleto";
export type {
    Boleto,
    BoletoArrecadacao,
    BoletoBanco,
    BoletoEpoch,
    BoletoKind,
    BoletoOptions,
} from "./boleto";

// NF-e / NFC-e / CT-e access key.
export {
    chaveNFeCheckDigit,
    ChaveNFeError,
    formatChaveNFe,
    parseChaveNFe,
    validateChaveNFe,
} from "./nfe";
export type { ChaveNFe } from "./nfe";

// National holidays + business-day arithmetic.
export {
    addBusinessDays,
    easterSunday,
    holidaysFor,
    isBusinessDay,
    isHoliday,
    nextBusinessDay,
} from "./holidays";
export type { BusinessDayOptions, DateInput, Holiday, HolidayKind } from "./holidays";

// Color scales + palettes for choropleths.
export {
    sequentialScale,
    quantizeScale,
    thresholdScale,
    SEQUENTIAL_BLUES,
    SEQUENTIAL_GREENS,
    SEQUENTIAL_VIRIDIS,
    DIVERGING_RDBU,
} from "./scales";
export type { ColorScale } from "./scales";
export { REGION_COLORS, regionLegendItems } from "./regions";
