// Components
export * from "./components";

// Hooks
export * from "./hooks";

// HTTP
export * from "./http";

// Auth
export * from "./auth";

// OAuth (Google sign-in wrapper, callback hook)
export * from "./oauth";

// Query
export * from "./query";

// Router (React Router v7, declarative mode)
export * from "./router";

// State stores (Zustand factories)
export * from "./store";

// App-wide provider composition
export * from "./app";

// SSE
export * from "./sse";

// Web Push
export * from "./push";

// Service Worker helpers
export * from "./sw";

// Audio
export * from "./audio";

// Offline (IndexedDB via Dexie — optional peer dep)
export * from "./offline";

// Error Boundary
export * from "./error-boundary";

// Forms (zod-based)
export * from "./forms";

// WebSocket
export * from "./ws";

// Theme
export * from "./theme";

// i18n
export * from "./i18n";

// Logger
export * from "./logger";

// Telemetry
export * from "./telemetry";

// Feature Flags
export * from "./feature-flags";

// Web Share
export * from "./share";

// Utils
export { cn } from "./utils/cn";
export {
    formatCurrency,
    formatDate,
    formatDateTime,
    formatPhone,
    formatCPF,
    formatPercent,
} from "./utils/format";
export { storage } from "./utils/storage";
export { slugify, truncate } from "./utils/strings";
export { clamp } from "./utils/numbers";
export { relativeTime } from "./utils/relative-time";
export type { RelativeTimeLocale } from "./utils/relative-time";
