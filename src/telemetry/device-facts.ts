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

/**
 * Longest device model accepted, in characters.
 *
 * Real models stay well under it — `SM-S918B` is 8, `Redmi Note 12 Pro+ 5G` is
 * 21 — so the cap only bounds how much free text a custom user agent could
 * smuggle through a value that passes the charset.
 *
 * Not lowered, by measurement (#657, security audit run-16 §6, which asked
 * whether a shorter cap or a required digit/hyphen would keep a short name
 * such as `Alice Souza CPF 12345678900` out). Over the 44 809 distinct models
 * in Google Play's supported-devices list that pass {@link DEVICE_MODEL}
 * (19/11/2026): a cap of 30 drops 41 real models, 24 drops 251, and 40 drops
 * one; requiring a digit drops 4 334 (`ADMIRE SHINE`, `AI PONT PLUS`), a digit
 * or a hyphen 4 108. Real models are free text too —
 * `HTC Sensation XE with Beats Audio Z715a` is 39 characters — so no shape
 * tells a 27-character name with a number from a model, and every rule that
 * tries drops real devices from every report. The value needs the embedding
 * browser or WebView to write it, and it only reaches the app's own error
 * endpoint. Method in `docs/internal/decisions.md`.
 */
const MAX_DEVICE_MODEL_LENGTH = 40;

/**
 * Shape of a device model: letters, digits, space and `._()+-`, starting with a
 * letter or a digit.
 *
 * Built from models phones actually report — `SM-S918B`, `Pixel 8 Pro`,
 * `moto g(60)`, `M2101K6G`, `CPH2449`, `2201117TG`, `ONEPLUS A6013`,
 * `Redmi Note 9 Pro`, `ASUS_X00TD`, `Nokia 7.2`, `Redmi Note 12 Pro+ 5G`. It is
 * an allowlist because the model is the one free-form value read off the user
 * agent: a WebView or a custom browser can write anything in that segment
 * (`user=alice@example.com token=abc123` was observed in an audit), and what
 * does not look like a model is dropped rather than uploaded. `=`, `@`, `:`,
 * `/`, `;` and every control character are outside the set, which is what keeps
 * key-value pairs, e-mails and URLs out.
 */
const DEVICE_MODEL = /^[A-Za-z0-9][A-Za-z0-9 ._()+-]*$/;

/**
 * Accept a device model only when it has the shape of one.
 *
 * @param model - The candidate, already trimmed.
 * @returns The model, or `undefined` when it is empty, longer than
 *   {@link MAX_DEVICE_MODEL_LENGTH} or outside the model charset.
 */
function deviceModel(model: string): string | undefined {
    if (model.length > MAX_DEVICE_MODEL_LENGTH || !DEVICE_MODEL.test(model)) return undefined;
    return model;
}

/**
 * Shape of a Client Hints `platformVersion`: one to three dotted groups of up
 * to three digits, without a leading zero — `14.0.0` (Android), `15.0.0`
 * (Windows 11), `0.3.0` (Windows 8.1), `14.2.1` and `10.15.7` (macOS).
 *
 * The hint is answered by whatever browser or WebView embeds the app, and it
 * was interpolated into `os_version` as it came: `"14 user=alice"` was
 * uploaded as `"Android 14 user=alice"` (security audit run-16 §6, #657). Like
 * the model (#644), what does not have the shape is dropped, and the user
 * agent's version stays. Up to 0.91.0 the shape took four groups of up to
 * five digits, a 23-character channel of arbitrary digits that no real
 * version needs; the bound is now the widest real one (#684). ChromeOS
 * reports five-digit groups (`15183.69.0`), but its hint is never read.
 */
const PLATFORM_VERSION = /^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){0,2}$/;

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
    /**
     * High-entropy device model, e.g. `"SM-A105M"`; empty on desktop. Kept only
     * when it has the shape of a model, like the one read off the user agent.
     */
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
 * The model segment runs to the next `;` or to the `)` that closes the
 * platform group, keeping a balanced pair inside it: Motorola reports
 * `moto g(60)`, which a plain `[^;)]*` would cut to `moto g(60`. What is left
 * after the `Build/` suffix must then pass the model allowlist, or no model is
 * reported.
 *
 * @param ua - The user agent.
 * @returns The facts, or `null` when this is not an Android user agent.
 */
function parseAndroid(ua: string): UserAgentFacts | null {
    const match = /Android(?:\s+([\d.]+))?;\s*((?:[^;()]|\([^;()]*\))*)/.exec(ua);
    if (!match) return null;
    const version = match[1];
    const model = (match[2] ?? "").replace(/\s+Build\/.*$/, "").trim();
    if (model === "K") return { os_version: "Android" };
    const facts: UserAgentFacts = { os_version: version ? `Android ${version}` : "Android" };
    if (!ANDROID_NON_MODELS.has(model) && !LOCALE.test(model)) {
        const checked = deviceModel(model);
        if (checked) facts.device_model = checked;
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
 * Windows 11) and macOS. The hinted model passes the same allowlist as the
 * user agent's; one that does not keeps the user agent's model, if any. The
 * hinted version passes {@link PLATFORM_VERSION}; one that does not is
 * ignored, as if the hint had not answered.
 *
 * @param facts - What the user agent said.
 * @param hints - What `getHighEntropyValues` returned.
 * @returns The refined facts.
 */
export function applyDeviceHints(facts: UserAgentFacts, hints: DeviceHints): UserAgentFacts {
    const hinted = hints.platformVersion?.trim() ?? "";
    const version = PLATFORM_VERSION.test(hinted) ? trimZeros(hinted) : "";
    const model = deviceModel(hints.model?.trim() ?? "");
    if (hints.platform === "Android" && facts.os_version?.startsWith("Android")) {
        return {
            os_version: version ? `Android ${version}` : facts.os_version,
            device_model: model ?? facts.device_model,
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
 *   its version and the Android model are kept — and the model only when it has
 *   the shape of one (letters, digits, space and `._()+-`, at most 40
 *   characters), from the user agent and from Client Hints alike.
 * - **`device_id` is random**, minted from Web Crypto on first use and stored in
 *   `localStorage`. It groups reports from one device without saying whose it is,
 *   and a stored value that is not a v4 UUID is replaced, never uploaded.
 *   Storage that throws (Safari private mode, quota, blocked frame) degrades to
 *   an in-memory id for the session. {@link createAppErrorReporter} with a
 *   `getToken` sends it only alongside a bearer, so an anonymous report cannot
 *   be tied to the signed-in reports of the same device.
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
