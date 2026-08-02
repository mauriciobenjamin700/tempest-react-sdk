import { afterEach, describe, expect, it, vi } from "vitest";
import {
    bufferOf,
    creationOptionsJSON,
    FakeAssertionResponse,
    FakeAttestationResponse,
    FakeCredential,
    installWebAuthn,
    removeWebAuthn,
    requestOptionsJSON,
    setSecureContext,
} from "../../test/webauthn-mocks";
import {
    base64UrlToBytes,
    bytesToBase64Url,
    classifyPasskeyError,
    createPasskeyClient,
    DEFAULT_PUB_KEY_CRED_PARAMS,
    isConditionalMediationAvailable,
    isPasskeySupported,
    isPlatformAuthenticatorAvailable,
    PasskeyError,
    type CreatePasskeyClientOptions,
    type PasskeyCreationOptionsJSON,
    type PasskeyRequestOptionsJSON,
} from "./passkey";

const restores: (() => void)[] = [];

function track<T extends () => void>(restore: T): T {
    restores.push(restore);
    return restore;
}

afterEach(() => {
    while (restores.length > 0) restores.pop()?.();
});

/** Build a client whose ceremonies are the injected doubles. */
function client(
    options: CreatePasskeyClientOptions & {
        create?: (args: { publicKey: unknown; signal?: AbortSignal }) => Promise<unknown>;
        get?: (args: {
            publicKey: unknown;
            signal?: AbortSignal;
            mediation?: string;
        }) => Promise<unknown>;
    } = {},
) {
    const create = vi.fn(
        options.create ??
            (async () => new FakeCredential({ response: new FakeAttestationResponse() })),
    );
    const get = vi.fn(
        options.get ?? (async () => new FakeCredential({ response: new FakeAssertionResponse() })),
    );
    return {
        create,
        get,
        instance: createPasskeyClient({
            ...options,
            credentials: { create, get } as never,
        }),
    };
}

describe("base64url plumbing", () => {
    it("round-trips arbitrary bytes", () => {
        const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
        expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
    });

    it("decodes unpadded input, which is the only form WebAuthn sends", () => {
        expect(Array.from(base64UrlToBytes("AQID"))).toEqual([1, 2, 3]);
        expect(Array.from(base64UrlToBytes("AQI"))).toEqual([1, 2]);
    });

    it("uses the URL-safe alphabet and drops padding on encode", () => {
        const encoded = bytesToBase64Url(new Uint8Array([251, 255, 190]));
        expect(encoded).not.toContain("+");
        expect(encoded).not.toContain("/");
        expect(encoded).not.toContain("=");
        expect(Array.from(base64UrlToBytes(encoded))).toEqual([251, 255, 190]);
    });

    it("accepts a raw ArrayBuffer as well as a view", () => {
        expect(bytesToBase64Url(bufferOf(1, 2, 3))).toBe("AQID");
    });
});

describe("capability probes", () => {
    it("reports supported when both globals are present", () => {
        track(installWebAuthn().restore);
        expect(isPasskeySupported()).toBe(true);
    });

    it("reports unsupported when the globals are missing", () => {
        track(removeWebAuthn());
        expect(isPasskeySupported()).toBe(false);
    });

    it("answers the platform-authenticator probe", async () => {
        track(installWebAuthn({ platformAvailable: true }).restore);
        await expect(isPlatformAuthenticatorAvailable()).resolves.toBe(true);
    });

    it("returns false when the platform probe is absent", async () => {
        track(installWebAuthn({ platformAvailable: "missing" }).restore);
        await expect(isPlatformAuthenticatorAvailable()).resolves.toBe(false);
    });

    it("returns false when the platform probe throws", async () => {
        track(installWebAuthn({ platformAvailable: "throw" }).restore);
        await expect(isPlatformAuthenticatorAvailable()).resolves.toBe(false);
    });

    it("answers the conditional-mediation probe", async () => {
        track(installWebAuthn({ conditionalAvailable: true }).restore);
        await expect(isConditionalMediationAvailable()).resolves.toBe(true);
    });

    it("returns false when conditional mediation is absent", async () => {
        track(installWebAuthn({ conditionalAvailable: "missing" }).restore);
        await expect(isConditionalMediationAvailable()).resolves.toBe(false);
    });

    it("returns false when the conditional probe throws", async () => {
        track(installWebAuthn({ conditionalAvailable: "throw" }).restore);
        await expect(isConditionalMediationAvailable()).resolves.toBe(false);
    });
});

