import type { CSSProperties } from "react";
import { MemoryRouter } from "react-router";
import {
    AuthPage,
    Button,
    LoginForm,
    SIGN_UP_FIELDS,
    SignUpForm,
    TempestApiError,
    signUpSchema,
    useToast,
} from "tempest-react-sdk";
import { z } from "zod";
import { Example } from "../Example";

/**
 * The frame a whole auth screen is shown in.
 *
 * `AuthPage` is a page, sized to the viewport (`min-height: 100dvh`) and switching
 * layout on the viewport width. Inside the half-width demo column of an `Example`
 * a split page would be two 200px columns, so the screens render full width in a
 * bordered frame, with their snippet printed under it.
 */
const FRAME: CSSProperties = {
    border: "1px solid var(--tempest-border)",
    borderRadius: "var(--tempest-radius-lg)",
    overflow: "hidden",
    marginBottom: "var(--tempest-space-4)",
};

const PAGE: CSSProperties = { minHeight: 640 };

const registerSchema = signUpSchema.extend({
    phone: z.string().min(15, "Informe o celular com DDD"),
    terms: z.literal(true, "Aceite os termos para continuar"),
});

/**
 * Simulate the backend of the demo.
 *
 * `erro@exemplo.com` answers like FastAPI's 422 naming the e-mail field, and
 * `senha@exemplo.com` like a 401 with a code — the two paths the form handles
 * on its own. Anything else signs in after a short delay, long enough to see the
 * button's loading state.
 *
 * @param email - The submitted e-mail.
 * @returns Resolves on "success".
 */
async function fakeLogin(email: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (email === "erro@exemplo.com") {
        throw new TempestApiError({
            status: 422,
            detail: "Validation failed",
            fields: { email: "Este e-mail ainda não confirmou o cadastro" },
        });
    }
    if (email === "senha@exemplo.com") {
        throw new TempestApiError({ status: 401, detail: "Unauthorized", code: "UNAUTHORIZED" });
    }
}

const LOGIN_SNIPPET = `<AuthPage
    brand={<Logo />}
    aside={{ content: <p>Seu app, do primeiro acesso em diante.</p> }}
    back="/"
    title="Bem-vindo!"
    subtitle="Entre com sua conta para continuar"
>
    <LoginForm
        onSubmit={async (values) => { await api.post("/auth/login", { body: values }); }}
        errorOptions={{ codes: { UNAUTHORIZED: "E-mail ou senha inválidos." } }}
        links={{ forgotPassword: "/recuperar-senha", signUp: "/cadastro" }}
        social={<GoogleSignIn component={GoogleLogin} onSuccess={signInWithGoogle} />}
    />
</AuthPage>`;

const CARD_SNIPPET = `<AuthPage variant="card" brand={<strong>BusCar</strong>} title="Painel administrativo" subtitle="Acesso restrito">
    <LoginForm onSubmit={signIn} />
</AuthPage>`;

const SIGN_UP_SNIPPET = `const registerSchema = signUpSchema.extend({
    phone: z.string().min(15, "Informe o celular com DDD"),
    terms: z.literal(true, "Aceite os termos para continuar"),
});

<SignUpForm
    schema={registerSchema}
    fields={[
        ...SIGN_UP_FIELDS,
        { name: "phone", type: "phone", label: "Celular" },
        { name: "terms", type: "checkbox", label: <>Aceito os <a href="/termos">termos de uso</a></> },
    ]}
    onSubmit={async (values) => { await api.post("/auth/register", { body: values }); }}
    links={{ signIn: "/login" }}
/>`;

/** Login (split), the admin card and sign-up with extra fields — the shapes of the auth screens. */
export function AuthScreensSection() {
    const toast = useToast();

    return (
        <section className="gallery-section" id="auth-screens">
            <h3>Telas de autenticação</h3>
            <p className="description">
                <code>AuthPage</code> é a casca — folha arredondada no celular, 50/50 a partir de
                768 px, ou card. <code>LoginForm</code>, <code>SignUpForm</code> e os outros presets
                geram o formulário de uma lista de campos. Tente <code>erro@exemplo.com</code> (422
                no campo) ou <code>senha@exemplo.com</code> (401).
            </p>

            <MemoryRouter>
                <div style={FRAME}>
                    <AuthPage
                        as="div"
                        headingLevel={4}
                        style={PAGE}
                        brand={<span>Tempest</span>}
                        aside={{ content: <p>Seu app, do primeiro acesso em diante.</p> }}
                        back="/"
                        title="Bem-vindo!"
                        subtitle="Entre com sua conta para continuar"
                    >
                        <LoginForm
                            onSubmit={async (values) => {
                                await fakeLogin(values.email);
                                toast.success(`Entrou como ${values.email}`);
                            }}
                            errorOptions={{ codes: { UNAUTHORIZED: "E-mail ou senha inválidos." } }}
                            links={{ forgotPassword: "/recuperar-senha", signUp: "/cadastro" }}
                            social={
                                <Button type="button" variant="outline" fullWidth>
                                    Entrar com Google
                                </Button>
                            }
                        />
                    </AuthPage>
                </div>
                <pre className="example-code" tabIndex={0} style={{ marginBottom: 24 }}>
                    <code>{LOGIN_SNIPPET}</code>
                </pre>

                <div style={FRAME}>
                    <AuthPage
                        as="div"
                        variant="card"
                        headingLevel={4}
                        style={PAGE}
                        brand={<strong>BusCar</strong>}
                        title="Painel administrativo"
                        subtitle="Acesso restrito"
                    >
                        <LoginForm
                            onSubmit={async (values) => {
                                await fakeLogin(values.email);
                                toast.success(`Entrou como ${values.email}`);
                            }}
                        />
                    </AuthPage>
                </div>
                <pre className="example-code" tabIndex={0} style={{ marginBottom: 24 }}>
                    <code>{CARD_SNIPPET}</code>
                </pre>

                <Example
                    title="SignUpForm com celular e termos"
                    note="Estende o schema e a lista padrão em vez de reescrever os campos."
                    code={SIGN_UP_SNIPPET}
                >
                    <SignUpForm
                        schema={registerSchema}
                        fields={[
                            ...SIGN_UP_FIELDS,
                            { name: "phone", type: "phone", label: "Celular" },
                            {
                                name: "terms",
                                type: "checkbox",
                                label: (
                                    <>
                                        Aceito os <a href="#auth-screens">termos de uso</a>
                                    </>
                                ),
                            },
                        ]}
                        onSubmit={async (values) => {
                            await new Promise((resolve) => setTimeout(resolve, 500));
                            toast.success(`Conta criada para ${values.name}`);
                        }}
                        links={{ signIn: "/login" }}
                    />
                </Example>
            </MemoryRouter>
        </section>
    );
}
