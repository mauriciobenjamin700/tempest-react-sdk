import { useState } from "react";
import {
    bytesToBase64Url,
    usePasskeyRegistration,
    usePasskeySignIn,
    type PasskeyAuthenticationJSON,
    type PasskeyCreationOptionsJSON,
    type PasskeyRegistrationJSON,
    type PasskeyRequestOptionsJSON,
} from "tempest-react-sdk";
import { Example } from "../Example";

/**
 * Mint a base64url challenge in the page.
 *
 * The gallery has no backend, so the "server" half lives here. Everything after it —
 * the two ceremonies, the serialization, the error classification — is the real SDK
 * talking to the real `navigator.credentials`.
 */
function challenge(): string {
    return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

const USER_HANDLE = bytesToBase64Url(new TextEncoder().encode("gallery-user-1"));

/**
 * Passkeys demo, with a fake backend and real ceremonies.
 *
 * Clicking a button really calls `navigator.credentials`, so what you see is what an
 * app would see: the platform sheet on a machine with Touch ID or Windows Hello, and
 * otherwise the genuine classified error (`cancelled`, `rp-mismatch`, `unsupported`).
 * Faking the authenticator would hide exactly the states worth looking at.
 */
export function PasskeysSection() {
    const [credentialId, setCredentialId] = useState<string | null>(null);

    const registration = usePasskeyRegistration<PasskeyRegistrationJSON>({
        getOptions: async (): Promise<PasskeyCreationOptionsJSON> => ({
            challenge: challenge(),
            rp: { name: "Tempest Gallery" },
            user: {
                id: USER_HANDLE,
                name: "ada@tempest.dev",
                displayName: "Ada Lovelace",
            },
            authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
            excludeCredentials: credentialId
                ? [{ id: credentialId, type: "public-key" }]
                : undefined,
        }),
        verify: async (credential) => {
            setCredentialId(credential.rawId);
            return credential;
        },
    });

    const signIn = usePasskeySignIn<PasskeyAuthenticationJSON>({
        getOptions: async (): Promise<PasskeyRequestOptionsJSON> => ({ challenge: challenge() }),
        verify: async (assertion) => assertion,
    });

    return (
        <section className="gallery-section" id="recipe-passkeys">
            <h3>Passkeys (WebAuthn)</h3>
            <p className="description">
                Login sem senha. O SDK cobre a metade do cliente — as duas cerimônias, o encanamento
                base64url, os sondadores de capacidade e a classificação de erro. O
                &ldquo;servidor&rdquo; desta demo mora nesta página; tudo depois dele é real.
            </p>

            <Example
                id="passkey-capabilities"
                title="Capacidades — o que este aparelho pode"
                note="Os três sondadores respondem de verdade, agora. Uma UI que oferece passkey num aparelho sem autenticador manda a pessoa pra uma folha que só dá cancelar."
                code={`import { usePasskeyCapabilities } from "tempest-react-sdk";

const { supported, platformAvailable, conditionalAvailable } = usePasskeyCapabilities();

if (platformAvailable === null) return null;          // sondador assíncrono, ainda não sei
if (!platformAvailable) return <UsarMeuCelular />;    // dá, mas em dois passos
return <BotaoPasskey />;`}
            >
                <ul className="gallery-stack">
                    <li>
                        <code>isPasskeySupported()</code> → <b>{String(registration.supported)}</b>
                    </li>
                    <li>
                        <code>isPlatformAuthenticatorAvailable()</code> →{" "}
                        <b>{String(registration.platformAvailable)}</b>
                    </li>
                    <li>
                        <code>isConditionalMediationAvailable()</code> →{" "}
                        <b>{String(registration.conditionalAvailable)}</b>
                    </li>
                </ul>
            </Example>

            <Example
                id="passkey-registration"
                title="usePasskeyRegistration — criar a passkey"
                note="Chama navigator.credentials.create() de verdade. Sem autenticador no aparelho você vê o erro classificado, que é justamente o caso que a UI precisa tratar."
                code={`const passkey = usePasskeyRegistration({
  getOptions: () => api.post("/api/webauthn/register/begin"),
  verify: (credential) => api.post("/api/webauthn/register/finish", { body: credential }),
});

<button onClick={() => void passkey.register()} disabled={passkey.status === "prompting"}>
  {passkey.status === "prompting" ? "Confirme no aparelho…" : "Criar passkey"}
</button>`}
                props={[
                    {
                        name: "getOptions",
                        type: "() => Promise<PasskeyCreationOptionsJSON>",
                        description: "Sua rota begin. O servidor sorteia o challenge.",
                    },
                    {
                        name: "verify",
                        type: "(credential) => Promise<T>",
                        description: "Sua rota finish. Recebe o JSON serializado pelo SDK.",
                    },
                    {
                        name: "status",
                        type: '"idle" | "prompting" | "verifying" | "success" | "error"',
                        description: "prompting = folha aberta; verifying = seu backend checando.",
                    },
                    {
                        name: "error.kind",
                        type: "PasskeyErrorKind",
                        description:
                            "cancelled (cancelou OU expirou), already-registered (sucesso!), rp-mismatch…",
                    },
                ]}
            >
                <div className="gallery-stack">
                    <button
                        type="button"
                        onClick={() => void registration.register()}
                        disabled={
                            registration.status === "prompting" ||
                            registration.status === "verifying"
                        }
                    >
                        {registration.status === "prompting"
                            ? "Confirme no aparelho…"
                            : "Criar passkey"}
                    </button>
                    <p>
                        status: <code>{registration.status}</code>
                    </p>
                    {registration.error && (
                        <p role="alert">
                            <code>{registration.error.kind}</code> — {registration.error.message}
                        </p>
                    )}
                    {credentialId && (
                        <p>
                            credencial criada: <code>{credentialId.slice(0, 16)}…</code>
                        </p>
                    )}
                </div>
            </Example>

            <Example
                id="passkey-signin"
                title="usePasskeySignIn — entrar, com autofill opcional"
                note='Sem allowCredentials: login sem digitar nada. Com conditional: true o navegador lista as passkeys dentro do próprio campo — e o campo precisa de autocomplete="username webauthn", senão a lista nunca aparece e nenhum erro é emitido.'
                code={`const passkey = usePasskeySignIn({
  conditional: true,
  getOptions: () => api.post("/api/webauthn/signin/begin"),
  verify: (assertion) => api.post("/api/webauthn/signin/finish", { body: assertion }),
});

<input name="email" autoComplete="username webauthn" />
<button onClick={() => void passkey.signIn()}>Entrar com passkey</button>`}
            >
                <div className="gallery-stack">
                    <label htmlFor="passkey-email">E-mail</label>
                    <input id="passkey-email" name="email" autoComplete="username webauthn" />
                    <button type="button" onClick={() => void signIn.signIn()}>
                        Entrar com passkey
                    </button>
                    <p>
                        status: <code>{signIn.status}</code>
                    </p>
                    {signIn.error && (
                        <p role="alert">
                            <code>{signIn.error.kind}</code> — {signIn.error.message}
                        </p>
                    )}
                    {signIn.data && <p>assinatura verificada pelo backend de mentira. ✅</p>}
                </div>
            </Example>
        </section>
    );
}
