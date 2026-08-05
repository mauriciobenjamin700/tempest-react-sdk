/**
 * @tempest-limits file-lines — the hook wraps both ceremonies with the status
 * machine the UI needs (`prompting` and `verifying` are separate because they need
 * different copy) and the capability probes that decide whether to offer the button
 * at all.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useStableCallback } from "../hooks/use-stable-callback";
import {
    classifyPasskeyError,
    createPasskeyClient,
    type PasskeyAuthenticationJSON,
    type PasskeyClient,
    type PasskeyCreationOptionsJSON,
    type PasskeyError,
    type PasskeyRegistrationJSON,
    type PasskeyRequestOptionsJSON,
} from "./passkey";

/**
 * Where a passkey ceremony is.
 *
 * `"prompting"` and `"verifying"` are split because they need different copy:
 * while prompting, the browser sheet is up and the user must touch a sensor;
 * while verifying, your backend is checking the signature and the user should
 * just wait.
 */
export type PasskeyStatus = "idle" | "prompting" | "verifying" | "success" | "error";

/** Capability probes shared by both passkey hooks. */
export interface PasskeyCapabilities {
    /** WebAuthn exists in this browser. Known synchronously. */
    supported: boolean;
    /**
     * This device has a built-in authenticator. `null` until the async probe
     * settles — render nothing passkey-related while it is `null`.
     */
    platformAvailable: boolean | null;
    /** Autofill-driven sign-in is available. `null` until the probe settles. */
    conditionalAvailable: boolean | null;
}

let sharedClient: PasskeyClient | undefined;

/**
 * Lazily built default client, shared by every hook that was not given one.
 *
 * Lazy rather than a module-level constant so that importing the hooks never runs
 * a call the bundler cannot prove side-effect-free — that alone would pin the
 * module into every consumer's bundle.
 */
function defaultClient(): PasskeyClient {
    sharedClient ??= createPasskeyClient();
    return sharedClient;
}

/**
 * Probe what this device can do, once per mount.
 *
 * @param client - Client whose probes to call.
 * @returns The three capability answers, two of them async.
 */
export function usePasskeyCapabilities(client?: PasskeyClient): PasskeyCapabilities {
    const resolved = useMemo(() => client ?? defaultClient(), [client]);
    const [supported] = useState<boolean>(() => resolved.isSupported());
    const [platformAvailable, setPlatformAvailable] = useState<boolean | null>(null);
    const [conditionalAvailable, setConditionalAvailable] = useState<boolean | null>(null);

    useEffect(() => {
        let cancelled = false;
        void resolved.isPlatformAuthenticatorAvailable().then((value) => {
            if (!cancelled) setPlatformAvailable(value);
        });
        void resolved.isConditionalMediationAvailable().then((value) => {
            if (!cancelled) setConditionalAvailable(value);
        });
        return () => {
            cancelled = true;
        };
    }, [resolved]);

    return { supported, platformAvailable, conditionalAvailable };
}

/** Options for {@link usePasskeyRegistration}. */
export interface UsePasskeyRegistrationOptions<TResult> {
    /** Fetch server options — your `POST /webauthn/register/begin`. */
    getOptions: () => Promise<PasskeyCreationOptionsJSON>;
    /** Send the credential to be verified — your `POST /webauthn/register/finish`. */
    verify: (credential: PasskeyRegistrationJSON) => Promise<TResult>;
    /** Client to use. Defaults to a shared `createPasskeyClient()`. */
    client?: PasskeyClient;
    /** Called with whatever `verify` resolved to. */
    onSuccess?: (result: TResult) => void;
    /** Called with the classified failure. */
    onError?: (error: PasskeyError) => void;
}

/** Value returned by {@link usePasskeyRegistration}. */
export interface UsePasskeyRegistrationResult<TResult> extends PasskeyCapabilities {
    /** Run the ceremony. Resolves `null` on failure — read `error` for the reason. */
    register: () => Promise<TResult | null>;
    /** Current phase. */
    status: PasskeyStatus;
    /** Last failure, cleared when a new attempt starts. */
    error: PasskeyError | null;
    /** Whatever `verify` resolved to, on success. */
    data: TResult | null;
    /** Close the browser sheet from your own UI. */
    cancel: () => void;
    /** Back to `"idle"`, clearing `error` and `data`. */
    reset: () => void;
}

