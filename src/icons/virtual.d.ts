/**
 * Types for the module the `tempestIcons()` Vite plugin generates.
 *
 * Reference it once from an app's `vite-env.d.ts` (or any ambient `.d.ts`):
 *
 *     /// <reference types="tempest-react-sdk/icons/virtual" />
 *
 * Without it, `import { staticIcons } from "virtual:tempest-icons"` is an
 * unresolved module to `tsc`, even though Vite resolves it at build time.
 */
declare module "virtual:tempest-icons" {
    import type { LucideIcon } from "lucide-react";

    /**
     * Every icon slug found as a literal in the scanned source, mapped to the
     * statically imported lucide component.
     *
     * Pass it to `IconProvider`'s `registry` prop. Slugs resolved from here cost
     * no extra request — they are ordinary imports the bundler tree-shakes.
     */
    export const staticIcons: Record<string, LucideIcon>;
}
