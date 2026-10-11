import { isPushSupported, urlBase64ToUint8Array } from "./utils";

export interface WebPushClientConfig {
    /** VAPID public key (URL-safe base64). */
    vapidPublicKey: string;
    /**
     * Persist the subscription on the backend. The SDK does not own this call —
     * the host app decides the endpoint and how the payload is serialized.
     */
    onSubscribe: (subscription: PushSubscriptionJSON) => Promise<void> | void;
    /**
     * Remove the subscription from the backend. Called before
     * `subscription.unsubscribe()`, with the subscription's JSON — key the
     * delete by its `endpoint`. A rejection no longer keeps the browser
     * subscribed: see {@link WebPushClient.unsubscribe}.
     */
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
 * Thrown by {@link WebPushClient.unsubscribe} when `onUnsubscribe` failed. The
 * browser subscription was still released — `browserUnsubscribed` says whether
 * the browser confirmed it — so the only thing left behind is the backend row.
 *
 * Carries the `subscription` JSON so the app can retry the delete by
 * `endpoint` later; if it never does, the push service answers the next send
 * to that endpoint with `404`/`410`, which is the backend's cue to drop the row.
 */
export class WebPushUnsubscribeError extends Error {
    /** The subscription whose backend delete failed. */
    readonly subscription: PushSubscriptionJSON;
    /** Whether `PushSubscription.unsubscribe()` reported success. */
    readonly browserUnsubscribed: boolean;

    /**
     * @param subscription - The subscription whose backend delete failed.
     * @param browserUnsubscribed - What `PushSubscription.unsubscribe()` returned.
     * @param cause - What `onUnsubscribe` threw.
     */
    constructor(subscription: PushSubscriptionJSON, browserUnsubscribed: boolean, cause: unknown) {
        super("Falha ao remover a inscrição de push no backend.", { cause });
        this.name = "WebPushUnsubscribeError";
        this.subscription = subscription;
        this.browserUnsubscribed = browserUnsubscribed;
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
     * Cancel the current subscription: `onUnsubscribe` first, so the backend
     * can purge the record while the endpoint is known, then
     * `subscription.unsubscribe()` — **always**, even when `onUnsubscribe`
     * failed.
     *
     * Why the browser is released anyway: the two failure modes are not
     * symmetric. A backend row left behind costs one send to a dead endpoint,
     * which the push service answers with `404`/`410` and the backend deletes.
     * A browser subscription left behind keeps delivering this account's
     * notifications to whoever uses the browser next — and the backend call
     * fails precisely when that matters, at the end of a session, when the
     * token that authenticates it is already gone. Before 0.77.0 a rejected
     * `onUnsubscribe` aborted here and the browser stayed subscribed (#445).
     * The endpoint is not lost either way: it is read before both calls and
     * travels in the error.
     *
     * @returns True when an active subscription was removed, false when there
     *   was none or the browser refused.
     * @throws {WebPushUnsubscribeError} When `onUnsubscribe` failed — thrown
     *   after the browser subscription was released.
     */
    async unsubscribe(): Promise<boolean> {
        const subscription = await this.getSubscription();
        if (!subscription) return false;
        const json = subscription.toJSON();
        let backendError: { cause: unknown } | null = null;
        if (this.config.onUnsubscribe) {
            try {
                await this.config.onUnsubscribe(json);
            } catch (cause) {
                backendError = { cause };
            }
        }
        const released = await subscription.unsubscribe();
        if (backendError) throw new WebPushUnsubscribeError(json, released, backendError.cause);
        return released;
    }
}
