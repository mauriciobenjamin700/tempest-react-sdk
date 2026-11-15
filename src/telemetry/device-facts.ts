import type { AppErrorDeviceSchema, AppErrorPlatform } from "./app-error-schema";

/**
 * Default `localStorage` key holding the anonymous device identifier.
 */
export const DEVICE_ID_STORAGE_KEY = "tempest:device-id";

/**
 * Shape of a version-4 UUID, the only value accepted back from storage.
 *
 * Anything else under the key — a hand-written value, another library's data,
 * an old build that stored the user agent — is replaced instead of uploaded, so
 * the identifier that leaves the device is always one this module minted.
 */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Android UA tokens that sit where the model would and are not one.
 *
 * `K` is Chrome's reduced user agent (`Linux; Android 10; K`), which also
 * freezes the version at `10`; `Mobile`/`Tablet` come from Firefox, `wv` from
 * WebView.
 */
const ANDROID_NON_MODELS = new Set(["K", "Mobile", "Tablet", "wv"]);

/** A locale token (`en-us`, `pt-BR`), which old Android user agents put before the model. */
const LOCALE = /^[a-z]{2}(?:[-_][a-z]{2})?$/i;

/** The OS facts read from a user agent: the coarse version and, on Android, the model. */
export interface UserAgentFacts {
    /** Coarse operating system, e.g. `"Android 14"`, `"iOS 17.2"`, `"macOS"`. */
    os_version?: string;
    /** Device model, when the user agent still carries one. */
    device_model?: string;
}

/**
 * The User-Agent Client Hints this module reads, a subset of
 * `UADataValues` (Chromium only, absent from the DOM lib).
 */
export interface DeviceHints {
    /** Low-entropy platform name: `"Android"`, `"Windows"`, `"macOS"`, … */
    platform?: string;
    /** High-entropy OS version, e.g. `"14.0.0"`; on Windows `"15.0.0"` means 11. */
    platformVersion?: string;
    /** High-entropy device model, e.g. `"SM-A105M"`; empty on desktop. */
    model?: string;
}

/** `navigator.userAgentData`, typed to the members this module calls. */
interface UserAgentDataLike {
    platform?: string;
    getHighEntropyValues?: (hints: string[]) => Promise<DeviceHints>;
}

/** Options for {@link createDeviceFacts}. */
export interface CreateDeviceFactsOptions {
    /** Application version or build, sent as `app_version`. */
    appVersion?: string;
    /** `localStorage` key for the device identifier. Defaults to {@link DEVICE_ID_STORAGE_KEY}. */
    storageKey?: string;
    /**
     * Reporting platform. Defaults to `"web"`, which is what a browser or a PWA
     * is; a native shell (Capacitor, a WebView app) passes its own.
     */
    platform?: AppErrorPlatform;
    /**
     * Ask Chromium's User-Agent Client Hints for the real OS version and the
     * model. Defaults to `true`. Set `false` to send only what the user agent
     * string already says.
     */
    clientHints?: boolean;
}

/**
 * Turn an Apple `17_2_1` version token into `17.2.1`.
 *
 * @param token - The underscore-separated version.
 * @returns The dotted version.
 */
function dotted(token: string): string {
    return token.replace(/_/g, ".");
}

/**
 * Drop trailing `.0` groups: `"14.0.0"` → `"14"`, `"14.2.0"` → `"14.2"`.
 *
 * @param version - A dotted version.
 * @returns The version without its zero tail.
 */
function trimZeros(version: string): string {
    return version.replace(/(?:\.0)+$/, "");
}

/**
 * Read the Android version and model out of the user agent.
 *
 * Chrome's reduced user agent (`Linux; Android 10; K`) freezes **both**: every
 * Android device reports version 10 and model `K`. Reporting that as
 * `"Android 10"` would be a confident lie, so the reduced form yields bare
 * `"Android"` and no model — Client Hints fill them in where available.
 *
 * @param ua - The user agent.
 * @returns The facts, or `null` when this is not an Android user agent.
 */
