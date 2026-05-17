export interface TelemetryUser {
    id?: string;
    email?: string;
    name?: string;
    /** Free-form trait bag (plan, role, region, etc.). */
    traits?: Record<string, unknown>;
}

export interface TelemetryEvent {
    name: string;
    properties?: Record<string, unknown>;
}

export interface TelemetryAdapter {
    /** Optional. Called when the provider mounts. */
    init?: () => void | Promise<void>;
    /** Associate the current session with a user. */
    identify: (user: TelemetryUser | null) => void;
    /** Track a discrete event. */
    track: (event: TelemetryEvent) => void;
    /** Report an error / exception with optional context. */
    captureException: (error: unknown, context?: Record<string, unknown>) => void;
    /** Flush queued events (e.g. before page unload). */
    flush?: () => Promise<void> | void;
}
