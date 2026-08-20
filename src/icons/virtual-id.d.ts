/**
 * Types for the legacy `virtual:tempest-icons` module id.
 *
 * Kept for apps that already import that spelling. New code should import
 * `tempest-react-sdk/icons/virtual` instead, which is a real module in the
 * package: it needs no ambient declaration, and it resolves outside a Vite build
 * with the plugin — to an empty registry — rather than failing to resolve at all.
 *
 * Reaching this declaration takes no setup: `dist/icons.d.ts` and
 * `dist/icons-virtual.d.ts` both reference it, so importing anything from
 * `tempest-react-sdk/icons` is enough.
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