/**
 * Register a passkey: fetch options, run `navigator.credentials.create`, hand the
 * credential to your backend.
 *
 * `register()` **resolves** rather than rejects on failure, because every failure
 * here is already state the UI has to render (`error.kind`, `status`). Forcing a
 * `try/catch` around a button handler that also has to set state would only
 * duplicate what the hook holds.
 *
 * @param options - Transport callbacks plus optional client and listeners.
 * @returns Ceremony state, the `register` action, and the capability probes.
 *
 * @example
 * const passkey = usePasskeyRegistration({
 *     getOptions: () => api.post("/webauthn/register/begin"),
 *     verify: (credential) => api.post("/webauthn/register/finish", { body: credential }),
 * });
 *
 * if (passkey.platformAvailable === false) return null;
 * return (
 *     <button onClick={() => void passkey.register()} disabled={passkey.status === "prompting"}>
 *         Criar passkey
 *     </button>
 * );
 */
export function usePasskeyRegistration<TResult = unknown>(
    options: UsePasskeyRegistrationOptions<TResult>,
): UsePasskeyRegistrationResult<TResult> {
    const client = useMemo(() => options.client ?? defaultClient(), [options.client]);
    const capabilities = usePasskeyCapabilities(client);
    const [status, setStatus] = useState<PasskeyStatus>("idle");
    const [error, setError] = useState<PasskeyError | null>(null);
    const [data, setData] = useState<TResult | null>(null);
    const controller = useRef<AbortController | null>(null);

    const getOptions = useStableCallback(options.getOptions);
    const verify = useStableCallback(options.verify);
    const onSuccess = useStableCallback((result: TResult) => options.onSuccess?.(result));
    const onError = useStableCallback((failure: PasskeyError) => options.onError?.(failure));

    const register = useCallback(async (): Promise<TResult | null> => {
        setStatus("prompting");
        setError(null);
        const abort = new AbortController();
        controller.current = abort;
        try {
            const serverOptions = await getOptions();
            const credential = await client.register(serverOptions, { signal: abort.signal });
            setStatus("verifying");
            const result = await verify(credential);
            setData(result);
            setStatus("success");
            onSuccess(result);
            return result;
        } catch (thrown) {
            const failure = classifyPasskeyError(thrown, "register");
            setError(failure);
            setStatus("error");
            onError(failure);
            return null;
        } finally {
            controller.current = null;
        }
    }, [client, getOptions, verify, onSuccess, onError]);

    const cancel = useCallback((): void => {
        controller.current?.abort();
    }, []);

    const reset = useCallback((): void => {
        setStatus("idle");
        setError(null);
        setData(null);
    }, []);

    return { ...capabilities, register, status, error, data, cancel, reset };
}

/** Options for {@link usePasskeySignIn}. */
export interface UsePasskeySignInOptions<TResult> {
    /** Fetch server options — your `POST /webauthn/signin/begin`. */
    getOptions: () => Promise<PasskeyRequestOptionsJSON>;
    /** Send the assertion to be verified — your `POST /webauthn/signin/finish`. */
    verify: (assertion: PasskeyAuthenticationJSON) => Promise<TResult>;
    /** Client to use. Defaults to a shared `createPasskeyClient()`. */
    client?: PasskeyClient;
    /**
     * Arm the autofill flow on mount (`mediation: "conditional"`).
     *
     * The request stays pending, invisibly, until the user picks a passkey from
     * the browser's autofill list — so the field it should appear on needs
     * `autocomplete="username webauthn"`. Only one conditional request may be live
     * per page, and it is aborted on unmount.
     */
    conditional?: boolean;
    /** Called with whatever `verify` resolved to. */
    onSuccess?: (result: TResult) => void;
    /** Called with the classified failure. */
    onError?: (error: PasskeyError) => void;
}

/** Value returned by {@link usePasskeySignIn}. */
export interface UsePasskeySignInResult<TResult> extends PasskeyCapabilities {
    /** Run the modal ceremony. Resolves `null` on failure. */
    signIn: () => Promise<TResult | null>;
    /** Current phase. */
    status: PasskeyStatus;
    /** Last failure, cleared when a new attempt starts. */
    error: PasskeyError | null;
    /** Whatever `verify` resolved to, on success. */
    data: TResult | null;
    /** True while an armed conditional (autofill) request is waiting. */
    conditionalPending: boolean;
    /** Close the browser sheet from your own UI. */
    cancel: () => void;
    /** Back to `"idle"`, clearing `error` and `data`. */
    reset: () => void;
}

