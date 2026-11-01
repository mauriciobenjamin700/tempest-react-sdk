import type { ReactNode } from "react";
import type { z } from "zod";
import { AuthForm } from "./AuthForm";
import { RESET_PASSWORD_FIELDS } from "./auth-defaults";
import { AuthPrompt } from "./AuthLinks";
import { resetPasswordSchema } from "./auth-schemas";
import type { AuthField, AuthFieldName, AuthFormLabels, AuthPresetProps } from "./types";
import styles from "./AuthForm.module.css";

/** Sentences of {@link ResetPasswordForm}, PT-BR by default. */
export interface ResetPasswordFormLabels extends AuthFormLabels {
    /** Default `"Lembrou a senha?"`. */
    signInPrompt: string;
    /** Default `"Entrar"`. */
    signIn: string;
    /** Accessible name of the hints list. Default `"Requisitos da senha"`. */
    hints: string;
}

/** Routes the reset-password form links to. */
export interface ResetPasswordFormLinks {
    /** "Entrar" link, under the form. */
    signIn?: string;
}

export interface ResetPasswordFormProps<
    TSchema extends z.ZodTypeAny = typeof resetPasswordSchema,
> extends AuthPresetProps<TSchema> {
    /**
     * Password requirements listed above the submit button ("Pelo menos 8
     * caracteres", "Uma letra maiúscula"). Kept as text the app writes, because
     * only the backend knows its rules.
     */
    hints?: ReactNode[];
    /** Where the links go. */
    links?: ResetPasswordFormLinks;
    /** Overrides for the fixed sentences. */
    labels?: Partial<ResetPasswordFormLabels>;
}

const DEFAULT_LABELS: Omit<ResetPasswordFormLabels, keyof AuthFormLabels> = {
    signInPrompt: "Lembrou a senha?",
    signIn: "Entrar",
    hints: "Requisitos da senha",
};

/**
 * "Choose a new password" form: password and confirmation, with the mismatch
 * reported under the confirmation field.
 *
 * The reset token stays out of the fields: it comes from the URL, and the app
 * adds it in `onSubmit` — `{ ...values, token }` — where it also decides what an
 * expired token looks like.
 *
 * @example
 * const [params] = useSearchParams();
 * <ResetPasswordForm
 *     hints={["Pelo menos 8 caracteres"]}
 *     onSubmit={async (values) => {
 *         await api.post("/auth/reset-password", { body: { ...values, token: params.get("token") } });
 *     }}
 * />
 */
export function ResetPasswordForm<TSchema extends z.ZodTypeAny = typeof resetPasswordSchema>({
    schema,
    fields,
    hints,
    links,
    labels,
    submitLabel = "Redefinir senha",
    ...props
}: ResetPasswordFormProps<TSchema>): ReactNode {
    const text = { ...DEFAULT_LABELS, ...labels };
    return (
        <AuthForm<TSchema>
            {...props}
            schema={schema ?? (resetPasswordSchema as unknown as TSchema)}
            fields={
                fields ?? (RESET_PASSWORD_FIELDS as readonly AuthField<AuthFieldName<TSchema>>[])
            }
            labels={labels}
            submitLabel={submitLabel}
            beforeSubmit={
                hints !== undefined &&
                hints.length > 0 && (
                    <ul className={styles.hints} aria-label={text.hints}>
                        {hints.map((hint, index) => (
                            <li key={index}>{hint}</li>
                        ))}
                    </ul>
                )
            }
            afterSubmit={
                <AuthPrompt prompt={text.signInPrompt} label={text.signIn} to={links?.signIn} />
            }
        />
    );
}