describe("classifyPasskeyError", () => {
    it("blames the insecure context before anything else", () => {
        track(setSecureContext(false));
        const error = classifyPasskeyError(
            new DOMException("x", "NotAllowedError"),
            "authenticate",
        );
        expect(error.kind).toBe("insecure");
        expect(error.message).toContain("HTTPS");
    });

    describe("over https", () => {
        const cases: [name: string, kind: string, needle: string][] = [
            ["NotAllowedError", "cancelled", "does not say which"],
            ["InvalidStateError", "already-registered", "already has a passkey"],
            ["NotSupportedError", "not-supported", "pubKeyCredParams"],
            ["SecurityError", "rp-mismatch", "registrable parent"],
            ["AbortError", "aborted", "aborted"],
        ];

        it.each(cases)("maps %s to %s", (name, kind, needle) => {
            track(setSecureContext(true));
            const error = classifyPasskeyError(new DOMException("boom", name), "register");
            expect(error.kind).toBe(kind);
            expect(error.message).toContain(needle);
        });

        it("maps an unlisted DOMException to unknown", () => {
            track(setSecureContext(true));
            expect(
                classifyPasskeyError(new DOMException("odd", "DataError"), "register").kind,
            ).toBe("unknown");
        });

        it("maps a TypeError to invalid-options and names the ceremony", () => {
            track(setSecureContext(true));
            const error = classifyPasskeyError(new TypeError("bad"), "authenticate");
            expect(error.kind).toBe("invalid-options");
            expect(error.message).toContain("authenticate");
        });

        it("keeps a message from a plain Error", () => {
            track(setSecureContext(true));
            expect(classifyPasskeyError(new Error("offline"), "register").message).toBe("offline");
        });

        it("falls back to a generic message for a non-Error", () => {
            track(setSecureContext(true));
            expect(classifyPasskeyError("nope", "register").message).toContain("register");
        });

        it("passes an already-classified error through untouched", () => {
            const original = new PasskeyError("cancelled", "mine");
            expect(classifyPasskeyError(original, "register")).toBe(original);
        });

        it("carries the original as `cause`", () => {
            track(setSecureContext(true));
            const thrown = new DOMException("x", "NotAllowedError");
            expect(classifyPasskeyError(thrown, "register").cause).toBe(thrown);
        });
    });
});

