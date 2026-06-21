import { Link, Outlet } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

/** App shell: nav bar + routed content via `<Outlet />`. */
export function RootLayout() {
    const isAuthenticated = useAuth.use.isAuthenticated();
    const logout = useAuth.use.logout();

    return (
        <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "0 auto", padding: 24 }}>
            <header style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 24 }}>
                <strong>Tempest App</strong>
                <nav style={{ display: "flex", gap: 12 }}>
                    <Link to="/">Home</Link>
                    <Link to="/dashboard">Dashboard</Link>
                    {isAuthenticated ? (
                        <button onClick={logout}>Logout</button>
                    ) : (
                        <Link to="/login">Login</Link>
                    )}
                </nav>
            </header>
            <main>
                <Outlet />
            </main>
        </div>
    );
}
