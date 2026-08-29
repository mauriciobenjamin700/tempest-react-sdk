/**
 * @tempest-limits file-lines, function-lines — the WebAuthn client half: the JSON
 * shapes both ceremonies exchange with a backend, base64url ↔ ArrayBuffer, the
 * capability probes and the error classifier. The two ceremonies are near-mirrors
 * that must not drift — register and authenticate encode the same credential fields
 * in the same order — and the file's docstring is also the specification of the four
 * backend routes it expects.
 */

import { base64ToBytes, bytesToBase64 } from "@/utils/base64";

/**
 * Classified reason a passkey ceremony did not produce a credential.
 *
 * The kinds group the raw `DOMException.name` values the way a UI has to branch
 * on them, which is *not* how the spec groups them:
 *
 * - `"cancelled"` covers `NotAllowedError`, which the browser raises both when
 *   the user dismissed the sheet and when the ceremony timed out. They are
 *   indistinguishable **by design** — telling a site "the user has no credential
 *   for you" would leak account existence — so a UI must treat them as one thing.
 * - `"already-registered"` (`InvalidStateError`) is not really a failure: this
 *   device already holds a credential for this user. The correct reaction is
 *   "you are already set up on this device", never a red error.
 * - `"rp-mismatch"` (`SecurityError`) is the single most common integration bug:
 *   `rp.id` must equal the page's domain or a registrable parent of it.
 */
export type PasskeyErrorKind =
    | "unsupported"
    | "insecure"
    | "cancelled"
    | "already-registered"
    | "not-supported"
    | "rp-mismatch"
    | "invalid-options"
    | "aborted"
    | "unknown";

/** Which ceremony was running, so the message can name it. */
export type PasskeyCeremony = "register" | "authenticate";

/**
 * A passkey failure carrying a stable {@link PasskeyErrorKind} plus an English
 * message safe to show a user.
 *
 * A class rather than the plain `{ kind, message }` object the media classifier
 * returns, because these surface by rejecting a promise: an `Error` subclass keeps
 * stack traces, `instanceof` checks and logging intact, and `kind` is what code
 * branches on.
 */
export class PasskeyError extends Error {
    /** Stable, branchable classification. */
    readonly kind: PasskeyErrorKind;

    /**
     * Build a classified passkey error.
     *
     * @param kind - The classification a UI branches on.
     * @param message - English, user-safe explanation.
     * @param cause - The original thrown value, when there was one.
     */
    constructor(kind: PasskeyErrorKind, message: string, cause?: unknown) {
        super(message);
        this.name = "PasskeyError";
        this.kind = kind;
        this.cause = cause;
    }
}

/**
 * Minimal subset of `navigator.credentials` the passkey client touches.
 *
 * Declared here — the `<X>Like` pattern the SDK's adapters use — for two reasons:
 * jsdom has no `navigator.credentials` at all, so tests must inject a double; and
 * `mediation: "conditional"` is newer than some TypeScript DOM libs, which would
 * otherwise reject the call that makes autofill work.
 */
export interface CredentialsContainerLike {
    /** Runs the registration ceremony. */
    create(options: {
        publicKey: PublicKeyCredentialCreationOptions;
        signal?: AbortSignal;
    }): Promise<Credential | null>;
    /** Runs the authentication ceremony. */
    get(options: {
        publicKey: PublicKeyCredentialRequestOptions;
        signal?: AbortSignal;
        mediation?: string;
    }): Promise<Credential | null>;
}

/** How the browser should surface the authentication ceremony. */
export type PasskeyMediation = "optional" | "conditional" | "required" | "silent";

/**
 * Server-issued registration options, in the base64url JSON shape every WebAuthn
 * backend speaks (`PublicKeyCredentialCreationOptionsJSON` in the spec).
 *
 * `challenge`, `user.id` and every `excludeCredentials[].id` are **base64url**
 * strings here and `ArrayBuffer`s in the DOM API. Converting them is the plumbing
 * this client owns.
 */
