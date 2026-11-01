import type { ReactNode } from "react";
import type { z } from "zod";
import { AuthForm } from "./AuthForm";
import { FORGOT_PASSWORD_FIELDS } from "./auth-defaults";
import { AuthPrompt } from "./AuthLinks";
import { forgotPasswordSchema } from "./auth-schemas";
import type { AuthField, AuthFieldName, AuthFormLabels, AuthPresetProps } from "./types";

/** Sentences of {@link ForgotPasswordForm}, PT-BR by default. */
export interface ForgotPasswordFormLabels extends AuthFormLabels {
    /** Default `"Lembrou a senha?"`. */
    signInPrompt: string;
    /** Default `"Entrar"`. */
    signIn: string;
}

/** Routes the forgot-password form links to. */
export interface ForgotPasswordFormLinks {
    /** "Entrar" link, under the form. */
    signIn?: string;
}

export interface ForgotPasswordFormProps<
    TSchema extends z.ZodTypeAny = typeof forgotPasswordSchema,
> extends AuthPresetProps<TSchema> {
    /** Where the links go. */
    links?: ForgotPasswordFormLinks;
    /** Overrides for the fixed sentences. */
    labels?: Partial<ForgotPasswordFormLabels>;
}

const DEFAULT_LABELS: Omit<ForgotPasswordFormLabels, keyof AuthFormLabels> = {
    signInPrompt: "Lembrou a senha?",
    signIn: "Entrar",
};

/**
 * "Forgot password" form: the e-mail the reset link goes to.
 *
 * The confirmation screen after a successful submit is the app's call — most
 * backends answer the same whether or not the address exists, so the copy
 * belongs next to the backend's policy, not here.
 *
 * @example
 * const [sent, setSent] = useState(false);
 * <ForgotPasswordForm
 *     onSubmit={async (values) => { await api.post("/auth/forgot-password", { body: values }); setSent(true); }}
 *     links={{ signIn: "/login" }}
 * />
 */
export function ForgotPasswordForm<TSchema extends z.ZodTypeAny = typeof forgotPasswordSchema>({
    schema,
    fields,
    links,
    labels,
    submitLabel = "Enviar link",
    ...props
}: ForgotPasswordFormProps<TSchema>): ReactNode {
    const text = { ...DEFAULT_LABELS, ...labels };
    return (
        <AuthForm<TSchema>
            {...props}
            schema={schema ?? (forgotPasswordSchema as unknown as TSchema)}
            fields={
                fields ?? (FORGOT_PASSWORD_FIELDS as readonly AuthField<AuthFieldName<TSchema>>[])
            }
            labels={labels}
            submitLabel={submitLabel}
            afterSubmit={
                <AuthPrompt prompt={text.signInPrompt} label={text.signIn} to={links?.signIn} />
            }
        />
    );
}