function parseAndroid(ua: string): UserAgentFacts | null {
    const match = /Android(?:\s+([\d.]+))?;\s*([^;)]*)/.exec(ua);
    if (!match) return null;
    const version = match[1];
    const model = (match[2] ?? "").replace(/\s+Build\/.*$/, "").trim();
    if (model === "K") return { os_version: "Android" };
    const facts: UserAgentFacts = { os_version: version ? `Android ${version}` : "Android" };
    if (model !== "" && !ANDROID_NON_MODELS.has(model) && !LOCALE.test(model)) {
        facts.device_model = model;
    }
    return facts;
}

/**
 * Read the coarse operating system and model from a user agent string.
 *
 * Coarse on purpose: the raw user agent is a fingerprint (LGPD), so only the
 * family, its version and the Android model leave this function. Desktop
 * versions are dropped because browsers froze them — every Mac reports
 * `10_15_7` and both Windows 10 and 11 report `NT 10.0`.
 *
 * An iPad in desktop mode sends a Mac user agent; `maxTouchPoints > 1` is what
 * tells it apart, and the `Version/` token (Safari's, which tracks iPadOS) is
 * the best version left.
 *
 * @param ua - `navigator.userAgent`.
 * @param maxTouchPoints - `navigator.maxTouchPoints`.
 * @returns The OS facts; empty when the family is not recognised.
 */
export function parseUserAgent(ua: string, maxTouchPoints: number = 0): UserAgentFacts {
    const android = parseAndroid(ua);
    if (android) return android;
    const ios = /\b(iPhone|iPod|iPad)\b.*?\bOS (\d+(?:_\d+)*)/.exec(ua);
    if (ios) {
        const device = ios[1] === "iPad" ? "iPad" : "iPhone";
        const family = device === "iPad" ? "iPadOS" : "iOS";
        return { os_version: `${family} ${dotted(ios[2] ?? "")}`, device_model: device };
    }
    if (/\bMacintosh\b/.test(ua)) {
        if (maxTouchPoints > 1) {
            const safari = /\bVersion\/(\d+(?:\.\d+)*)/.exec(ua);
            return {
                os_version: safari ? `iPadOS ${safari[1]}` : "iPadOS",
                device_model: "iPad",
            };
        }
        return { os_version: "macOS" };
    }
    if (/\bWindows\b/.test(ua)) return { os_version: "Windows" };
    if (/\bCrOS\b/.test(ua)) return { os_version: "ChromeOS" };
    if (/\bLinux\b/.test(ua)) return { os_version: "Linux" };
    return {};
}

/**
 * Refine the user-agent facts with Client Hints, when they answered.
 *
 * Only the families whose user agent is frozen gain from it: Android (version
 * and model behind the reduced `K`), Windows (`platformVersion` 13+ is
 * Windows 11) and macOS.
 *
 * @param facts - What the user agent said.
 * @param hints - What `getHighEntropyValues` returned.
 * @returns The refined facts.
 */
export function applyDeviceHints(facts: UserAgentFacts, hints: DeviceHints): UserAgentFacts {
    const version = hints.platformVersion ? trimZeros(hints.platformVersion) : "";
    const model = hints.model?.trim() ?? "";
    if (hints.platform === "Android" && facts.os_version?.startsWith("Android")) {
        return {
            os_version: version ? `Android ${version}` : facts.os_version,
            device_model: model || facts.device_model,
        };
    }
    if (hints.platform === "Windows" && facts.os_version === "Windows" && version) {
        const major = Number.parseInt(version, 10);
        if (major >= 13) return { os_version: "Windows 11" };
        if (major > 0) return { os_version: "Windows 10" };
        return facts;
    }
    if (hints.platform === "macOS" && facts.os_version === "macOS" && version) {
        return { os_version: `macOS ${version}` };
    }
    return facts;
}

/**
 * Mint a random version-4 UUID from the platform CSPRNG.
 *
 * `crypto.randomUUID` is withheld outside secure contexts (a LAN IP over
 * plain http), but `getRandomValues` is not, so it is the fallback. With
 * neither there is no identifier at all — never a `Math.random` one, which
 * would collide across devices and quietly merge their reports.
 *
 * @returns The UUID, or `null` without Web Crypto.
 */
