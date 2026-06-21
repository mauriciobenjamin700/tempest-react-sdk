import { useAuth } from "@/stores/auth";

/**
 * Protected page (see the `guard` in src/routes.tsx). Lazy-loaded, so it is
 * code-split into its own chunk. Default export because `lazy` expects one.
 */
export default function Dashboard() {
    const user = useAuth.use.user();

    return (
        <section>
            <h1>Dashboard</h1>
            <p>
                Signed in as <strong>{user?.name}</strong> ({user?.email}).
            </p>
            <p>This route is only reachable while authenticated.</p>
        </section>
    );
}
