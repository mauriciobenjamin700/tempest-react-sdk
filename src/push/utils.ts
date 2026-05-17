/**
 * Convert a base64url-encoded VAPID public key into the `Uint8Array` format
 * required by `PushManager.subscribe({ applicationServerKey })`.
 *
 * @param base64String - VAPID public key (URL-safe base64).
 * @returns The decoded key as bytes.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const buffer = new ArrayBuffer(rawData.length);
    const output = new Uint8Array(buffer);
    for (let i = 0; i < rawData.length; i++) {
        output[i] = rawData.charCodeAt(i);
    }
    return output;
}

/**
 * Convenience check for environments where the Push API is unavailable
 * (Safari iOS without PWA install, older browsers, SSR, etc.).
 */
export function isPushSupported(): boolean {
    return (
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window
    );
}
