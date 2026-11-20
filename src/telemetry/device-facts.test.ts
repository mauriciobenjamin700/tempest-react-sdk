import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppErrorReporter } from "./app-error-reporter";
import {
    DEVICE_ID_STORAGE_KEY,
    applyDeviceHints,
    createDeviceFacts,
    parseUserAgent,
    randomDeviceId,
} from "./device-facts";
import type { DeviceHints } from "./device-facts";

const UA = {
    androidModel:
        "Mozilla/5.0 (Linux; Android 11; SM-A105M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Mobile Safari/537.36",
    androidBuild:
        "Mozilla/5.0 (Linux; Android 9; SM-G960F Build/PPR1.180610.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/74.0.3729.157 Mobile Safari/537.36",
    androidReduced:
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
    androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0",
    iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
    ipad: "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    ipadDesktop:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    windows:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    linux: "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
    chromeos:
        "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
} as const;

const REAL_MODELS = [
    "SM-S918B",
    "Pixel 8 Pro",
    "moto g(60)",
    "M2101K6G",
    "CPH2449",
    "2201117TG",
    "ONEPLUS A6013",
    "Redmi Note 9 Pro",
    "ASUS_X00TD",
    "Nokia 7.2",
    "Redmi Note 12 Pro+ 5G",
] as const;

const NOT_MODELS = [
    "user=alice@example.com token=abc123",
    "alice@example.com",
    "https://evil.test/x",
    "key:value",
    "a/b",
    "-leading-dash",
    "SM-S918B\u0000",
    "A".repeat(41),
] as const;

function androidUa(model: string): string {
    return `Mozilla/5.0 (Linux; Android 13; ${model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36`;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function stubNavigator(
    userAgent: string,
    extra: { maxTouchPoints?: number; userAgentData?: unknown } = {},
): void {
    vi.stubGlobal("navigator", {
        userAgent,
        maxTouchPoints: extra.maxTouchPoints ?? 0,
        userAgentData: extra.userAgentData,
    });
}

async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
});

describe("parseUserAgent", () => {
    it("keeps the Android version and the model when the user agent still carries them", () => {
        expect(parseUserAgent(UA.androidModel)).toEqual({
            os_version: "Android 11",
            device_model: "SM-A105M",
        });
    });

    it("strips the WebView build suffix from the model", () => {
        expect(parseUserAgent(UA.androidBuild)).toEqual({
            os_version: "Android 9",
            device_model: "SM-G960F",
        });
    });

    it("reports bare Android for Chrome's reduced `Android 10; K`, never the frozen version", () => {
        expect(parseUserAgent(UA.androidReduced)).toEqual({ os_version: "Android" });
    });

    it("does not take Firefox's `Mobile` token for a model", () => {
        expect(parseUserAgent(UA.androidFirefox)).toEqual({ os_version: "Android 14" });
    });

    it.each(REAL_MODELS)("keeps the real model %s from the user agent", (model) => {
        expect(parseUserAgent(androidUa(model))).toEqual({
            os_version: "Android 13",
            device_model: model,
        });
    });

    it.each([
        "HTC Sensation XE with Beats Audio Z715a",
        "Lenovo ThinkPad 11e 4th Gen Chromebook",
        "Acer Chromebook 14 for Work (CP5-471)",
        "ADMIRE SHINE",
        "AI PONT PLUS",
    ])("keeps the long or digitless real model %s, so the cap stays at 40 (#657)", (model) => {
        expect(parseUserAgent(androidUa(model)).device_model).toBe(model);
    });

    it("keeps a model up to 40 characters", () => {
        const model = "A".repeat(40);
        expect(parseUserAgent(androidUa(model)).device_model).toBe(model);
    });

    it.each(NOT_MODELS)("drops a user-agent segment that is not a model: %j", (segment) => {
        expect(parseUserAgent(androidUa(segment))).toEqual({ os_version: "Android 13" });
    });

    it("does not let a custom user agent put free text in device_model (#644)", () => {
        const ua =
            "Mozilla/5.0 (Linux; Android 13; user=alice@example.com token=abc123) AppleWebKit/537.36";
        const facts = parseUserAgent(ua);
        expect(facts).toEqual({ os_version: "Android 13" });
        expect(JSON.stringify(facts)).not.toContain("alice");
    });

    it("does not cut Motorola's parenthesised model at its own `)`", () => {
        expect(
            parseUserAgent("Mozilla/5.0 (Linux; Android 11; moto g(60)) AppleWebKit/537.36")
                .device_model,
        ).toBe("moto g(60)");
    });

    it("does not take an old user agent's locale token for a model", () => {
        expect(
            parseUserAgent("Mozilla/5.0 (Linux; U; Android 4.4.2; pt-br; SM-T230 Build/KOT49H)"),
        ).toEqual({ os_version: "Android 4.4.2" });
    });

    it("reads the iOS version of an iPhone", () => {
        expect(parseUserAgent(UA.iphone)).toEqual({
            os_version: "iOS 17.2.1",
            device_model: "iPhone",
        });
    });

    it("reads an iPad as iPadOS", () => {
        expect(parseUserAgent(UA.ipad)).toEqual({
            os_version: "iPadOS 16.6",
            device_model: "iPad",
        });
    });

    it("tells an iPad passing as a Mac by its touch points, versioned by Safari", () => {
        expect(parseUserAgent(UA.ipadDesktop, 5)).toEqual({
            os_version: "iPadOS 17.2",
            device_model: "iPad",
        });
    });

    it("reports a real Mac as macOS without the frozen 10_15_7", () => {
        expect(parseUserAgent(UA.ipadDesktop, 0)).toEqual({ os_version: "macOS" });
    });

    it("reports desktop families coarsely", () => {
        expect(parseUserAgent(UA.windows)).toEqual({ os_version: "Windows" });
        expect(parseUserAgent(UA.linux)).toEqual({ os_version: "Linux" });
        expect(parseUserAgent(UA.chromeos)).toEqual({ os_version: "ChromeOS" });
    });

    it("returns nothing for a family it does not know", () => {
        expect(parseUserAgent("curl/8.4.0")).toEqual({});
    });
});

