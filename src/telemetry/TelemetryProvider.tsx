import { createContext, useContext, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import type { TelemetryAdapter } from "./types";

const TelemetryContext = createContext<TelemetryAdapter | null>(null);

export interface TelemetryProviderProps {
    adapter: TelemetryAdapter;
    children: ReactNode;
}

/**
 * Inject a telemetry adapter into the tree. Apps can swap implementations
 * (Sentry, Datadog, PostHog, console) without touching call sites.
 */
export function TelemetryProvider({ adapter, children }: TelemetryProviderProps) {
    useEffect(() => {
        void adapter.init?.();
        return () => {
            void adapter.flush?.();
        };
    }, [adapter]);
    const value = useMemo(() => adapter, [adapter]);
    return <TelemetryContext.Provider value={value}>{children}</TelemetryContext.Provider>;
}

/**
 * Access the active telemetry adapter. Returns `null` when no provider is
 * mounted (calls are silently dropped — useful for unit tests).
 */
export function useTelemetry(): TelemetryAdapter | null {
    return useContext(TelemetryContext);
}