export interface PasskeyCreationOptionsJSON {
    /** Base64url server challenge. Single-use; the server must remember it. */
    challenge: string;
    /** Relying party. `id` defaults to the client's `rpId`, then to the origin. */
    rp: { name: string; id?: string };
    /** The account. `id` is base64url of an opaque, stable user handle. */
    user: { id: string; name: string; displayName: string };
    /** Allowed COSE algorithms. Defaults to {@link DEFAULT_PUB_KEY_CRED_PARAMS}. */
    pubKeyCredParams?: { type: "public-key"; alg: number }[];
    /** Ceremony timeout in ms. Defaults to the client's `timeoutMs`. */
    timeout?: number;
    /** Credentials this user already has, so the authenticator refuses a duplicate. */
    excludeCredentials?: { id: string; type: "public-key"; transports?: string[] }[];
    /** Resident-key / user-verification / attachment requirements. */
    authenticatorSelection?: AuthenticatorSelectionCriteria;
    /** Attestation conveyance. Leave unset (`"none"`) unless you verify it. */
    attestation?: AttestationConveyancePreference;
    /** Client extension inputs (`credProps`, `largeBlob`, …). */
    extensions?: AuthenticationExtensionsClientInputs;
}

/** Server-issued authentication options, base64url JSON. */
export interface PasskeyRequestOptionsJSON {
    /** Base64url server challenge. */
    challenge: string;
    /** Relying party id. Defaults to the client's `rpId`, then to the origin. */
    rpId?: string;
    /** Ceremony timeout in ms. Defaults to the client's `timeoutMs`. */
    timeout?: number;
    /** Restrict to these credentials. **Omit it** for usernameless / autofill flows. */
    allowCredentials?: { id: string; type: "public-key"; transports?: string[] }[];
    /** Whether the authenticator must verify the user (biometric / PIN). */
    userVerification?: UserVerificationRequirement;
    /** Client extension inputs. */
    extensions?: AuthenticationExtensionsClientInputs;
}

/** What the client sends to the backend to finish registration. */
export interface PasskeyRegistrationJSON {
    /** Base64url credential id. */
    id: string;
    /** Same bytes as `id`; both are sent because servers differ on which they read. */
    rawId: string;
    type: "public-key";
    /** `"platform"` (this device) or `"cross-platform"` (a phone or key). */
    authenticatorAttachment: string | null;
    response: {
        /** Base64url client data — the server re-checks challenge, origin and type. */
        clientDataJSON: string;
        /** Base64url attestation object, holding the new public key. */
        attestationObject: string;
        /** Transports the authenticator advertises, when the browser exposes them. */
        transports?: string[];
        /** COSE algorithm of the new key, when the browser exposes it. */
        publicKeyAlgorithm?: number;
        /** Base64url SPKI public key, when the browser exposes it. */
        publicKey?: string;
        /** Base64url authenticator data, when the browser exposes it. */
        authenticatorData?: string;
    };
    /** Extension outputs — `credProps.rk` tells you whether it is discoverable. */
    clientExtensionResults: AuthenticationExtensionsClientOutputs;
}

/** What the client sends to the backend to finish authentication. */
export interface PasskeyAuthenticationJSON {
    /** Base64url credential id — the server looks up the stored public key by it. */
    id: string;
    /** Same bytes as `id`. */
    rawId: string;
    type: "public-key";
    /** `"platform"` or `"cross-platform"`. */
    authenticatorAttachment: string | null;
    response: {
        /** Base64url client data. */
        clientDataJSON: string;
        /** Base64url authenticator data, carrying the signature counter. */
        authenticatorData: string;
        /** Base64url signature over `authenticatorData || sha256(clientDataJSON)`. */
        signature: string;
        /** Base64url user handle — present on discoverable credentials, else null. */
        userHandle: string | null;
    };
    /** Extension outputs. */
    clientExtensionResults: AuthenticationExtensionsClientOutputs;
}