describe("createPasskeyClient — registration", () => {
    it("decodes the server options and serializes the credential", async () => {
        const { create, instance } = client({ rpId: "tempest.dev" });
        const result = await instance.register(
            creationOptionsJSON({
                excludeCredentials: [{ id: "AQID", type: "public-key", transports: ["internal"] }],
            }) as unknown as PasskeyCreationOptionsJSON,
        );

        const sent = create.mock.calls[0]![0] as { publicKey: PublicKeyCredentialCreationOptions };
        expect(Array.from(new Uint8Array(sent.publicKey.challenge as ArrayBuffer))).toEqual([
            1, 2, 3,
        ]);
        expect(sent.publicKey.rp.id).toBe("tempest.dev");
        expect(sent.publicKey.pubKeyCredParams).toEqual(DEFAULT_PUB_KEY_CRED_PARAMS);
        expect(sent.publicKey.timeout).toBe(60_000);
        expect(sent.publicKey.excludeCredentials).toHaveLength(1);

        expect(result).toMatchObject({
            id: "cred-id",
            rawId: "yMk",
            type: "public-key",
            authenticatorAttachment: "platform",
            response: { clientDataJSON: "AQID", attestationObject: "BAUG" },
            clientExtensionResults: { credProps: { rk: true } },
        });
    });

    it("omits the browser extras the engine does not expose", async () => {
        const { instance } = client();
        const result = await instance.register(
            creationOptionsJSON() as unknown as PasskeyCreationOptionsJSON,
        );
        expect(result.response.transports).toBeUndefined();
        expect(result.response.publicKey).toBeUndefined();
        expect(result.response.authenticatorData).toBeUndefined();
        expect(result.response.publicKeyAlgorithm).toBeUndefined();
    });

    it("forwards the browser extras when they are available", async () => {
        const { instance } = client({
            create: async () =>
                new FakeCredential({
                    response: new FakeAttestationResponse({
                        transports: ["internal", "hybrid"],
                        publicKey: bufferOf(1, 2, 3),
                        publicKeyAlgorithm: -7,
                        authenticatorData: bufferOf(4, 5, 6),
                    }),
                }),
        });
        const result = await instance.register(
            creationOptionsJSON() as unknown as PasskeyCreationOptionsJSON,
        );
        expect(result.response).toMatchObject({
            transports: ["internal", "hybrid"],
            publicKey: "AQID",
            publicKeyAlgorithm: -7,
            authenticatorData: "BAUG",
        });
    });

    it("reports a missing attachment as null rather than undefined", async () => {
        const { instance } = client({
            create: async () =>
                new FakeCredential({
                    response: new FakeAttestationResponse(),
                    authenticatorAttachment: null,
                }),
        });
        const result = await instance.register(
            creationOptionsJSON() as unknown as PasskeyCreationOptionsJSON,
        );
        expect(result.authenticatorAttachment).toBeNull();
    });

    it("treats a null public key from getPublicKey as absent", async () => {
        const { instance } = client({
            create: async () =>
                new FakeCredential({
                    response: new FakeAttestationResponse({ publicKey: null }),
                }),
        });
        const result = await instance.register(
            creationOptionsJSON() as unknown as PasskeyCreationOptionsJSON,
        );
        expect(result.response.publicKey).toBeUndefined();
    });

    it("prefers the server's own algorithm list, timeout and rp id", async () => {
        const { create, instance } = client({ rpId: "ignored.dev", timeoutMs: 1000 });
        await instance.register(
            creationOptionsJSON({
                rp: { name: "Tempest", id: "acme.com" },
                pubKeyCredParams: [{ type: "public-key", alg: -7 }],
                timeout: 90_000,
                authenticatorSelection: { userVerification: "required" },
                attestation: "direct",
            }) as unknown as PasskeyCreationOptionsJSON,
        );
        const sent = create.mock.calls[0]![0] as { publicKey: PublicKeyCredentialCreationOptions };
        expect(sent.publicKey.rp.id).toBe("acme.com");
        expect(sent.publicKey.timeout).toBe(90_000);
        expect(sent.publicKey.pubKeyCredParams).toHaveLength(1);
        expect(sent.publicKey.attestation).toBe("direct");
    });

    it("classifies a rejected ceremony", async () => {
        track(setSecureContext(true));
        const { instance } = client({
            create: async () => {
                throw new DOMException("x", "InvalidStateError");
            },
        });
        await expect(
            instance.register(creationOptionsJSON() as unknown as PasskeyCreationOptionsJSON),
        ).rejects.toMatchObject({ kind: "already-registered" });
    });

    it("rejects when the authenticator resolves with nothing", async () => {
        const { instance } = client({ create: async () => null });
        await expect(
            instance.register(creationOptionsJSON() as unknown as PasskeyCreationOptionsJSON),
        ).rejects.toMatchObject({ kind: "unknown" });
    });

    it("passes the abort signal through", async () => {
        const { create, instance } = client();
        const controller = new AbortController();
        await instance.register(creationOptionsJSON() as unknown as PasskeyCreationOptionsJSON, {
            signal: controller.signal,
        });
        expect((create.mock.calls[0]![0] as { signal?: AbortSignal }).signal).toBe(
            controller.signal,
        );
    });
});

