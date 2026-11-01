import type { ReactNode } from "react";
import type { z } from "zod";
import { AuthForm } from "./AuthForm";
import { LOGIN_FIELDS } from "./auth-defaults";
import { AuthLink, AuthPrompt } from "./AuthLinks";
import { loginSchema } from "./auth-schemas";
import type { AuthField, AuthFieldName, AuthFormLabels, AuthPresetProps } from "./types";
import styles from "./AuthForm.module.css";

/** Sentences of {@link LoginForm}, PT-BR by default. */
export interface LoginFormLabels extends AuthFormLabels {
    /** Default `"Esqueceu a senha?"`. */
    forgotPassword: string;
    /** Default `"Não tem uma conta?"`. */
    signUpPrompt: string;
    /** Default `"Cadastre-se"`. */
    signUp: string;
}

/** Routes the login form links to. Each link is rendered only when its route is set. */
export interface LoginFormLinks {
    /** "Esqueceu a senha?" link, above the submit button. */
    forgotPassword?: string;
    /** "Cadastre-se" link, under the form. */
    signUp?: string;
}

export interface LoginFormProps<
    TSchema extends z.ZodTypeAny = typeof loginSchema,
> extends AuthPresetProps<TSchema> {
    /** Where the links go. */
    links?: LoginFormLinks;
    /** Overrides for the fixed sentences. */
    labels?: Partial<LoginFormLabels>;
}

const DEFAULT_LABELS: Omit<LoginFormLabels, keyof AuthFormLabels> = {
    forgotPassword: "Esqueceu a senha?",
    signUpPrompt: "Não tem uma conta?",
    signUp: "Cadastre-se",
};

/**
 * Sign-in form: e-mail and password, "forgot password" link, sign-up line and a
 * slot for social buttons.
 *
 * `AuthForm` with the defaults every app wrote by hand: the e-mail trimmed and
 * lower-cased before validation, `current-password` autocomplete so the saved
 * password is offered, and the two links in the place users look for them. What
 * happens on success — storing the session, redirecting — stays in `onSubmit`.
 *
 * @example
 * <LoginForm
 *     onSubmit={async (values) => { await auth.login(values); navigate("/"); }}
 *     links={{ forgotPassword: "/recuperar-senha", signUp: "/cadastro" }}
 *     social={<GoogleSignIn component={GoogleLogin} onSuccess={signInWithGoogle} />}
 * />
 */
export function LoginForm<TSchema extends z.ZodTypeAny = typeof loginSchema>({
    schema,
    fields,
    links,
    labels,
    submitLabel = "Entrar",
    ...props
}: LoginFormProps<TSchema>): ReactNode {
    const text = { ...DEFAULT_LABELS, ...labels };
    return (
        <AuthForm<TSchema>
            {...props}
            schema={schema ?? (loginSchema as unknown as TSchema)}
            fields={fields ?? (LOGIN_FIELDS as readonly AuthField<AuthFieldName<TSchema>>[])}
            labels={labels}
            submitLabel={submitLabel}
            beforeSubmit={
                links?.forgotPassword !== undefined && (
                    <AuthLink to={links.forgotPassword} className={styles.forgot}>
                        {text.forgotPassword}
                    </AuthLink>
                )
            }
            afterSubmit={
                <AuthPrompt prompt={text.signUpPrompt} label={text.signUp} to={links?.signUp} />
            }
        />
    );
}
