import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { SIGN_UP_FIELDS } from "./auth-defaults";
import { loginSchema, resetPasswordSchema, signUpSchema } from "./auth-schemas";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { LoginForm } from "./LoginForm";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { SignUpForm } from "./SignUpForm";

/**
 * Render a preset at `/` with stub routes behind its links.
 *
 * @param ui - The preset to render.
 * @returns The Testing Library result.
 */
function renderAtRoot(ui: ReactElement) {
    return render(
        <MemoryRouter>
            <Routes>
                <Route path="/" element={ui} />
                <Route path="/cadastro" element={<p>tela de cadastro</p>} />
                <Route path="/login" element={<p>tela de login</p>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe("loginSchema", () => {
    it("trims and lower-cases the e-mail before validating it", () => {
        expect(loginSchema.parse({ email: "  Ana@X.com ", password: "12345678" })).toEqual({
            email: "ana@x.com",
            password: "12345678",
        });
    });

    it("asks for the e-mail when empty and rejects a malformed one", () => {
        const empty = loginSchema.safeParse({ email: "", password: "12345678" });
        const malformed = loginSchema.safeParse({ email: "ana", password: "12345678" });
        expect(empty.error?.issues[0].message).toBe("Informe seu e-mail");
        expect(malformed.error?.issues[0].message).toBe("Informe um e-mail válido");
    });
});

describe("LoginForm", () => {
    it("renders e-mail, password, the forgot link, the sign-up line and an 'Entrar' button", () => {
        renderAtRoot(
            <LoginForm
                onSubmit={vi.fn()}
                links={{ forgotPassword: "/recuperar", signUp: "/cadastro" }}
            />,
        );
        expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
        expect(screen.getByLabelText("Senha")).toHaveAttribute("autocomplete", "current-password");
        expect(screen.getByRole("link", { name: "Esqueceu a senha?" })).toHaveAttribute(
            "href",
            "/recuperar",
        );
        expect(screen.getByText("Não tem uma conta?")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("link", { name: "Cadastre-se" }));
        expect(screen.getByText("tela de cadastro")).toBeInTheDocument();
    });

    it("omits the links whose route is not set", () => {
        renderAtRoot(<LoginForm onSubmit={vi.fn()} />);
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("submits the normalized e-mail", async () => {
        const onSubmit = vi.fn();
        renderAtRoot(<LoginForm onSubmit={onSubmit} />);
        fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: " Ana@X.com " } });
        fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "12345678" } });
        fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
        await waitFor(() =>
            expect(onSubmit).toHaveBeenCalledWith({ email: "ana@x.com", password: "12345678" }),
        );
    });

    it("translates its sentences through labels", () => {
        renderAtRoot(
            <LoginForm
                onSubmit={vi.fn()}
                submitLabel="Sign in"
                links={{ forgotPassword: "/f", signUp: "/s" }}
                labels={{ forgotPassword: "Forgot?", signUpPrompt: "New here?", signUp: "Join" }}
            />,
        );
        expect(screen.getByRole("link", { name: "Forgot?" })).toBeInTheDocument();
        expect(screen.getByText("New here?")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Join" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    });
});

describe("SignUpForm", () => {
    it("renders name, e-mail and a new password with strength meter by default", () => {
        renderAtRoot(<SignUpForm onSubmit={vi.fn()} links={{ signIn: "/login" }} />);
        expect(screen.getByLabelText("Nome")).toHaveAttribute("autocomplete", "name");
        expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
        expect(screen.getByLabelText("Senha")).toHaveAttribute("autocomplete", "new-password");
        expect(screen.getByText("Muito fraca")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Criar conta" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("link", { name: "Entrar" }));
        expect(screen.getByText("tela de login")).toBeInTheDocument();
    });

    it("takes extra fields and an extended schema — phone and a terms checkbox", async () => {
        const onSubmit = vi.fn();
        const schema = signUpSchema.extend({
            phone: z.string().min(15, "Telefone incompleto"),
            terms: z.literal(true, "Aceite os termos para continuar"),
        });
        renderAtRoot(
            <SignUpForm
                schema={schema}
                fields={[
                    ...SIGN_UP_FIELDS,
                    { name: "phone", type: "phone", label: "Celular" },
                    { name: "terms", type: "checkbox", label: "Aceito os termos" },
                ]}
                onSubmit={onSubmit}
            />,
        );
        fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Ana Souza" } });
        fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ana@x.com" } });
        fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "12345678" } });
        fireEvent.change(screen.getByLabelText("Celular"), { target: { value: "11999998888" } });
        fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
        expect(await screen.findByText("Aceite os termos para continuar")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("checkbox", { name: "Aceito os termos" }));
        fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
        await waitFor(() =>
            expect(onSubmit).toHaveBeenCalledWith({
                name: "Ana Souza",
                email: "ana@x.com",
                password: "12345678",
                phone: "(11) 99999-8888",
                terms: true,
            }),
        );
    });
});

describe("ForgotPasswordForm", () => {
    it("renders the e-mail with its helper text and an 'Enviar link' button", () => {
        renderAtRoot(<ForgotPasswordForm onSubmit={vi.fn()} links={{ signIn: "/login" }} />);
        expect(
            screen.getByText("Enviaremos um link para você criar uma nova senha."),
        ).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Enviar link" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/login");
    });
});

describe("ResetPasswordForm", () => {
    it("reports a mismatch under the confirmation field", async () => {
        const onSubmit = vi.fn();
        renderAtRoot(<ResetPasswordForm onSubmit={onSubmit} />);
        fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "12345678" } });
        fireEvent.change(screen.getByLabelText("Confirme a nova senha"), {
            target: { value: "87654321" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Redefinir senha" }));
        expect(await screen.findByText("As senhas não coincidem")).toBeInTheDocument();
        expect(screen.getByLabelText("Confirme a nova senha")).toHaveAttribute(
            "aria-invalid",
            "true",
        );
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("submits matching passwords", async () => {
        const onSubmit = vi.fn();
        renderAtRoot(<ResetPasswordForm onSubmit={onSubmit} />);
        fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "12345678" } });
        fireEvent.change(screen.getByLabelText("Confirme a nova senha"), {
            target: { value: "12345678" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Redefinir senha" }));
        await waitFor(() =>
            expect(onSubmit).toHaveBeenCalledWith({
                password: "12345678",
                confirmPassword: "12345678",
            }),
        );
    });

    it("lists the hints as a labelled list", () => {
        renderAtRoot(
            <ResetPasswordForm
                onSubmit={vi.fn()}
                hints={["Pelo menos 8 caracteres", "Uma letra maiúscula"]}
            />,
        );
        const list = screen.getByRole("list", { name: "Requisitos da senha" });
        expect(list.querySelectorAll("li")).toHaveLength(2);
    });

    it("keeps the default schema's refinement", () => {
        const result = resetPasswordSchema.safeParse({
            password: "12345678",
            confirmPassword: "x",
        });
        expect(result.error?.issues[0].path).toEqual(["confirmPassword"]);
    });
});
