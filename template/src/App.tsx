import { AppProviders, AppRouter } from "tempest-react-sdk";
import { routes } from "@/routes";

/**
 * App root. `AppProviders` composes the error boundary, TanStack Query and
 * theme; `AppRouter` renders the declarative route tree with a Suspense
 * fallback for lazy routes.
 */
export function App() {
    return (
        <AppProviders errorBoundary={{ fallback: <p>Something went wrong.</p> }}>
            <AppRouter routes={routes} fallback={<p>Loading…</p>} />
        </AppProviders>
    );
}