describe("applyDeviceHints", () => {
    it("recovers version and model behind the reduced Android user agent", () => {
        const hints: DeviceHints = {
            platform: "Android",
            platformVersion: "14.0.0",
            model: "SM-A105M",
        };
        expect(applyDeviceHints({ os_version: "Android" }, hints)).toEqual({
            os_version: "Android 14",
            device_model: "SM-A105M",
        });
    });

    it.each(REAL_MODELS)("keeps the real hinted model %s", (model) => {
        expect(applyDeviceHints({ os_version: "Android" }, { platform: "Android", model })).toEqual(
            { os_version: "Android", device_model: model },
        );
    });

    it.each(NOT_MODELS)("drops a hinted model that is not a model: %j", (model) => {
        expect(applyDeviceHints({ os_version: "Android" }, { platform: "Android", model })).toEqual(
            { os_version: "Android", device_model: undefined },
        );
    });

    it("keeps the user agent's model when the hinted one is not a model", () => {
        expect(
            applyDeviceHints(
                { os_version: "Android 11", device_model: "SM-A105M" },
                { platform: "Android", model: "user=alice@example.com token=abc123" },
            ),
        ).toEqual({ os_version: "Android 11", device_model: "SM-A105M" });
    });

    it("keeps what the user agent said when the hints are empty", () => {
        expect(
            applyDeviceHints(
                { os_version: "Android 11", device_model: "SM-A105M" },
                { platform: "Android", platformVersion: "", model: "" },
            ),
        ).toEqual({ os_version: "Android 11", device_model: "SM-A105M" });
    });

    it("splits Windows 10 from 11 by platformVersion", () => {
        const base = { os_version: "Windows" };
        expect(applyDeviceHints(base, { platform: "Windows", platformVersion: "15.0.0" })).toEqual({
            os_version: "Windows 11",
        });
        expect(applyDeviceHints(base, { platform: "Windows", platformVersion: "10.0.0" })).toEqual({
            os_version: "Windows 10",
        });
        expect(applyDeviceHints(base, { platform: "Windows", platformVersion: "0.3.0" })).toEqual(
            base,
        );
    });

    it("versions macOS from the hints", () => {
        expect(
            applyDeviceHints(
                { os_version: "macOS" },
                { platform: "macOS", platformVersion: "14.2.1" },
            ),
        ).toEqual({ os_version: "macOS 14.2.1" });
    });

    it("ignores hints from another family", () => {
        expect(applyDeviceHints({ os_version: "Linux" }, { platform: "Linux" })).toEqual({
            os_version: "Linux",
        });
    });
});

/**
 * Security audit run-16 §6 (#657): `platformVersion` was interpolated into
 * `os_version` as it came, so an embedding browser or WebView answering
 * `"14 user=alice"` uploaded `"Android 14 user=alice"`. It now passes an
 * allowlist of dotted numbers, as the model passes its own (#644); one that
 * does not keeps what the user agent said.
 */
