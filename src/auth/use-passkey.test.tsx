import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    creationOptionsJSON,
    installWebAuthn,
    requestOptionsJSON,
    setSecureContext,
} from "../../test/webauthn-mocks";
import { PasskeyError, type PasskeyClient } from "./passkey";
import {
    usePasskeyCapabilities,
    usePasskeyRegistration,
    usePasskeySignIn,
    type UsePasskeyRegistrationOptions,
    type UsePasskeySignInOptions,
} from "./use-passkey";

const restores: (() => void)[] = [];

afterEach(() => {
    while (restores.length > 0) restores.pop()?.();
});

/** A {@link PasskeyClient} double whose four members are all spies. */
function fakeClient(overrides: Partial<PasskeyClient> = {}): PasskeyClient {
    return {
        register: vi.fn(async () => ({ id: "cred" }) as never),
        authenticate: vi.fn(async () => ({ id: "cred" }) as never),
        isSupported: () => true,
        isPlatformAuthenticatorAvailable: vi.fn(async () => true),
        isConditionalMediationAvailable: vi.fn(async () => true),
        ...overrides,
    };
}

function RegistrationHarness(props: UsePasskeyRegistrationOptions<string>) {
    const passkey = usePasskeyRegistration<string>(props);
    return (
        <div>
            <button type="button" onClick={() => void passkey.register()}>
                criar
            </button>
            <button type="button" onClick={passkey.cancel}>
                cancelar
            </button>
            <button type="button" onClick={passkey.reset}>
                limpar
            </button>
            <p data-testid="status">{passkey.status}</p>
            <p data-testid="kind">{passkey.error?.kind ?? "-"}</p>
            <p data-testid="data">{passkey.data ?? "-"}</p>
            <p data-testid="platform">{String(passkey.platformAvailable)}</p>
            <p data-testid="supported">{String(passkey.supported)}</p>
        </div>
    );
}

function SignInHarness(props: UsePasskeySignInOptions<string>) {
    const passkey = usePasskeySignIn<string>(props);
    return (
        <div>
            <button type="button" onClick={() => void passkey.signIn()}>
                entrar
            </button>
            <button type="button" onClick={passkey.cancel}>
                cancelar
            </button>
            <button type="button" onClick={passkey.reset}>
                limpar
            </button>
            <p data-testid="status">{passkey.status}</p>
            <p data-testid="kind">{passkey.error?.kind ?? "-"}</p>
            <p data-testid="data">{passkey.data ?? "-"}</p>
            <p data-testid="pending">{String(passkey.conditionalPending)}</p>
            <p data-testid="conditional">{String(passkey.conditionalAvailable)}</p>
        </div>
    );
}

describe("usePasskeyCapabilities", () => {
    function CapabilityHarness({ client }: { client?: PasskeyClient }) {
        const { supported, platformAvailable, conditionalAvailable } =
            usePasskeyCapabilities(client);
        return <p>{`${supported}|${String(platformAvailable)}|${String(conditionalAvailable)}`}</p>;
    }

    it("resolves both async probes", async () => {
        render(<CapabilityHarness client={fakeClient()} />);
        await waitFor(() => expect(screen.getByText("true|true|true")).toBeInTheDocument());
    });

    it("falls back to a shared default client", async () => {
        const installed = installWebAuthn({ platformAvailable: false });
        restores.push(installed.restore);
        render(<CapabilityHarness />);
        await waitFor(() => expect(screen.getByText(/\|false\|/)).toBeInTheDocument());
    });

    it("does not set state when the probes land after unmount", async () => {
        const client = fakeClient();
        const { unmount } = render(<CapabilityHarness client={client} />);
        unmount();
        await act(async () => {
            await Promise.resolve();
        });
        expect(client.isPlatformAuthenticatorAvailable).toHaveBeenCalledOnce();
    });
});

