// Design tokens (`--tempest-*`) + base resets. Imported here so the bundled
// `dist/styles.css` carries the tokens the component CSS modules depend on —
// consumers get a fully themed `tempest-react-sdk/styles.css` from one import.
import "./styles/index.css";

// Components
export * from "./components";

// Hooks
export * from "./hooks";

// HTTP
export * from "./http";

// Auth
export * from "./auth";

// Access control (RBAC / permissions)
export * from "./access";

// OAuth (Google sign-in wrapper, callback hook)
export * from "./oauth";

// Query
export * from "./query";

// Data provider (resource CRUD hooks)
export * from "./data";

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

// Geolocation (tile-free maps, trajectory tracking, distance/estimate math)
export * from "./geo";

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
export * from "./utils";