describe("applyDeviceHints — platformVersion allowlist (#657)", () => {
    const NOT_VERSIONS = [
        "14 user=alice",
        "14.0.0; token=abc",
        "alice@example.com",
        "14.0.0\u0000",
        "1".repeat(30),
        "14..0",
        ".14",
    ] as const;

    it.each(NOT_VERSIONS)("keeps the user agent's Android version over %j", (platformVersion) => {
        const facts = applyDeviceHints(
            { os_version: "Android" },
            { platform: "Android", platformVersion, model: "SM-A105M" },
        );
        expect(facts).toEqual({ os_version: "Android", device_model: "SM-A105M" });
    });

    it.each(NOT_VERSIONS)("keeps bare macOS over %j", (platformVersion) => {
        expect(
            applyDeviceHints({ os_version: "macOS" }, { platform: "macOS", platformVersion }),
        ).toEqual({ os_version: "macOS" });
    });

    it("does not read a Windows major out of free text", () => {
        expect(
            applyDeviceHints(
                { os_version: "Windows" },
                { platform: "Windows", platformVersion: "15 user=alice" },
            ),
        ).toEqual({ os_version: "Windows" });
    });

    it.each([
        "14.0.0",
        "13",
        "15.0.0",
        "10.0.0",
        "0.3.0",
        "14.2.1",
        "16.1",
        "10.15.7",
        "4.4.4",
        "26.0.0",
        "19.0.0",
    ])("keeps the real platformVersion %s", (platformVersion) => {
        const facts = applyDeviceHints(
            { os_version: "Android" },
            { platform: "Android", platformVersion },
        );
        expect(facts.os_version).toBe(
            `Android ${platformVersion.replace(/(?:\.0)+$/, "")}`.trimEnd(),
        );
    });
});

/**
 * Security audit run-17 §5 (#684): the allowlist took four groups of up to
 * five digits, a 23-character channel of arbitrary digits into `os_version`.
 * Every real `platformVersion` (Android `Build.VERSION.RELEASE`, Windows
 * `UniversalApiContract`, macOS) is at most three groups of up to three
 * digits, with no leading zero.
 */
describe("applyDeviceHints — platformVersion shape (#684)", () => {
    it.each(["12345", "14.00001.0", "14.0.0.0", "1.2.3.4", "0014.0.0", "14.01.0", "1000.0.0"])(
        "keeps the user agent's Android version over %j",
        (platformVersion) => {
            const facts = applyDeviceHints(
                { os_version: "Android" },
                { platform: "Android", platformVersion },
            );
            expect(facts).toEqual({ os_version: "Android" });
        },
    );
});

describe("randomDeviceId", () => {
    it("falls back to getRandomValues outside a secure context", () => {
        vi.stubGlobal("crypto", {
            getRandomValues: (bytes: Uint8Array) => bytes.fill(0xff),
        });
        expect(randomDeviceId()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    });

    it("mints nothing without Web Crypto rather than a guessable id", () => {
        vi.stubGlobal("crypto", undefined);
        expect(randomDeviceId()).toBeNull();
    });
});

describe("createDeviceFacts", () => {
    it("never sends the raw user agent", () => {
        stubNavigator(UA.androidModel);
        const device = createDeviceFacts({ appVersion: "1.4.0" })();
        expect(device).toEqual({
            platform: "web",
            os_version: "Android 11",
            device_model: "SM-A105M",
            app_version: "1.4.0",
            device_id: expect.stringMatching(UUID_V4),
        });
        for (const value of Object.values(device)) {
            expect(value).not.toContain("Mozilla");
            expect(value).not.toContain("AppleWebKit");
        }
    });

    it("persists one random id, so reports from the same device group", () => {
        stubNavigator(UA.windows);
        const first = createDeviceFacts()().device_id;
        const second = createDeviceFacts()().device_id;
        expect(first).toMatch(UUID_V4);
        expect(second).toBe(first);
        expect(localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBe(first);
    });

    it("replaces a stored value that is not a v4 UUID instead of uploading it", () => {
        stubNavigator(UA.windows);
        localStorage.setItem("app:device", UA.windows);
        const id = createDeviceFacts({ storageKey: "app:device" })().device_id;
        expect(id).toMatch(UUID_V4);
        expect(localStorage.getItem("app:device")).toBe(id);
    });

    it("keeps one in-memory id for the session when storage throws", () => {
        stubNavigator(UA.windows);
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new DOMException("denied", "SecurityError");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new DOMException("quota", "QuotaExceededError");
        });
        const read = createDeviceFacts();
        const first = read().device_id;
        expect(first).toMatch(UUID_V4);
        expect(read().device_id).toBe(first);
    });

    it("omits the id without Web Crypto", () => {
        stubNavigator(UA.windows);
        vi.stubGlobal("crypto", undefined);
        expect(createDeviceFacts()()).toEqual({ platform: "web", os_version: "Windows" });
    });

    it("refines the reduced Android user agent once the Client Hints answer", async () => {
        const getHighEntropyValues = vi.fn(async () => ({
            platform: "Android",
            platformVersion: "14.0.0",
            model: "SM-A105M",
        }));
        stubNavigator(UA.androidReduced, {
            userAgentData: { platform: "Android", getHighEntropyValues },
        });
        const read = createDeviceFacts();
        expect(read()).toMatchObject({ os_version: "Android" });
        expect(read().device_model).toBeUndefined();
        await settle();
        expect(read()).toMatchObject({ os_version: "Android 14", device_model: "SM-A105M" });
        expect(getHighEntropyValues).toHaveBeenCalledOnce();
        expect(getHighEntropyValues).toHaveBeenCalledWith(["platformVersion", "model"]);
    });

    it("falls back to the low-entropy platform when the answer lacks it", async () => {
        stubNavigator(UA.windows, {
            userAgentData: {
                platform: "Windows",
                getHighEntropyValues: async () => ({ platformVersion: "15.0.0" }),
            },
        });
        const read = createDeviceFacts();
        await settle();
        expect(read().os_version).toBe("Windows 11");
    });

    it("keeps the user-agent facts when the Client Hints reject", async () => {
        stubNavigator(UA.androidModel, {
            userAgentData: {
                platform: "Android",
                getHighEntropyValues: async () => {
                    throw new DOMException("blocked", "NotAllowedError");
                },
            },
        });
        const read = createDeviceFacts();
        await settle();
        expect(read()).toMatchObject({ os_version: "Android 11", device_model: "SM-A105M" });
    });

    it("does not ask for Client Hints when told not to", () => {
        const getHighEntropyValues = vi.fn(async () => ({}));
        stubNavigator(UA.androidReduced, { userAgentData: { getHighEntropyValues } });
        createDeviceFacts({ clientHints: false })();
        expect(getHighEntropyValues).not.toHaveBeenCalled();
    });

    it("lets a native shell name its platform", () => {
        stubNavigator(UA.iphone);
        expect(createDeviceFacts({ platform: "ios" })().platform).toBe("ios");
    });

    it("reads no OS fields without a navigator (SSR)", () => {
        vi.stubGlobal("navigator", undefined);
        const device = createDeviceFacts({ appVersion: "2.0.0" })();
        expect(device.os_version).toBeUndefined();
        expect(device).toMatchObject({ platform: "web", app_version: "2.0.0" });
    });
});

