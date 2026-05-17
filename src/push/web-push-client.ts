import { isPushSupported, urlBase64ToUint8Array } from "./utils";

export interface WebPushClientConfig {
    /** VAPID public key (URL-safe base64). */
    vapidPublicKey: string;
    /**
     * Persist the subscription on the backend. The SDK does not own this call —
     * the host app decides the endpoint and how the payload is serialized.
     */
    onSubscribe: (subscription: PushSubscriptionJSON) => Promise<void> | void;
    /** Remove the subscription from the backend. Called before `subscription.unsubscribe()`. */
    onUnsubscribe?: (subscription: PushSubscriptionJSON) => Promise<void> | void;
    /**
     * Override how the service worker registration is obtained.
     * Defaults to `navigator.serviceWorker.ready` — provide this only when you
     * register the SW yourself and want to reuse the registration.
     */
    getRegistration?: () => Promise<ServiceWorkerRegistration>;
}

export class WebPushUnsupportedError extends Error {
    constructor() {
        super("Web Push não suportado neste navegador.");
        this.name = "WebPushUnsupportedError";
    }
}

export class WebPushPermissionDeniedError extends Error {
    constructor() {
        super("Permissão de notificação negada pelo usuário.");
        this.name = "WebPushPermissionDeniedError";
    }
}

/**
 * Browser-side Web Push helper. Wraps `Notification.requestPermission`,
 * `pushManager.subscribe`, and the corresponding teardown. Transport is up to
 * the caller via `onSubscribe` / `onUnsubscribe` callbacks.
 */
export class WebPushClient {
    private readonly config: WebPushClientConfig;

    constructor(config: WebPushClientConfig) {
        this.config = config;
    }

    /** Whether the runtime supports the Push API. */
    static isSupported(): boolean {
        return isPushSupported();
    }

    private async registration(): Promise<ServiceWorkerRegistration> {
        if (!isPushSupported()) throw new WebPushUnsupportedError();
        return this.config.getRegistration
            ? await this.config.getRegistration()
            : await navigator.serviceWorker.ready;
    }

    /** Current `Notification.permission` value, or `"unsupported"`. */
    permission(): NotificationPermission | "unsupported" {
        if (typeof Notification === "undefined") return "unsupported";
        return Notification.permission;
    }

    /**
     * Ask the user for notification permission.
     *
     * @throws {WebPushUnsupportedError} If the runtime lacks the Notification API.
     * @returns The resulting `NotificationPermission` value.
     */
    async requestPermission(): Promise<NotificationPermission> {
        if (typeof Notification === "undefined") throw new WebPushUnsupportedError();
        return Notification.requestPermission();
    }

    /** Return the active push subscription, if any. */
    async getSubscription(): Promise<PushSubscription | null> {
        const registration = await this.registration();
        return registration.pushManager.getSubscription();
    }

    /** True when a subscription already exists for this browser. */
    async isSubscribed(): Promise<boolean> {
        if (!isPushSupported()) return false;
        const existing = await this.getSubscription();
        return existing !== null;
    }

    /**
     * Subscribe the current device. Requests permission, creates a push
     * subscription if none exists, and forwards the JSON payload to
     * `onSubscribe` for backend persistence.
     *
     * @returns The active `PushSubscription`.
     * @throws {WebPushUnsupportedError} If Web Push is unavailable.
     * @throws {WebPushPermissionDeniedError} If the user denies the prompt.
     */
    async subscribe(): Promise<PushSubscription> {
        const permission = await this.requestPermission();
        if (permission !== "granted") throw new WebPushPermissionDeniedError();

        const registration = await this.registration();
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
            await this.config.onSubscribe(existing.toJSON());
            return existing;
        }

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(this.config.vapidPublicKey),
        });
        await this.config.onSubscribe(subscription.toJSON());
        return subscription;
    }

    /**
     * Cancel the current subscription. Calls `onUnsubscribe` first (so the
     * backend can purge the record) and then `subscription.unsubscribe()`.
     *
     * @returns True when an active subscription was removed, false otherwise.
     */
    async unsubscribe(): Promise<boolean> {
        const subscription = await this.getSubscription();
        if (!subscription) return false;
        if (this.config.onUnsubscribe) {
            await this.config.onUnsubscribe(subscription.toJSON());
        }
        return subscription.unsubscribe();
    }
}
