/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Base URL of the backend API (src/lib/api.ts). */
    readonly VITE_API_URL?: string;
    /** VAPID public key for web push (src/pages/Dashboard.tsx). */
    readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
