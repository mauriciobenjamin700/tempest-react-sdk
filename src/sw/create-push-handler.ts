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
            action?: string;
            waitUntil(promise: Promise<unknown>): void;
        }) => void,
    ): void;
    skipWaiting(): Promise<void>;
}

function getSwScope(): SwGlobal {
    return globalThis as unknown as SwGlobal;
}

/**
 * A notification button as the push payload describes it.
 *
 * `action`, `title` and `icon` are forwarded to the browser as a
 * `NotificationAction`. `url` is not part of that type — the browser would drop
 * it — so {@link installPushHandler} moves it into `data.actionUrls`, where
 * {@link installNotificationClickHandler} reads it back when that button is
 * clicked.
 */
export interface PushNotificationAction {
    /** Identifier delivered as `event.action` when the button is clicked. */
    action: string;
    /** Button label. */
    title: string;
    /** Button icon URL. */
    icon?: string;
    /** URL opened when this button is clicked. Falls back to the top-level `url`. */
    url?: string;
}

export interface PushPayload {
    title?: string;
    body?: string;
    icon?: string;
    badge?: string;
    image?: string;
    tag?: string;
    /** URL opened when the notification body is clicked. Default: `"/"`. */
    url?: string;
    /** Buttons rendered on the notification (browsers show up to `Notification.maxActions`). */
    actions?: PushNotificationAction[];
    /** Keep the notification on screen until the user interacts with it. */
    requireInteraction?: boolean;
    /** Vibration pattern in milliseconds (mobile). */
    vibrate?: number | number[];
    /** Show the notification without sound or vibration. */
    silent?: boolean;
    /** Alert again when a notification with the same `tag` replaces an older one. */
    renotify?: boolean;
    /** Event time in epoch milliseconds, shown by some platforms. */
    timestamp?: number;
    /** Text direction of the title and body. */
    dir?: NotificationDirection;
    /** BCP 47 language tag of the title and body. */
    lang?: string;
    /** Arbitrary extra data forwarded to `event.notification.data`. */
    data?: Record<string, unknown>;
}

/**
 * `NotificationOptions` plus the members TypeScript's DOM lib leaves out
 * because not every engine implements them. Chromium honours all of them;
 * engines without support ignore the unknown keys.
 */
type ExtendedNotificationOptions = NotificationOptions & {
    image?: string;
    actions?: Omit<PushNotificationAction, "url">[];
    vibrate?: number | number[];
    renotify?: boolean;
    timestamp?: number;
};

/**
 * Payload keys copied verbatim onto the notification options when present.
 */
const FORWARDED_OPTIONS = [
    "body",
    "image",
    "tag",
    "requireInteraction",
    "vibrate",
    "silent",
    "renotify",
    "timestamp",
    "dir",
    "lang",
] as const satisfies readonly (keyof PushPayload & keyof ExtendedNotificationOptions)[];

/**
 * Build the `showNotification` options from a push payload.
 *
 * Keys the payload omits stay absent instead of being set to `undefined`, so
 * the browser applies its own defaults. Per-action `url`s are collected into
 * `data.actionUrls` (only when at least one action carries one) and stripped
 * from the actions handed to the browser.
 *
 * @param payload - The parsed (and transformed) push payload.
 * @param defaultIcon - Icon used when the payload omits one.
 * @param defaultBadge - Badge used when the payload omits one.
 * @returns The options object for `registration.showNotification`.
 */
function buildNotificationOptions(
    payload: PushPayload,
    defaultIcon: string | undefined,
    defaultBadge: string | undefined,
): ExtendedNotificationOptions {
    const options: Record<string, unknown> = {
        icon: payload.icon ?? defaultIcon,
        badge: payload.badge ?? defaultBadge,
    };
    for (const key of FORWARDED_OPTIONS) {
        if (payload[key] !== undefined) options[key] = payload[key];
    }

    const data: Record<string, unknown> = { url: payload.url ?? "/", ...(payload.data ?? {}) };
    if (payload.actions) {
        const actionUrls: Record<string, string> = {};
        options.actions = payload.actions.map(({ url, ...action }) => {
            if (url !== undefined) actionUrls[action.action] = url;
            return action;
        });
        if (Object.keys(actionUrls).length > 0) data.actionUrls = actionUrls;
    }
    options.data = data;
    return options as ExtendedNotificationOptions;
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
 *
 * Every `NotificationOptions` member the payload carries is forwarded —
 * `actions`, `requireInteraction`, `vibrate`, `silent`, `renotify`,
 * `timestamp`, `dir` and `lang` alongside `body`, `icon`, `badge`, `image` and
 * `tag`. `data` receives the top-level `url` (default `"/"`), the payload's
 * own `data`, and `actionUrls` mapping each action id to its `url`.
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
        const notification = buildNotificationOptions(payload, defaultIcon, defaultBadge);

        event.waitUntil(sw.registration.showNotification(title, notification));
    });
}

export interface InstallNotificationClickHandlerOptions {
    /**
     * Resolve the destination URL from the notification data and the clicked
     * action id (`""` or `undefined` for a click on the body). Default: the
     * action's entry in `data.actionUrls`, else `data.url`, else `"/"`.
     */
    resolveUrl?: (data: unknown, action: string | undefined) => string;
}

/**
 * Default URL resolution for a notification click.
 *
 * @param data - `event.notification.data`, as {@link installPushHandler} wrote it.
 * @param action - `event.action`; empty or `undefined` for a click on the body.
 * @returns The action's URL when it has one, else `data.url`, else `"/"`.
 */
function defaultResolveUrl(data: unknown, action: string | undefined): string {
    if (typeof data === "string") return data;
    if (!data || typeof data !== "object") return "/";
    const record = data as Record<string, unknown>;
    if (action && record.actionUrls && typeof record.actionUrls === "object") {
        const actionUrl = (record.actionUrls as Record<string, unknown>)[action];
        if (typeof actionUrl === "string") return actionUrl;
    }
    return typeof record.url === "string" ? record.url : "/";
}

/**
 * Whether an open window client is already showing `target`.
 *
 * `target` is resolved against the client's own URL, so a relative path
 * compares on the client's origin, and the comparison is on the full href.
 * A substring test would let `/events/1` match a client on `/events/10`, and
 * `/` match every client.
 *
 * @param clientUrl - The window client's absolute URL.
 * @param target - The URL the click resolved to, absolute or relative.
 * @returns `true` when both point at the same document.
 */
function clientShowsTarget(clientUrl: string, target: string): boolean {
    try {
        return new URL(target, clientUrl).href === new URL(clientUrl).href;
    } catch {
        return false;
    }
}

/**
 * Install a `notificationclick` handler that focuses an existing client when
 * possible and falls back to opening a new window.
 *
 * A click on an action button opens that action's URL (see
 * {@link PushNotificationAction.url}); a click on the body, or on an action
 * without one, opens the top-level `url`.
 */
export function installNotificationClickHandler(
    options: InstallNotificationClickHandlerOptions = {},
): void {
    const sw = getSwScope();
    const resolveUrl = options.resolveUrl ?? defaultResolveUrl;

    sw.addEventListener("notificationclick", (event) => {
        event.notification.close();
        const target = resolveUrl(event.notification.data, event.action);

        event.waitUntil(
            (async () => {
                const clients = await sw.clients.matchAll({
                    type: "window",
                    includeUncontrolled: true,
                });
                for (const client of clients) {
                    if (clientShowsTarget(client.url, target)) {
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
