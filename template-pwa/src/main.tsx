import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerServiceWorker, skipWaiting } from "tempest-react-sdk";
import "tempest-react-sdk/styles.css";
import { App } from "@/App";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);

// The service worker is bundled to `/sw.js` at build time, so it only exists in
// production. In dev we proactively unregister any leftover worker to avoid a
// stale cache shadowing your `npm run dev` output.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
    void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch((err) => console.warn("[sw] dev cleanup failed", err));
}

if (import.meta.env.PROD) {
    void registerServiceWorker({
        url: "/sw.js",
        onUpdate: (waiting) => {
            // A new worker is ready. Prompt your users however you like; here we
            // just activate it and reload so the next visit is up to date.
            if (confirm("Nova versão disponível. Atualizar agora?")) {
                skipWaiting(waiting);
                window.location.reload();
            }
        },
        onError: (err) => console.warn("[sw] registration failed", err),
    });
}