/** Per-call knobs for {@link PasskeyClient.register}. */
export interface PasskeyRegisterInit {
    /** Cancel the ceremony (closes the browser sheet). */
    signal?: AbortSignal;
}

/** Per-call knobs for {@link PasskeyClient.authenticate}. */
export interface PasskeyAuthenticateInit extends PasskeyRegisterInit {
    /**
     * `"conditional"` is the autofill flow: no modal, the browser offers passkeys
     * inside a field marked `autocomplete="webauthn"`. Requires a `signal`, and
     * only one conditional request may be live per page.
     */
    mediation?: PasskeyMediation;
}

/** Framework-free WebAuthn client. Build one with {@link createPasskeyClient}. */
export interface PasskeyClient {
    /** Run the registration ceremony and return the JSON your backend verifies. */
    register(
        options: PasskeyCreationOptionsJSON,
        init?: PasskeyRegisterInit,
    ): Promise<PasskeyRegistrationJSON>;
    /** Run the authentication ceremony and return the JSON your backend verifies. */
    authenticate(
        options: PasskeyRequestOptionsJSON,
        init?: PasskeyAuthenticateInit,
    ): Promise<PasskeyAuthenticationJSON>;
    /**
     * Whether this client can run a ceremony at all — the WebAuthn API exists, or a
     * `credentials` container was injected.
     */
    isSupported(): boolean;
    /** Whether this device has a built-in authenticator (Face ID, Hello, …). */
    isPlatformAuthenticatorAvailable(): Promise<boolean>;
    /** Whether autofill-driven (`"conditional"`) requests are available. */
    isConditionalMediationAvailable(): Promise<boolean>;
}

/** Options for {@link createPasskeyClient}. */
export interface CreatePasskeyClientOptions {
    /**
     * Default relying-party id, applied when the server options omit one. Must be
     * the page's domain or a registrable parent of it (`app.acme.com` may use
     * `acme.com`, never the other way round).
     */
    rpId?: string;
    /** Default ceremony timeout in ms. Default `60_000`. */
    timeoutMs?: number;
    /** `navigator.credentials` replacement, for tests. */
    credentials?: CredentialsContainerLike;
}

/**
 * COSE algorithms offered when the server sends no `pubKeyCredParams`, in
 * preference order.
 *
 * `-8` is Ed25519, which modern authenticators prefer and which produces the
 * smallest signatures. `-7` is ES256, the one algorithm every WebAuthn
 * authenticator supports. `-257` is RS256, needed for TPM-backed Windows Hello.
 * Offering all three is what avoids a `NotSupportedError` on some device you do
 * not own; a server that cannot verify one of them should send its own list.
 */
export const DEFAULT_PUB_KEY_CRED_PARAMS: { type: "public-key"; alg: number }[] = [
    { type: "public-key", alg: -8 },
    { type: "public-key", alg: -7 },
    { type: "public-key", alg: -257 },
];

/** Static members of `PublicKeyCredential` that are not in every DOM lib yet. */
interface PublicKeyCredentialStatics {
    isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
    isConditionalMediationAvailable?: () => Promise<boolean>;
}

/** The browser-supplied extras on an attestation response, all optional. */
interface AttestationExtras {
    getTransports?: () => string[];
    getPublicKey?: () => ArrayBuffer | null;
    getPublicKeyAlgorithm?: () => number;
    getAuthenticatorData?: () => ArrayBuffer;
}

function publicKeyCredentialStatics(): PublicKeyCredentialStatics | undefined {
    return (globalThis as { PublicKeyCredential?: PublicKeyCredentialStatics }).PublicKeyCredential;
}

