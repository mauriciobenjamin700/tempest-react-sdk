import { Button, useBeforeInstallPrompt, usePushSubscription } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

/**
 * Protected page (see the `guard` in src/routes.tsx). Lazy-loaded, so it is
 * code-split into its own chunk. Default export because `lazy` expects one.
 *
 * Adds two PWA controls:
 *  - Install button (`useBeforeInstallPrompt`) — appears only when the browser
 *    offers an install prompt and the app is not yet installed.
 *  - Push toggle (`usePushSubscription`) — subscribes/unsubscribes to web push.
 *    The service worker must be active, so this works in a production build
 *    (`npm run build && npm run preview`), not in `npm run dev`.
 */
export default function Dashboard() {
    const user = useAuth.use.user();
    const install = useBeforeInstallPrompt();

    const push = usePushSubscription({
        vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "",
        onSubscribe: async (subscription) => {
            // Send the subscription to your backend so it can deliver pushes.
            // await api.post("/webpush/subscribe", { body: subscription });
            console.log("push subscription", subscription);
        },
        onUnsubscribe: async () => {
            // await api.delete("/webpush/my");
            console.log("push unsubscribed");
        },
    });

    return (
        <section>
            <h1>Dashboard</h1>
            <p>
                Signed in as <strong>{user?.name}</strong> ({user?.email}).
            </p>
            <p>This route is only reachable while authenticated.</p>

            <h2>PWA</h2>

            {install.installed ? (
                <p>✅ App installed.</p>
            ) : install.installable ? (
                <Button onClick={() => void install.prompt()}>Install app</Button>
            ) : (
                <p>Install prompt not available in this browser/context.</p>
            )}

            <h2>Notifications</h2>

            {!push.supported ? (
                <p>Web push is not supported here (needs HTTPS + an active service worker).</p>
            ) : (
                <>
                    <Button
                        onClick={() =>
                            void (push.subscribed ? push.unsubscribe() : push.subscribe())
                        }
                        disabled={push.loading}
                    >
                        {push.subscribed ? "Disable notifications" : "Enable notifications"}
                    </Button>
                    <p>
                        Permission: <strong>{push.permission}</strong> · Subscribed:{" "}
                        <strong>{String(push.subscribed)}</strong>
                    </p>
                    {push.error && <p style={{ color: "crimson" }}>{push.error.message}</p>}
                </>
            )}
        </section>
    );
}
