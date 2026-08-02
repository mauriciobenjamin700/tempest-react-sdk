import { vi } from "vitest";

export { setSecureContext } from "./audio-mocks";

/**
 * Test doubles for WebAuthn, which jsdom does not implement at all — there is no
 * `navigator.credentials` and no `PublicKeyCredential`.
 *
 * Classes, not `vi.fn(() => obj)`: the SDK reads static members off
 * `PublicKeyCredential` and treats the credential as an object with methods, and a
 * plain mock function is not a constructor.
 */

/** Build an `ArrayBuffer` from byte values, for a deterministic base64url. */
export function bufferOf(...values: number[]): ArrayBuffer {
    return new Uint8Array(values).buffer;
}

/** The optional extras a browser may expose on an attestation response. */
export interface AttestationExtraOptions {
    transports?: string[];
    publicKey?: ArrayBuffer | null;
    publicKeyAlgorithm?: number;
    authenticatorData?: ArrayBuffer;
}

/** `AuthenticatorAttestationResponse` with only what the client reads. */
export class FakeAttestationResponse {
    clientDataJSON: ArrayBuffer;
    attestationObject: ArrayBuffer;
    getTransports?: () => string[];
    getPublicKey?: () => ArrayBuffer | null;
    getPublicKeyAlgorithm?: () => number;
    getAuthenticatorData?: () => ArrayBuffer;

    constructor(extras: AttestationExtraOptions = {}) {
        this.clientDataJSON = bufferOf(1, 2, 3);
        this.attestationObject = bufferOf(4, 5, 6);
        if (extras.transports) {
            const transports = extras.transports;
            this.getTransports = () => transports;
        }
        if ("publicKey" in extras) {
            const publicKey = extras.publicKey ?? null;
            this.getPublicKey = () => publicKey;
        }
        if (extras.publicKeyAlgorithm !== undefined) {
            const alg = extras.publicKeyAlgorithm;
            this.getPublicKeyAlgorithm = () => alg;
        }
        if (extras.authenticatorData) {
            const data = extras.authenticatorData;
            this.getAuthenticatorData = () => data;
        }
    }
}

/** `AuthenticatorAssertionResponse` with only what the client reads. */
export class FakeAssertionResponse {
    clientDataJSON = bufferOf(1, 2, 3);
    authenticatorData = bufferOf(7, 8);
    signature = bufferOf(9, 10, 11);
    userHandle: ArrayBuffer | null;

    constructor(userHandle: ArrayBuffer | null = bufferOf(255)) {
        this.userHandle = userHandle;
    }
}

/** A `PublicKeyCredential` carrying either response shape. */
export class FakeCredential {
    id: string;
    rawId: ArrayBuffer;
    type = "public-key";
    authenticatorAttachment: string | null;
    response: FakeAttestationResponse | FakeAssertionResponse;
    extensions: Record<string, unknown>;

    constructor(init: {
        response: FakeAttestationResponse | FakeAssertionResponse;
        id?: string;
        rawId?: ArrayBuffer;
        /** Present-and-`null` models a browser that does not report attachment. */
        authenticatorAttachment?: string | null;
        extensions?: Record<string, unknown>;
    }) {
        this.response = init.response;
        this.id = init.id ?? "cred-id";
        this.rawId = init.rawId ?? bufferOf(200, 201);
        this.authenticatorAttachment =
            "authenticatorAttachment" in init ? init.authenticatorAttachment! : "platform";
        this.extensions = init.extensions ?? { credProps: { rk: true } };
    }

    getClientExtensionResults(): Record<string, unknown> {
        return this.extensions;
    }
}

/** How the installed `PublicKeyCredential` statics should behave. */
export interface StaticsOptions {
    /** `false` removes the method entirely; `"throw"` makes it reject. */
    platformAvailable?: boolean | "missing" | "throw";
    /** `false` removes the method entirely; `"throw"` makes it reject. */
    conditionalAvailable?: boolean | "missing" | "throw";
}

function buildStatics(options: StaticsOptions): Record<string, unknown> {
    const statics: Record<string, unknown> = {};
    const { platformAvailable = true, conditionalAvailable = true } = options;
    if (platformAvailable !== "missing") {
        statics.isUserVerifyingPlatformAuthenticatorAvailable = async (): Promise<boolean> => {
            if (platformAvailable === "throw") throw new Error("nope");
            return platformAvailable;
        };
    }
    if (conditionalAvailable !== "missing") {
        statics.isConditionalMediationAvailable = async (): Promise<boolean> => {
            if (conditionalAvailable === "throw") throw new Error("nope");
            return conditionalAvailable;
        };
    }
    return statics;
}

/** Everything {@link installWebAuthn} hands back. */
export interface InstalledWebAuthn {
    restore: () => void;
    create: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
}

/**
 * Install `navigator.credentials` and `PublicKeyCredential` on the globals.
 *
 * @param options - Ceremony implementations plus how the capability statics behave.
 * @returns The two spies and a restore function.
 */
export function installWebAuthn(
    options: StaticsOptions & {
        create?: (args: { publicKey: unknown; signal?: AbortSignal }) => Promise<unknown>;
        get?: (args: {
            publicKey: unknown;
            signal?: AbortSignal;
            mediation?: string;
        }) => Promise<unknown>;
    } = {},
): InstalledWebAuthn {
    const previousCredentials = navigator.credentials;
    const previousStatics = (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential;

    const create = vi.fn(
        options.create ??
            (async () => new FakeCredential({ response: new FakeAttestationResponse() })),
    );
    const get = vi.fn(
        options.get ?? (async () => new FakeCredential({ response: new FakeAssertionResponse() })),
    );

    Object.defineProperty(navigator, "credentials", {
        configurable: true,
        value: { create, get },
    });
    (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential = buildStatics(options);

    return {
        create,
        get,
        restore: () => {
            Object.defineProperty(navigator, "credentials", {
                configurable: true,
                value: previousCredentials,
            });
            (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential = previousStatics;
        },
    };
}

/** Remove both WebAuthn globals, to exercise the unsupported path. */
export function removeWebAuthn(): () => void {
    const previousCredentials = navigator.credentials;
    const previousStatics = (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential;
    Object.defineProperty(navigator, "credentials", { configurable: true, value: undefined });
    delete (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential;
    return () => {
        Object.defineProperty(navigator, "credentials", {
            configurable: true,
            value: previousCredentials,
        });
        (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential = previousStatics;
    };
}

/** Server registration options, base64url, ready to hand to `register`. */
export function creationOptionsJSON(
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        challenge: "AQID",
        rp: { name: "Tempest" },
        user: { id: "dXNlci0x", name: "ada@tempest.dev", displayName: "Ada" },
        ...overrides,
    };
}

/** Server authentication options, base64url, ready to hand to `authenticate`. */
export function requestOptionsJSON(
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    return { challenge: "AQID", ...overrides };
}