describe("createDeviceFacts with createAppErrorReporter", () => {
    it("ships the facts in the report body, without the user agent", async () => {
        stubNavigator(UA.androidModel);
        const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
        const reporter = createAppErrorReporter({
            endpoint: "https://api.example.test/api/app-errors",
            fetch: fetchMock as unknown as typeof fetch,
            storage: null,
            autoFlush: false,
            device: createDeviceFacts({ appVersion: "1.4.0" }),
        });
        reporter.report(new TypeError("bad"));
        await reporter.flush();
        reporter.dispose();
        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        const body = init.body as string;
        expect(JSON.parse(body)).toMatchObject({
            platform: "web",
            os_version: "Android 11",
            device_model: "SM-A105M",
            app_version: "1.4.0",
            device_id: expect.stringMatching(UUID_V4),
        });
        expect(body).not.toContain("Mozilla");
    });

    it("sends device_id only alongside a bearer, so an anonymous report is not tied to the user (#644)", async () => {
        stubNavigator(UA.androidModel);
        let token: string | null = "tok-A";
        const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
        const reporter = createAppErrorReporter({
            endpoint: "https://api.example.test/api/app-errors",
            fetch: fetchMock as unknown as typeof fetch,
            storage: null,
            autoFlush: false,
            getToken: () => token,
            device: createDeviceFacts(),
        });
        reporter.report("signed in");
        await reporter.flush();
        reporter.report("raised as A, sent after logout");
        token = null;
        reporter.report("after logout");
        await reporter.flush();
        reporter.dispose();
        const sent = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>).map(
            ([, init]) => ({
                bearer: (init.headers as Record<string, string>).Authorization ?? null,
                body: JSON.parse(init.body as string) as Record<string, unknown>,
            }),
        );
        expect(sent).toHaveLength(3);
        expect(sent[0]?.bearer).toBe("Bearer tok-A");
        expect(sent[0]?.body.device_id).toEqual(expect.stringMatching(UUID_V4));
        for (const anonymous of sent.slice(1)) {
            expect(anonymous.bearer).toBeNull();
            expect(anonymous.body).not.toHaveProperty("device_id");
            expect(anonymous.body).toMatchObject({ platform: "web", device_model: "SM-A105M" });
        }
    });

    it("keeps device_id on every report when the reporter has no getToken to attribute any", async () => {
        stubNavigator(UA.androidModel);
        const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
        const reporter = createAppErrorReporter({
            endpoint: "https://api.example.test/api/app-errors",
            fetch: fetchMock as unknown as typeof fetch,
            storage: null,
            autoFlush: false,
            device: createDeviceFacts(),
        });
        reporter.report("public app");
        await reporter.flush();
        reporter.dispose();
        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(JSON.parse(init.body as string).device_id).toEqual(expect.stringMatching(UUID_V4));
    });
});