export function randomDeviceId(): string | null {
    const host = globalThis.crypto as Partial<Crypto> | undefined;
    if (typeof host?.randomUUID === "function") return host.randomUUID();
    if (typeof host?.getRandomValues !== "function") return null;
    const bytes = host.getRandomValues(new Uint8Array(16));
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Read the stored device id, minting and persisting one when absent.
 *
 * @param key - The `localStorage` key.
 * @returns The id, or `null` without Web Crypto.
 *
 * @tempest-limits empty-catch — `localStorage` throws in Safari private mode,
 * on quota exhaustion and in a storage-blocked frame. The id then lives in
 * memory for the reader's lifetime: reports of the session still group, and the
 * next session simply counts as another device.
 */
function loadDeviceId(key: string): string | null {
    let stored: string | null;
    try {
        stored = globalThis.localStorage?.getItem(key) ?? null;
    } catch {
        stored = null;
    }
    if (stored !== null && UUID_V4.test(stored)) return stored;
    const minted = randomDeviceId();
    if (minted === null) return null;
    try {
        globalThis.localStorage?.setItem(key, minted);
    } catch {
        /* empty */
    }
    return minted;
}

/**
 * Ask Chromium for the high-entropy hints, swallowing every failure.
 *
 * @param data - `navigator.userAgentData`.
 * @returns The hints, or `null` when unsupported, refused or failed.
 */
async function requestHints(data: UserAgentDataLike | undefined): Promise<DeviceHints | null> {
    if (typeof data?.getHighEntropyValues !== "function") return null;
    try {
        return await data.getHighEntropyValues(["platformVersion", "model"]);
    } catch {
        return null;
    }
}

/**
 * Build the `device` getter for {@link createAppErrorReporter}: platform, coarse
 * OS, Android model, app version and an anonymous device id.
 *
 * Privacy is the contract, not a setting (LGPD):
 *
 * - **The raw user agent never leaves.** It is a fingerprint; only the OS family,
 *   its version and the Android model are kept.
 * - **`device_id` is random**, minted from Web Crypto on first use and stored in
 *   `localStorage`. It groups reports from one device without saying whose it is,
 *   and a stored value that is not a v4 UUID is replaced, never uploaded.
 *   Storage that throws (Safari private mode, quota, blocked frame) degrades to
 *   an in-memory id for the session.
 *
 * Chrome's reduced user agent freezes Android at `Android 10; K` on every phone,
 * so the user agent alone cannot give the version or the model there. Creating
 * the getter asks the User-Agent Client Hints (`navigator.userAgentData`) once,
 * in the background; until they answer, and on browsers without them, the
 * reduced form reports bare `"Android"` instead of a wrong version. The getter
 * itself stays synchronous, as the reporter requires.
 *
 * @param options - App version, storage key, platform and Client Hints switch.
 * @returns A getter returning the device facts, safe during SSR (no `navigator`
 *   → no OS fields).
 *
 * @example
 * ```ts
 * import { createAppErrorReporter, createDeviceFacts } from "tempest-react-sdk";
 *
 * export const reporter = createAppErrorReporter({
 *     endpoint: "/api/app-errors",
 *     device: createDeviceFacts({ appVersion: "1.4.0" }),
 * });
 * ```
 */
export function createDeviceFacts(
    options: CreateDeviceFactsOptions = {},
): () => AppErrorDeviceSchema {
    const {
        appVersion,
        storageKey = DEVICE_ID_STORAGE_KEY,
        platform = "web",
        clientHints = true,
    } = options;
    const nav = typeof navigator === "undefined" ? undefined : navigator;
    let hints: DeviceHints | null = null;
    if (clientHints && nav) {
        const data = (nav as Navigator & { userAgentData?: UserAgentDataLike }).userAgentData;
        void requestHints(data).then((answer) => {
            if (answer) hints = { ...answer, platform: answer.platform ?? data?.platform };
        });
    }
    let deviceId: string | null | undefined;
    return () => {
        if (deviceId === undefined) deviceId = loadDeviceId(storageKey);
        const parsed = nav ? parseUserAgent(nav.userAgent ?? "", nav.maxTouchPoints ?? 0) : {};
        const facts = hints ? applyDeviceHints(parsed, hints) : parsed;
        const device: AppErrorDeviceSchema = { platform };
        if (facts.os_version) device.os_version = facts.os_version;
        if (facts.device_model) device.device_model = facts.device_model;
        if (appVersion) device.app_version = appVersion;
        if (deviceId) device.device_id = deviceId;
        return device;
    };
}
