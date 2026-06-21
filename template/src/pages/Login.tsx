import { useNavigate } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

/**
 * Demo login: fakes a session and redirects to the (guarded) dashboard. Swap
 * the fake `setSession` for a real call to `api.post("/auth/login", …)`.
 */
export function Login() {
    const navigate = useNavigate();
    const setSession = useAuth.use.setSession();

    function handleLogin() {
        setSession({
            user: { id: "1", name: "Ada Lovelace", email: "ada@example.com" },
            token: "demo-token",
        });
        navigate("/dashboard");
    }

    return (
        <section>
            <h1>Login</h1>
            <p>Sign in to reach the protected dashboard.</p>
            <button onClick={handleLogin}>Sign in (demo)</button>
        </section>
    );
}