/**
 * Decode a base64url string into bytes.
 *
 * WebAuthn transports every binary field as base64url (`-`/`_`, no padding)
 * because that is what survives JSON, while the DOM API insists on
 * `ArrayBuffer`. Getting this pair wrong — usually by feeding plain base64 to
 * `atob` and losing the last byte — is the classic broken-WebAuthn bug, which is
 * why the SDK owns it instead of leaving it to each app.
 *
 * This is the WebAuthn-facing name for {@link base64ToBytes}; the codec itself is
 * shared, so the padding rule has one implementation rather than three.
 *
 * @param value - Base64url text, with or without `=` padding.
 * @returns The decoded bytes.
 */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
    return base64ToBytes(value);
}

/**
 * Encode bytes as an unpadded base64url string.
 *
 * Normalises `ArrayBuffer` to a view — which is what the WebAuthn response
 * fields hand over — and delegates the encoding to {@link bytesToBase64}.
 *
 * @param value - Bytes to encode, as a view or a raw buffer.
 * @returns Base64url text, safe to put in JSON and in a URL.
 */
export function bytesToBase64Url(value: ArrayBuffer | Uint8Array): string {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    return bytesToBase64(bytes, { urlSafe: true });
}

/**
 * Whether this browser exposes WebAuthn at all.
 *
 * Note that "supported" is not "usable": WebAuthn also requires a secure context,
 * and a device may have no authenticator. Use
 * {@link isPlatformAuthenticatorAvailable} before offering a passkey button.
 */
export function isPasskeySupported(): boolean {
    return (
        typeof window !== "undefined" &&
        typeof navigator !== "undefined" &&
        navigator.credentials !== undefined &&
        typeof navigator.credentials.create === "function" &&
        publicKeyCredentialStatics() !== undefined
    );
}

/**
 * Whether the device has a **built-in** authenticator — Face ID, Touch ID,
 * Windows Hello, an Android screen lock.
 *
 * This is the check that decides whether "Entrar com passkey" may be shown at
 * all. `isPasskeySupported()` is true on a desktop with no biometrics and no
 * security key, and offering a passkey there sends the user into a sheet that can
 * only be cancelled. A `false` here does not forbid passkeys — a phone can still
 * be used over hybrid/QR — it means the flow needs a second step, so present it
 * as "usar meu celular", not as one tap.
 *
 * @returns `false` when the API is missing, so a caller never has to null-check.
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
    const statics = publicKeyCredentialStatics();
    if (!statics?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    try {
        return await statics.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
}

/**
 * Whether autofill-driven passkeys (`mediation: "conditional"`) are available.
 *
 * @returns `false` when the API is missing or throws.
 */
export async function isConditionalMediationAvailable(): Promise<boolean> {
    const statics = publicKeyCredentialStatics();
    if (!statics?.isConditionalMediationAvailable) return false;
    try {
        return await statics.isConditionalMediationAvailable();
    } catch {
        return false;
    }
}

/**
 * Map a thrown WebAuthn failure onto a {@link PasskeyError}.
 *
 * The secure-context check runs first for the same reason it does in the media
 * classifier: over plain HTTP the whole API is absent or refuses, and reporting
 * "not supported" sends a developer hunting for a polyfill for something an
 * `https://` URL fixes.
 *
 * @param error - Whatever `navigator.credentials` rejected with.
 * @param ceremony - Which ceremony was running, for the message.
 * @returns The classified error, ready to throw or to show.
 */
