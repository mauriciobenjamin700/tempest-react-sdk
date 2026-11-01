import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { TempestApiError } from "@/http/errors";
import { findA11yViolations, formatA11yViolations } from "../../../test/a11y";
import { AuthForm } from "./AuthForm";
import type { AuthField } from "./types";

const schema = z.object({
    name: z.string().min(3, "Informe seu nome completo"),
    email: z.email("Informe um e-mail válido"),
    password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres"),
    phone: z.string().min(15, "Telefone incompleto"),
    cpf: z.string(),
    cnpj: z.string(),
    pin: z.string(),
    terms: z.boolean().refine((value) => value, "Aceite os termos para continuar"),
});

const ALL_FIELDS: AuthField<keyof z.infer<typeof schema>>[] = [
    { name: "name", label: "Nome" },
    { name: "email", type: "email", label: "E-mail" },
    { name: "password", type: "password", label: "Senha", showStrength: true },
    { name: "phone", type: "phone", label: "Celular" },
    { name: "cpf", type: "cpf", label: "CPF" },
    { name: "cnpj", type: "cnpj", label: "CNPJ" },
    { name: "pin", type: "pin", label: "Código", length: 4 },
    {
        name: "terms",
        type: "checkbox",
        label: (
            <>
                Aceito os <a href="/termos">termos</a>
            </>
        ),
    },
];

/**
 * Render inside a router, since the presets' links are router links.
 *
 * @param ui - The element to render.
 * @returns The Testing Library result.
 */
function renderInRouter(ui: ReactElement) {
    return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const loginSchema = z.object({
    email: z.email("Informe um e-mail válido"),
    password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres"),
});

const LOGIN: AuthField<"email" | "password">[] = [
    { name: "email", type: "email", label: "E-mail" },
    { name: "password", type: "password", label: "Senha" },
];

/**
 * Fill the login fields with values the schema accepts.
 */
function fillLogin(): void {
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ana@x.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "12345678" } });
}

