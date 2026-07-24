import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "tempest-react-sdk/styles.css";
import { App } from "@/App";
import { PwaShell } from "@/pwa";

/**
 * PWA entrypoint. `<PwaShell>` registers the service worker (the bundled
 * `/sw.js` in production, the `tempestPwaDevSw` plugin under `npm run dev`) and
 * layers the update prompt, offline indicator, persistent-storage request and
 * periodic background sync on top of the base app. Swap it for a bare `<App />`
 * to opt out of any of that.
 */
createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <PwaShell>
            <App />
        </PwaShell>
    </StrictMode>,
);