/**
 * Sign in with a passkey, with or without the autofill flow.
 *
 * Two ways in, and a good login page wires both. `signIn()` is the explicit
 * button. `conditional: true` arms the pleasant one: the browser lists the user's
 * passkeys inside the username field itself, so signing in is one tap and no
 * password was ever typed. The field must carry
 * `autocomplete="username webauthn"` or the list never appears — the hook cannot
 * do that part for you.
 *
 * A conditional request that is aborted (unmount, or the user typing a password
 * instead) is **not** surfaced as an error: nothing failed, the user chose
 * another door.
 *
 * @param options - Transport callbacks, `conditional`, optional client and listeners.
 * @returns Ceremony state, the `signIn` action, and the capability probes.
 *
 * @example
 * const passkey = usePasskeySignIn({
 *     conditional: true,
 *     getOptions: () => api.post("/webauthn/signin/begin"),
 *     verify: (assertion) => api.post("/webauthn/signin/finish", { body: assertion }),
 *     onSuccess: (session) => auth.setToken(session.access_token),
 * });
 *
 * <input name="email" autoComplete="username webauthn" />
 * <button onClick={() => void passkey.signIn()}>Entrar com passkey</button>
 */
export function usePasskeySignIn<TResult = unknown>(
    options: UsePasskeySignInOptions<TResult>,
): UsePasskeySignInResult<TResult> {
    const client = useMemo(() => options.client ?? defaultClient(), [options.client]);
    const capabilities = usePasskeyCapabilities(client);
    const [status, setStatus] = useState<PasskeyStatus>("idle");
    const [error, setError] = useState<PasskeyError | null>(null);
    const [data, setData] = useState<TResult | null>(null);
    const [conditionalPending, setConditionalPending] = useState(false);
    const controller = useRef<AbortController | null>(null);
    const conditional = options.conditional ?? false;

    const getOptions = useStableCallback(options.getOptions);
    const verify = useStableCallback(options.verify);
    const onSuccess = useStableCallback((result: TResult) => options.onSuccess?.(result));
    const onError = useStableCallback((failure: PasskeyError) => options.onError?.(failure));

    const run = useCallback(
        async (
            mediation: "optional" | "conditional",
            abort: AbortController = new AbortController(),
        ): Promise<TResult | null> => {
            controller.current = abort;
            if (mediation === "optional") {
                setStatus("prompting");
                setError(null);
            }
            try {
                const serverOptions = await getOptions();
                const assertion = await client.authenticate(serverOptions, {
                    mediation,
                    signal: abort.signal,
                });
                setStatus("verifying");
                const result = await verify(assertion);
                setData(result);
                setStatus("success");
                onSuccess(result);
                return result;
            } catch (thrown) {
                const failure = classifyPasskeyError(thrown, "authenticate");
                if (failure.kind === "aborted" && mediation === "conditional") return null;
                setError(failure);
                setStatus("error");
                onError(failure);
                return null;
            } finally {
                controller.current = null;
            }
        },
        [client, getOptions, verify, onSuccess, onError],
    );

    const signIn = useCallback(() => run("optional"), [run]);

    useEffect(() => {
        if (!conditional) return;
        let cancelled = false;
        let abort: AbortController | null = null;

        async function arm(): Promise<void> {
            if (!(await client.isConditionalMediationAvailable())) return;
            if (cancelled) return;
            setConditionalPending(true);
            abort = new AbortController();
            await run("conditional", abort);
            if (!cancelled) setConditionalPending(false);
        }

        void arm();

        return () => {
            cancelled = true;
            abort?.abort();
        };
    }, [conditional, client, run]);

    const cancel = useCallback((): void => {
        controller.current?.abort();
    }, []);

    const reset = useCallback((): void => {
        setStatus("idle");
        setError(null);
        setData(null);
    }, []);

    return {
        ...capabilities,
        signIn,
        status,
        error,
        data,
        conditionalPending,
        cancel,
        reset,
    };
}
