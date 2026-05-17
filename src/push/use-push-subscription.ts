import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WebPushClient, type WebPushClientConfig } from "./web-push-client";
import { isPushSupported } from "./utils";

export interface UsePushSubscriptionResult {
    /** True when the browser exposes the Push + Notification APIs. */
    supported: boolean;
    /** Current `Notification.permission` value, or `"unsupported"`. */
    permission: NotificationPermission | "unsupported";
    /** True when a subscription is active on this device. */
    subscribed: boolean;
    /** True while a subscribe/unsubscribe call is in-flight. */
    loading: boolean;
    /** Last error thrown by subscribe/unsubscribe, if any. */
    error: Error | null;
    subscribe: () => Promise<void>;
    unsubscribe: () => Promise<void>;
    /** Re-read the current subscription/permission state from the browser. */
    refresh: () => Promise<void>;
}

/**
 * React hook around {@link WebPushClient}. Tracks subscription, permission and
 * loading state; exposes imperative `subscribe`/`unsubscribe` actions.
 *
 * The hook does NOT register the service worker — the host app must do that
 * (e.g. via `vite-plugin-pwa` or a manual `navigator.serviceWorker.register`).
 *
 * @example
 * const push = usePushSubscription({
 *     vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
 *     onSubscribe: (sub) => api.post("/webpush/subscribe", { body: sub }),
 *     onUnsubscribe: () => api.delete("/webpush/my"),
 * });
 */
export function usePushSubscription(config: WebPushClientConfig): UsePushSubscriptionResult {
    const configRef = useRef(config);
    configRef.current = config;

    const client = useMemo(
        () =>
            new WebPushClient({
                vapidPublicKey: config.vapidPublicKey,
                onSubscribe: (sub) => configRef.current.onSubscribe(sub),
                onUnsubscribe: (sub) => configRef.current.onUnsubscribe?.(sub),
                getRegistration: config.getRegistration,
            }),
        [config.vapidPublicKey, config.getRegistration],
    );

    const [supported] = useState<boolean>(() => isPushSupported());
    const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
        client.permission(),
    );
    const [subscribed, setSubscribed] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<Error | null>(null);

    const refresh = useCallback(async () => {
        if (!supported) return;
        setPermission(client.permission());
        try {
            const active = await client.isSubscribed();
            setSubscribed(active);
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
        }
    }, [client, supported]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const subscribe = useCallback(async () => {
        if (!supported) return;
        setLoading(true);
        setError(null);
        try {
            await client.subscribe();
            setSubscribed(true);
            setPermission(client.permission());
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
            throw err;
        } finally {
            setLoading(false);
        }
    }, [client, supported]);

    const unsubscribe = useCallback(async () => {
        if (!supported) return;
        setLoading(true);
        setError(null);
        try {
            await client.unsubscribe();
            setSubscribed(false);
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
            throw err;
        } finally {
            setLoading(false);
        }
    }, [client, supported]);

    return {
        supported,
        permission,
        subscribed,
        loading,
        error,
        subscribe,
        unsubscribe,
        refresh,
    };
}