describe("usePasskeyRegistration", () => {
    it("walks idle → prompting → verifying → success", async () => {
        const onSuccess = vi.fn();
        const client = fakeClient();
        render(
            <RegistrationHarness
                client={client}
                getOptions={async () => requestOptionsJSON() as never}
                verify={async () => "ok"}
                onSuccess={onSuccess}
            />,
        );

        await userEvent.click(screen.getByText("criar"));
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("success"));
        expect(screen.getByTestId("data")).toHaveTextContent("ok");
        expect(onSuccess).toHaveBeenCalledWith("ok");
        expect(client.register).toHaveBeenCalledOnce();
    });

    it("falls back to the shared client when none is injected", async () => {
        const installed = installWebAuthn();
        restores.push(installed.restore);
        render(
            <RegistrationHarness
                getOptions={async () => creationOptionsJSON() as never}
                verify={async () => "ok"}
            />,
        );

        await userEvent.click(screen.getByText("criar"));
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("success"));
        expect(installed.create).toHaveBeenCalledOnce();
        expect(screen.getByTestId("supported")).toHaveTextContent("true");
    });

    it("classifies a rejected ceremony and reports it as state, not a throw", async () => {
        restores.push(setSecureContext(true));
        const onError = vi.fn();
        render(
            <RegistrationHarness
                client={fakeClient({
                    register: vi.fn(async () => {
                        throw new DOMException("x", "InvalidStateError");
                    }),
                })}
                getOptions={async () => requestOptionsJSON() as never}
                verify={async () => "ok"}
                onError={onError}
            />,
        );

        await userEvent.click(screen.getByText("criar"));
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));
        expect(screen.getByTestId("kind")).toHaveTextContent("already-registered");
        expect(onError).toHaveBeenCalledWith(expect.any(PasskeyError));
    });

    it("surfaces a failure from the caller's own backend call", async () => {
        restores.push(setSecureContext(true));
        render(
            <RegistrationHarness
                client={fakeClient()}
                getOptions={async () => {
                    throw new Error("500 do begin");
                }}
                verify={async () => "ok"}
            />,
        );

        await userEvent.click(screen.getByText("criar"));
        await waitFor(() => expect(screen.getByTestId("kind")).toHaveTextContent("unknown"));
    });

    it("aborts the ceremony on cancel", async () => {
        restores.push(setSecureContext(true));
        const register = vi.fn(
            (_options: unknown, init?: { signal?: AbortSignal }) =>
                new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener("abort", () =>
                        reject(new DOMException("Aborted", "AbortError")),
                    );
                }) as never,
        );
        render(
            <RegistrationHarness
                client={fakeClient({ register })}
                getOptions={async () => requestOptionsJSON() as never}
                verify={async () => "ok"}
            />,
        );

        await userEvent.click(screen.getByText("criar"));
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("prompting"));
        await userEvent.click(screen.getByText("cancelar"));
        await waitFor(() => expect(screen.getByTestId("kind")).toHaveTextContent("aborted"));
    });

    it("cancelling with nothing in flight is a no-op", async () => {
        render(
            <RegistrationHarness
                client={fakeClient()}
                getOptions={async () => requestOptionsJSON() as never}
                verify={async () => "ok"}
            />,
        );
        await userEvent.click(screen.getByText("cancelar"));
        expect(screen.getByTestId("status")).toHaveTextContent("idle");
    });

    it("resets back to idle", async () => {
        render(
            <RegistrationHarness
                client={fakeClient()}
                getOptions={async () => requestOptionsJSON() as never}
                verify={async () => "ok"}
            />,
        );

        await userEvent.click(screen.getByText("criar"));
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("success"));
        await userEvent.click(screen.getByText("limpar"));
        expect(screen.getByTestId("status")).toHaveTextContent("idle");
        expect(screen.getByTestId("data")).toHaveTextContent("-");
    });
});

