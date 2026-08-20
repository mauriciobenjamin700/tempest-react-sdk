import type { IconRegistry } from "./icon-context";

/**
 * The static icon registry, empty until a build plugin fills it in.
 *
 * `tempestIcons()` resolves this module id to the table it generated from the
 * slugs your source mentions. Every other runner — vitest without the plugin,
 * `tsx`, a Storybook builder, a Node script that imports a component — gets this
 * stub, so the import always resolves and `<Icon>` falls back to fetching shards.
 *
 * That fallback is why the stub exists: before it, an app that imported the
 * registry could not be loaded outside a Vite build with the plugin installed,
 * and the failure was the whole module graph refusing to resolve rather than one
 * icon going missing.
 *
 * @example
 * import { IconProvider } from "tempest-react-sdk/icons";
 * import { staticIcons } from "tempest-react-sdk/icons/virtual";
 *
 * <IconProvider registry={staticIcons}>
 *     <App />
 * </IconProvider>
 */
export const staticIcons: IconRegistry = {};