export function classifyPasskeyError(error: unknown, ceremony: PasskeyCeremony): PasskeyError {
    if (error instanceof PasskeyError) return error;

    if (typeof window !== "undefined" && !window.isSecureContext) {
        return new PasskeyError("insecure", "Passkeys require a secure (HTTPS) connection.", error);
    }

    if (error instanceof DOMException) {
        switch (error.name) {
            case "NotAllowedError":
                return new PasskeyError(
                    "cancelled",
                    "The passkey prompt was dismissed or timed out. The browser does not say which — it must not reveal whether a credential exists.",
                    error,
                );
            case "InvalidStateError":
                return new PasskeyError(
                    "already-registered",
                    "This device already has a passkey for this account. Sign in with it instead of creating another.",
                    error,
                );
            case "NotSupportedError":
                return new PasskeyError(
                    "not-supported",
                    "No authenticator here supports the requested algorithms. Check the server's pubKeyCredParams.",
                    error,
                );
            case "SecurityError":
                return new PasskeyError(
                    "rp-mismatch",
                    "The relying-party id does not match this origin. rp.id must be the page's domain or a registrable parent of it.",
                    error,
                );
            case "AbortError":
                return new PasskeyError("aborted", "The passkey request was aborted.", error);
        }
    }

    if (error instanceof TypeError) {
        return new PasskeyError(
            "invalid-options",
            `The ${ceremony} options the server sent are malformed. Check that challenge, user.id and credential ids are base64url.`,
            error,
        );
    }

    return new PasskeyError(
        "unknown",
        error instanceof Error
            ? error.message
            : `Unexpected error during the passkey ${ceremony} ceremony.`,
        error,
    );
}

function toDescriptors(
    list: { id: string; type: "public-key"; transports?: string[] }[] | undefined,
): PublicKeyCredentialDescriptor[] | undefined {
    if (!list) return undefined;
    return list.map((item) => ({
        id: base64UrlToBytes(item.id),
        type: item.type,
        transports: item.transports as AuthenticatorTransport[] | undefined,
    }));
}

/**
 * Build a WebAuthn client: the base64url ↔ `ArrayBuffer` plumbing, the two
 * ceremonies, and one classified error type.
 *
 * ## What your backend must do
 *
 * This is the **client half only**, and a WebAuthn client that documents only its
 * own half is unusable. Four routes are yours to implement:
 *
 * 1. `POST /webauthn/register/begin` → a {@link PasskeyCreationOptionsJSON}. Mint a
 *    random `challenge` (≥16 bytes), store it against the session, and list the
 *    user's existing credentials in `excludeCredentials`.
 * 2. `POST /webauthn/register/finish` ← a {@link PasskeyRegistrationJSON}. Verify
 *    the challenge, `origin` and `type` inside `clientDataJSON`, parse the
 *    attestation object, then store the credential id, public key and signature
 *    counter.
 * 3. `POST /webauthn/signin/begin` → a {@link PasskeyRequestOptionsJSON}. New
 *    challenge. Omit `allowCredentials` for a usernameless or autofill flow.
 * 4. `POST /webauthn/signin/finish` ← a {@link PasskeyAuthenticationJSON}. Look the
 *    credential up by `id`, verify the signature over
 *    `authenticatorData || sha256(clientDataJSON)`, and reject a signature counter
 *    that did not grow (a clone). Only then issue your session token.
 *
 * @param options - Defaults applied when the server options omit them.
 * @returns A client usable from anywhere — React, a plain form, a worker.
 *
 * @example
 * const passkeys = createPasskeyClient({ rpId: "acme.com" });
 *
 * const options = await api.post("/webauthn/register/begin");
 * const credential = await passkeys.register(options);
 * await api.post("/webauthn/register/finish", { body: credential });
 */
