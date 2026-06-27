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

// Register the service worker in both dev and prod. In production it's the
// bundled `/sw.js` (built by `vite.sw.config.ts`); in dev the `tempestPwaDevSw`
// plugin (in `vite.config.ts`) compiles and serves it on the fly, so push and
// runtime caching work under `npm run dev` too. Drop the `tempestPwaDevSw`
// plugin if you'd rather keep dev SW-free.
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
