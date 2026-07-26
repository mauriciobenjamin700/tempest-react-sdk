import { createContext, useContext } from "react";
import type { LucideIcon } from "lucide-react";

/** A slug → icon-component table, as produced by `createIconRegistry`. */
export type IconRegistry = Readonly<Record<string, LucideIcon>>;

export interface IconContextValue {
    registry: IconRegistry;
    size: number | string | undefined;
    strokeWidth: number | undefined;
}

/**
 * The icon context.
 *
 * Lives here rather than next to `IconProvider` so that the provider module
 * exports only a component — a file mixing components with other values breaks
 * Fast Refresh, which is what `react-refresh/only-export-components` guards.
 */
export const IconContext = createContext<IconContextValue | null>(null);

/**
 * Build an icon registry from statically imported lucide components.
 *
 * The point is that the imports are static, so the bundler keeps exactly the
 * icons named here and tree-shakes the rest — the opposite of `DynamicIcon`,
 * which forces a chunk boundary for all ~2000 icons whether you use them or not.
 *
 * @example
 * import { createIconRegistry } from "tempest-react-sdk/icons";
 * import { Save, Trash2 } from "lucide-react";
 *
 * export const icons = createIconRegistry({ save: Save, "trash-2": Trash2 });
 *
 * @param icons - Slug → icon component.
 * @returns The registry, ready for `IconProvider`.
 */
export function createIconRegistry(icons: Record<string, LucideIcon>): IconRegistry {
    return icons;
}

/**
 * Read the nearest icon context, or `null` outside a provider.
 *
 * @returns The context value, or `null`.
 */
export function useIconContext(): IconContextValue | null {
    return useContext(IconContext);
}