describe("createPasskeyClient — authentication", () => {
    it("serializes the assertion the backend has to verify", async () => {
        const { get, instance } = client({ rpId: "tempest.dev" });
        const result = await instance.authenticate(
            requestOptionsJSON({
                allowCredentials: [{ id: "AQID", type: "public-key" }],
                userVerification: "preferred",
            }) as unknown as PasskeyRequestOptionsJSON,
        );

        const sent = get.mock.calls[0]![0] as { publicKey: PublicKeyCredentialRequestOptions };
        expect(sent.publicKey.rpId).toBe("tempest.dev");
        expect(sent.publicKey.allowCredentials).toHaveLength(1);
        expect(result).toMatchObject({
            id: "cred-id",
            response: {
                clientDataJSON: "AQID",
                authenticatorData: "Bwg",
                signature: "CQoL",
                userHandle: "_w",
            },
        });
    });

    it("reports a missing user handle and attachment as null", async () => {
        const { instance } = client({
            get: async () =>
                new FakeCredential({
                    response: new FakeAssertionResponse(null),
                    authenticatorAttachment: null,
                }),
        });
        const result = await instance.authenticate(
            requestOptionsJSON() as unknown as PasskeyRequestOptionsJSON,
        );
        expect(result.response.userHandle).toBeNull();
        expect(result.authenticatorAttachment).toBeNull();
    });

    it("leaves allowCredentials undefined for a usernameless flow", async () => {
        const { get, instance } = client();
        await instance.authenticate(requestOptionsJSON() as unknown as PasskeyRequestOptionsJSON);
        const sent = get.mock.calls[0]![0] as { publicKey: PublicKeyCredentialRequestOptions };
        expect(sent.publicKey.allowCredentials).toBeUndefined();
    });

    it("forwards conditional mediation for the autofill flow", async () => {
        const { get, instance } = client();
        await instance.authenticate(requestOptionsJSON() as unknown as PasskeyRequestOptionsJSON, {
            mediation: "conditional",
        });
        expect((get.mock.calls[0]![0] as { mediation?: string }).mediation).toBe("conditional");
    });

    it("classifies a dismissed prompt as cancelled", async () => {
        track(setSecureContext(true));
        const { instance } = client({
            get: async () => {
                throw new DOMException("x", "NotAllowedError");
            },
        });
        await expect(
            instance.authenticate(requestOptionsJSON() as unknown as PasskeyRequestOptionsJSON),
        ).rejects.toMatchObject({ kind: "cancelled" });
    });

    it("rejects when the authenticator resolves with nothing", async () => {
        const { instance } = client({ get: async () => null });
        await expect(
            instance.authenticate(requestOptionsJSON() as unknown as PasskeyRequestOptionsJSON),
        ).rejects.toMatchObject({ kind: "unknown" });
    });

    it("uses the real navigator when no double is injected", async () => {
        const installed = installWebAuthn();
        track(installed.restore);
        const real = createPasskeyClient();
        await real.authenticate(requestOptionsJSON() as unknown as PasskeyRequestOptionsJSON);
        expect(installed.get).toHaveBeenCalledOnce();
        expect(real.isSupported()).toBe(true);
        await expect(real.isPlatformAuthenticatorAvailable()).resolves.toBe(true);
        await expect(real.isConditionalMediationAvailable()).resolves.toBe(true);
    });

    it("refuses up front when WebAuthn is absent", async () => {
        track(removeWebAuthn());
        track(setSecureContext(true));
        const bare = createPasskeyClient();
        await expect(
            bare.register(creationOptionsJSON() as unknown as PasskeyCreationOptionsJSON),
        ).rejects.toMatchObject({ kind: "unsupported", message: expect.stringContaining("not") });
    });

    it("blames http, not the browser, when the page is insecure", async () => {
        track(removeWebAuthn());
        track(setSecureContext(false));
        const bare = createPasskeyClient();
        await expect(
            bare.authenticate(requestOptionsJSON() as unknown as PasskeyRequestOptionsJSON),
        ).rejects.toMatchObject({ kind: "unsupported", message: expect.stringContaining("HTTPS") });
    });
});