export function createPasskeyClient(options: CreatePasskeyClientOptions = {}): PasskeyClient {
    const { rpId, timeoutMs = 60_000, credentials } = options;

    function container(): CredentialsContainerLike {
        if (credentials) return credentials;
        if (!isPasskeySupported()) {
            throw new PasskeyError(
                "unsupported",
                typeof window !== "undefined" && !window.isSecureContext
                    ? "Passkeys require a secure (HTTPS) connection."
                    : "This browser does not support passkeys (WebAuthn).",
            );
        }
        return navigator.credentials as unknown as CredentialsContainerLike;
    }

    async function register(
        json: PasskeyCreationOptionsJSON,
        init: PasskeyRegisterInit = {},
    ): Promise<PasskeyRegistrationJSON> {
        const api = container();
        const publicKey: PublicKeyCredentialCreationOptions = {
            challenge: base64UrlToBytes(json.challenge),
            rp: { name: json.rp.name, id: json.rp.id ?? rpId },
            user: {
                id: base64UrlToBytes(json.user.id),
                name: json.user.name,
                displayName: json.user.displayName,
            },
            pubKeyCredParams: json.pubKeyCredParams ?? DEFAULT_PUB_KEY_CRED_PARAMS,
            timeout: json.timeout ?? timeoutMs,
            excludeCredentials: toDescriptors(json.excludeCredentials),
            authenticatorSelection: json.authenticatorSelection,
            attestation: json.attestation,
            extensions: json.extensions,
        };

        let credential: Credential | null;
        try {
            credential = await api.create({ publicKey, signal: init.signal });
        } catch (error) {
            throw classifyPasskeyError(error, "register");
        }
        if (!credential) {
            throw new PasskeyError("unknown", "The authenticator returned no credential.");
        }

        const typed = credential as PublicKeyCredential;
        const response = typed.response as AuthenticatorAttestationResponse & AttestationExtras;
        const publicKeyBytes = response.getPublicKey?.();

        return {
            id: typed.id,
            rawId: bytesToBase64Url(typed.rawId),
            type: "public-key",
            authenticatorAttachment: typed.authenticatorAttachment ?? null,
            response: {
                clientDataJSON: bytesToBase64Url(response.clientDataJSON),
                attestationObject: bytesToBase64Url(response.attestationObject),
                transports: response.getTransports?.(),
                publicKeyAlgorithm: response.getPublicKeyAlgorithm?.(),
                publicKey: publicKeyBytes ? bytesToBase64Url(publicKeyBytes) : undefined,
                authenticatorData: response.getAuthenticatorData
                    ? bytesToBase64Url(response.getAuthenticatorData())
                    : undefined,
            },
            clientExtensionResults: typed.getClientExtensionResults(),
        };
    }

    async function authenticate(
        json: PasskeyRequestOptionsJSON,
        init: PasskeyAuthenticateInit = {},
    ): Promise<PasskeyAuthenticationJSON> {
        const api = container();
        const publicKey: PublicKeyCredentialRequestOptions = {
            challenge: base64UrlToBytes(json.challenge),
            rpId: json.rpId ?? rpId,
            timeout: json.timeout ?? timeoutMs,
            allowCredentials: toDescriptors(json.allowCredentials),
            userVerification: json.userVerification,
            extensions: json.extensions,
        };

        let credential: Credential | null;
        try {
            credential = await api.get({
                publicKey,
                signal: init.signal,
                mediation: init.mediation,
            });
        } catch (error) {
            throw classifyPasskeyError(error, "authenticate");
        }
        if (!credential) {
            throw new PasskeyError("unknown", "The authenticator returned no credential.");
        }

        const typed = credential as PublicKeyCredential;
        const response = typed.response as AuthenticatorAssertionResponse;

        return {
            id: typed.id,
            rawId: bytesToBase64Url(typed.rawId),
            type: "public-key",
            authenticatorAttachment: typed.authenticatorAttachment ?? null,
            response: {
                clientDataJSON: bytesToBase64Url(response.clientDataJSON),
                authenticatorData: bytesToBase64Url(response.authenticatorData),
                signature: bytesToBase64Url(response.signature),
                userHandle: response.userHandle ? bytesToBase64Url(response.userHandle) : null,
            },
            clientExtensionResults: typed.getClientExtensionResults(),
        };
    }

    return {
        register,
        authenticate,
        isSupported: () => credentials !== undefined || isPasskeySupported(),
        isPlatformAuthenticatorAvailable,
        isConditionalMediationAvailable,
    };
}
