import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { AccessControl } from "./types";

const AccessControlContext = createContext<AccessControl | null>(null);

export interface AccessControlProviderProps {
    /** The access-control strategy made available to descendants. */
    control: AccessControl;
    children: ReactNode;
}

/**
 * Provide an {@link AccessControl} strategy to the React tree. Components such
 * as `<Can>` and the `useCan` hook read it from context.
 *
 * @example
 * ```tsx
 * <AccessControlProvider control={createRoleAccessControl({ role: "admin", roles: { admin: ["*"] } })}>
 *   <App />
 * </AccessControlProvider>
 * ```
 */
export function AccessControlProvider({ control, children }: AccessControlProviderProps) {
    return (
        <AccessControlContext.Provider value={control}>{children}</AccessControlContext.Provider>
    );
}

/**
 * Read the current {@link AccessControl} from context.
 *
 * Returns `null` when no {@link AccessControlProvider} is present. Callers MUST
 * treat the absence of a provider as **"allow all"** — i.e. when this returns
 * `null`, access checks should default to permitted. This keeps the SDK
 * opt-in: dropping in a provider adds enforcement, removing it disables it.
 */
export function useAccessControl(): AccessControl | null {
    return useContext(AccessControlContext);
}