describe("AuthForm", () => {
    it("renders every field type with its SDK control", () => {
        const { container } = renderInRouter(
            <AuthForm schema={schema} fields={ALL_FIELDS} onSubmit={vi.fn()} />,
        );
        expect(screen.getByLabelText("Nome")).toHaveAttribute("type", "text");
        expect(screen.getByLabelText("E-mail")).toHaveAttribute("type", "email");
        expect(screen.getByLabelText("E-mail")).toHaveAttribute("autocomplete", "email");
        expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "password");
        expect(screen.getByLabelText("Senha")).toHaveAttribute("autocomplete", "current-password");
        expect(screen.getByRole("button", { name: "Mostrar senha" })).toBeInTheDocument();
        expect(screen.getByLabelText("Celular")).toHaveAttribute("inputmode", "tel");
        expect(screen.getByLabelText("Celular")).toHaveAttribute("autocomplete", "tel");
        expect(screen.getByLabelText("CPF")).toHaveAttribute("inputmode", "numeric");
        expect(screen.getByLabelText("CNPJ")).toHaveAttribute("inputmode", "numeric");
        expect(screen.getByRole("group", { name: "Código" })).toBeInTheDocument();
        expect(container.querySelectorAll('input[aria-label^="Dígito"]')).toHaveLength(4);
        expect(screen.getByRole("checkbox")).not.toBeChecked();
        expect(screen.getByRole("link", { name: "termos" })).toHaveAttribute("href", "/termos");
    });

    it("masks the BR inputs as the user types", () => {
        renderInRouter(<AuthForm schema={schema} fields={ALL_FIELDS} onSubmit={vi.fn()} />);
        fireEvent.change(screen.getByLabelText("Celular"), { target: { value: "11999998888" } });
        fireEvent.change(screen.getByLabelText("CPF"), { target: { value: "12345678901" } });
        expect(screen.getByLabelText("Celular")).toHaveValue("(11) 99999-8888");
        expect(screen.getByLabelText("CPF")).toHaveValue("123.456.789-01");
    });

    it("shows each schema message under its field and does not submit", async () => {
        const onSubmit = vi.fn();
        renderInRouter(<AuthForm schema={schema} fields={ALL_FIELDS} onSubmit={onSubmit} />);
        fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
        expect(await screen.findByText("Informe seu nome completo")).toBeInTheDocument();
        expect(screen.getByText("Informe um e-mail válido")).toBeInTheDocument();
        expect(screen.getByText("A senha deve ter no mínimo 8 caracteres")).toBeInTheDocument();
        expect(screen.getByText("Telefone incompleto")).toBeInTheDocument();
        expect(screen.getByText("Aceite os termos para continuar")).toBeInTheDocument();
        expect(screen.getByRole("checkbox")).toHaveAttribute("aria-invalid", "true");
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("submits the parsed values, the checkbox as a boolean", async () => {
        const onSubmit = vi.fn();
        const fields: AuthField<"email" | "terms">[] = [
            { name: "email", type: "email", label: "E-mail" },
            { name: "terms", type: "checkbox", label: "Aceito" },
        ];
        renderInRouter(
            <AuthForm
                schema={z.object({ email: z.email(), terms: z.boolean() })}
                fields={fields}
                onSubmit={onSubmit}
            />,
        );
        fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ana@x.com" } });
        fireEvent.click(screen.getByRole("checkbox"));
        fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
        await waitFor(() =>
            expect(onSubmit).toHaveBeenCalledWith({ email: "ana@x.com", terms: true }),
        );
    });

    it("starts from defaultValues", () => {
        renderInRouter(
            <AuthForm
                schema={loginSchema}
                fields={LOGIN}
                defaultValues={{ email: "ana@x.com" }}
                onSubmit={vi.fn()}
            />,
        );
        expect(screen.getByLabelText("E-mail")).toHaveValue("ana@x.com");
        expect(screen.getByLabelText("Senha")).toHaveValue("");
    });

    it("maps a 422's field messages onto the fields and shows no alert", async () => {
        const onError = vi.fn();
        const error = new TempestApiError({
            status: 422,
            detail: "Validation failed",
            fields: { email: "E-mail já cadastrado" },
        });
        renderInRouter(
            <AuthForm
                schema={loginSchema}
                fields={LOGIN}
                onError={onError}
                onSubmit={() => Promise.reject(error)}
            />,
        );
        fillLogin();
        fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
        expect(await screen.findByText("E-mail já cadastrado")).toBeInTheDocument();
        expect(screen.getByLabelText("E-mail")).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByLabelText("E-mail")).toHaveFocus();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(onError).toHaveBeenCalledWith(error);
    });

    it("shows server messages for fields the form does not render in the alert", async () => {
        const error = new TempestApiError({
            status: 422,
            detail: "Validation failed",
            fields: { email: "E-mail já cadastrado", plan: "Plano indisponível" },
        });
        renderInRouter(
            <AuthForm schema={loginSchema} fields={LOGIN} onSubmit={() => Promise.reject(error)} />,
        );
        fillLogin();
        fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
        expect(await screen.findByText("Plano indisponível")).toBeInTheDocument();
        expect(screen.getByText("E-mail já cadastrado")).toBeInTheDocument();
    });

    it("words a non-field error with describeApiError in an alert", async () => {
        const error = new TempestApiError({
            status: 401,
            detail: "Invalid credentials",
            code: "UNAUTHORIZED",
        });
        renderInRouter(
            <AuthForm
                schema={loginSchema}
                fields={LOGIN}
                errorOptions={{ codes: { UNAUTHORIZED: "E-mail ou senha inválidos." } }}
                onSubmit={() => Promise.reject(error)}
            />,
        );
        fillLogin();
        fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
        expect(await screen.findByText("E-mail ou senha inválidos.")).toBeInTheDocument();
    });

    it("falls back to the labels.error sentence for an unknown error", async () => {
        renderInRouter(
            <AuthForm
                schema={loginSchema}
                fields={LOGIN}
                labels={{ error: "Falhou." }}
                onSubmit={() => Promise.reject(new Error("boom"))}
            />,
        );
        fillLogin();
        fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
        expect(await screen.findByText("Falhou.")).toBeInTheDocument();
    });

    it("clears the alert when the next submit succeeds", async () => {
        const onSubmit = vi
            .fn()
            .mockRejectedValueOnce(new Error("boom"))
            .mockResolvedValueOnce(undefined);
        renderInRouter(<AuthForm schema={loginSchema} fields={LOGIN} onSubmit={onSubmit} />);
        fillLogin();
        fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
        const alert = await screen.findByText("Não foi possível concluir agora. Tente de novo.");
        fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
        await waitFor(() => expect(alert).not.toBeInTheDocument());
    });

    it("marks the submit button busy while onSubmit runs", async () => {
        let finish: () => void = () => undefined;
        renderInRouter(
            <AuthForm
                schema={loginSchema}
                fields={LOGIN}
                submitLabel="Entrar"
                onSubmit={() =>
                    new Promise<void>((resolve) => {
                        finish = resolve;
                    })
                }
            />,
        );
        fillLogin();
        const button = screen.getByRole("button", { name: "Entrar" });
        fireEvent.click(button);
        await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
        expect(button).toBeDisabled();
        finish();
        await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
    });

    it("draws an 'ou' divider above the social slot", () => {
        renderInRouter(
            <AuthForm
                schema={loginSchema}
                fields={LOGIN}
                social={<button type="button">Entrar com Google</button>}
                onSubmit={vi.fn()}
            />,
        );
        expect(screen.getByRole("separator")).toHaveTextContent("ou");
        expect(screen.getByRole("button", { name: "Entrar com Google" })).toBeInTheDocument();
    });

    it("draws no divider without a social slot", () => {
        renderInRouter(<AuthForm schema={loginSchema} fields={LOGIN} onSubmit={vi.fn()} />);
        expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    });

    it("renders a field through its render prop with the binding and the error", async () => {
        const fields: AuthField<"code">[] = [
            {
                name: "code",
                label: "Código",
                render: ({ field, error }) => (
                    <label>
                        Código
                        <input
                            value={String(field.value)}
                            onChange={field.onChange}
                            aria-invalid={error ? true : undefined}
                        />
                        {error && <span>{error}</span>}
                    </label>
                ),
            },
        ];
        renderInRouter(
            <AuthForm
                schema={z.object({ code: z.string().length(3, "Três dígitos") })}
                fields={fields}
                onSubmit={vi.fn()}
            />,
        );
        fireEvent.change(screen.getByLabelText("Código"), { target: { value: "12" } });
        fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
        expect(await screen.findByText("Três dígitos")).toBeInTheDocument();
    });

    it("types field names against the schema", () => {
        const typed: AuthField<keyof z.infer<typeof loginSchema>>[] = [
            // @ts-expect-error — "username" is not a key of the schema
            { name: "username", label: "Usuário" },
        ];
        expect(typed).toHaveLength(1);
    });

    it("has no axe violations with every field type and an error shown", async () => {
        const { container } = renderInRouter(
            <AuthForm
                schema={schema}
                fields={ALL_FIELDS}
                social={<button type="button">Google</button>}
                onSubmit={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
        await screen.findByText("Informe seu nome completo");
        const violations = await findA11yViolations(container);
        expect(violations, formatA11yViolations(violations)).toEqual([]);
    });
});