describe("usePasskeySignIn", () => {
    it("signs in through the modal ceremony", async () => {
        const onSuccess = vi.fn();
        render(
            <SignInHarness
                client={fakeClient()}
                getOptions={async () => requestOptionsJSON() as never}
                verify={async () => "session"}
                onSuccess={onSuccess}
            />,
        );

        await userEvent.click(screen.getByText("entrar"));
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("success"));
        expect(screen.getByTestId("data")).toHaveTextContent("session");
        expect(onSuccess).toHaveBeenCalledWith("session");
    });

    it("falls back to the shared client when none is injected", async () => {
        const installed = installWebAuthn();
        restores.push(installed.restore);
        render(
            <SignInHarness
                getOptions={async () => requestOptionsJSON() as never}
                verify={async () => "session"}
            />,
        );

        await userEvent.click(screen.getByText("entrar"));
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("success"));
        expect(installed.get).toHaveBeenCalledOnce();
    });

    it("reports a dismissed prompt", async () => {
        restores.push(setSecureContext(true));
        render(
            <SignInHarness
                client={fakeClient({
                    authenticate: vi.fn(async () => {
                        throw new DOMException("x", "NotAllowedError");
                    }),
                })}
                getOptions={async () => requestOptionsJSON() as never}
                verify={async () => "session"}
            />,
        );

        await userEvent.click(screen.getByText("entrar"));
        await waitFor(() => expect(screen.getByTestId("kind")).toHaveTextContent("cancelled"));
    });

    it("arms the autofill flow and signs in from it", async () => {
        const client = fakeClient();
        render(
            <SignInHarness
                conditional
                client={client}
                getOptions={async () => requestOptionsJSON() as never}
                verify={async () => "session"}
            />,
        );

        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("success"));
        expect(client.authenticate).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ mediation: "conditional" }),
        );
        expect(screen.getByTestId("pending")).toHaveTextContent("false");
    });

    it("does not arm autofill when the browser cannot do it", async () => {
        const client = fakeClient({
            isConditionalMediationAvailable: vi.fn(async () => false),
        });
        render(
            <SignInHarness
                conditional
                client={client}
                getOptions={async () => requestOptionsJSON() as never}
                verify={async () => "session"}
            />,
        );

        await waitFor(() => expect(screen.getByTestId("conditional")).toHaveTextContent("false"));
        expect(client.authenticate).not.toHaveBeenCalled();
    });

    it("does not arm autofill when the caller did not ask for it", async () => {
        const client = fakeClient();
        render(
            <SignInHarness
                client={client}
                getOptions={async () => requestOptionsJSON() as never}
                verify={async () => "session"}
            />,
        );
        await waitFor(() => expect(screen.getByTestId("conditional")).toHaveTextContent("true"));
        expect(client.authenticate).not.toHaveBeenCalled();
    });

    it("cancels the modal ceremony and then resets", async () => {
        restores.push(setSecureContext(true));
        const authenticate = vi.fn(
            (_options: unknown, init?: { signal?: AbortSignal }) =>
                new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener("abort", () =>
                        reject(new DOMException("Aborted", "AbortError")),
                    );
                }) as never,
        );
        render(
            <SignInHarness
                client={fakeClient({ authenticate })}
                getOptions={async () => requestOptionsJSON() as never}
                verify={async () => "session"}
            />,
        );

        await userEvent.click(screen.getByText("entrar"));
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("prompting"));
        await userEvent.click(screen.getByText("cancelar"));
        await waitFor(() => expect(screen.getByTestId("kind")).toHaveTextContent("aborted"));

        await userEvent.click(screen.getByText("limpar"));
        expect(screen.getByTestId("status")).toHaveTextContent("idle");
        expect(screen.getByTestId("kind")).toHaveTextContent("-");
    });

    it("treats an aborted autofill request as nothing happening", async () => {
        restores.push(setSecureContext(true));
        const authenticate = vi.fn(
            (_options: unknown, init?: { signal?: AbortSignal }) =>
                new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener("abort", () =>
                        reject(new DOMException("Aborted", "AbortError")),
                    );
                }) as never,
        );
        const { unmount } = render(
            <SignInHarness
                conditional
                client={fakeClient({ authenticate })}
                getOptions={async () => requestOptionsJSON() as never}
                verify={async () => "session"}
            />,
        );

        await waitFor(() => expect(screen.getByTestId("pending")).toHaveTextContent("true"));
        await act(async () => {
            unmount();
        });
        expect(authenticate).toHaveBeenCalledOnce();
    });
});
