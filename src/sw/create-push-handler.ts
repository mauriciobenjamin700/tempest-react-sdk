/**
 * Service-worker context helpers for handling `push` and `notificationclick`
 * events. Import these inside your own `sw.ts` — they expect to run in the
 * service-worker global scope, not in the main thread.
 *
 * @example
 *   /// <reference lib="webworker" />
 *   import { installPushHandler, installNotificationClickHandler } from "tempest-react-sdk";
 *
 *   installPushHandler({ defaultIcon: "/icons/Logo.png" });
 *   installNotificationClickHandler();
 */

interface SwGlobal {
    registration: {
        showNotification(title: string, options?: NotificationOptions): Promise<void>;
    };
    clients: {
        matchAll(options: { type: "window"; includeUncontrolled?: boolean }): Promise<
            {
                url: string;
                focused: boolean;
                focus(): Promise<unknown>;
                navigate(url: string): Promise<unknown>;
            }[]
        >;
        openWindow(url: string): Promise<unknown>;
    };
    addEventListener(
        type: "push",
        listener: (event: {
            data: { json(): unknown; text(): string } | null;
            waitUntil(promise: Promise<unknown>): void;
        }) => void,
    ): void;
    addEventListener(
        type: "notificationclick",
        listener: (event: {
            notification: { close(): void; data?: unknown };
            waitUntil(promise: Promise<unknown>): void;
        }) => void,
    ): void;
    skipWaiting(): Promise<void>;
}

function getSwScope(): SwGlobal {
    return globalThis as unknown as SwGlobal;
}

export interface PushPayload {
    title?: string;
    body?: string;
    icon?: string;
    badge?: string;
    image?: string;
    tag?: string;
    url?: string;
    /** Arbitrary extra data forwarded to `event.notification.data`. */
    data?: Record<string, unknown>;
}

export interface InstallPushHandlerOptions {
    /** Title used when the payload omits one. */
    defaultTitle?: string;
    /** Icon used when the payload omits one. */
    defaultIcon?: string;
    /** Badge image (mobile). */
    defaultBadge?: string;
    /**
     * Transform the raw payload before showing the notification. Return `null`
     * to suppress the notification entirely (e.g. silent pings).
     */
    transform?: (payload: PushPayload) => PushPayload | null;
}

/**
 * Install a `push` event listener that parses the payload as JSON (with a
 * plain-text fallback) and shows a notification.
 */
export function installPushHandler(options: InstallPushHandlerOptions = {}): void {
    const sw = getSwScope();
    const { defaultTitle = "Notificação", defaultIcon, defaultBadge, transform } = options;

    sw.addEventListener("push", (event) => {
        if (!event.data) return;

        let raw: PushPayload;
        try {
            raw = event.data.json() as PushPayload;
        } catch {
            raw = { title: defaultTitle, body: event.data.text() };
        }

        const payload = transform ? transform(raw) : raw;
        if (!payload) return;

        const title = payload.title ?? defaultTitle;
        const notification: NotificationOptions & { image?: string } = {
            body: payload.body,
            icon: payload.icon ?? defaultIcon,
            badge: payload.badge ?? defaultBadge,
            image: payload.image,
            tag: payload.tag,
            data: { url: payload.url ?? "/", ...(payload.data ?? {}) },
        };

        event.waitUntil(sw.registration.showNotification(title, notification));
    });
}

export interface InstallNotificationClickHandlerOptions {
    /** Resolve the destination URL from the notification data. Default: `data.url`. */
    resolveUrl?: (data: unknown) => string;
}

/**
 * Install a `notificationclick` handler that focuses an existing client when
 * possible and falls back to opening a new window.
 */
export function installNotificationClickHandler(
    options: InstallNotificationClickHandlerOptions = {},
): void {
    const sw = getSwScope();
    const resolveUrl =
        options.resolveUrl ??
        ((data: unknown) => {
            if (typeof data === "string") return data;
            if (data && typeof data === "object" && "url" in data) {
                const url = (data as Record<string, unknown>).url;
                return typeof url === "string" ? url : "/";
            }
            return "/";
        });

    sw.addEventListener("notificationclick", (event) => {
        event.notification.close();
        const target = resolveUrl(event.notification.data);

        event.waitUntil(
            (async () => {
                const clients = await sw.clients.matchAll({
                    type: "window",
                    includeUncontrolled: true,
                });
                for (const client of clients) {
                    if (client.url.includes(target)) {
                        return client.focus();
                    }
                }
                return sw.clients.openWindow(target);
            })(),
        );
    });
}

/**
 * Install a `message` listener that activates a waiting worker when the host
 * app sends `{ type: "SKIP_WAITING" }`.
 */
export function installSkipWaitingListener(): void {
    const sw = getSwScope() as SwGlobal & {
        addEventListener(
            type: "message",
            listener: (event: { data?: { type?: string } }) => void,
        ): void;
    };
    sw.addEventListener("message", (event) => {
        if (event.data?.type === "SKIP_WAITING") {
            void sw.skipWaiting();
        }
    });
}
