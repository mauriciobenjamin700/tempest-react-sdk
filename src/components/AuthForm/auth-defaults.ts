import type { AuthField, AuthFormLabels } from "./types";

/** PT-BR defaults of {@link AuthFormLabels}. */
export const DEFAULT_AUTH_FORM_LABELS: AuthFormLabels = {
    divider: "ou",
    error: "Não foi possível concluir agora. Tente de novo.",
};

/**
 * Default fields of `LoginForm`: e-mail and password.
 *
 * Exported, like the other presets' lists, so an app extends the defaults
 * (`[...LOGIN_FIELDS, { name: "remember", type: "checkbox", … }]`) instead of
 * retyping them.
 */
export const LOGIN_FIELDS: readonly AuthField<"email" | "password">[] = [
    { name: "email", type: "email", label: "E-mail", placeholder: "voce@exemplo.com" },
    { name: "password", type: "password", label: "Senha" },
];

/** Default fields of `SignUpForm`: name, e-mail and a password with strength meter. */
export const SIGN_UP_FIELDS: readonly AuthField<"name" | "email" | "password">[] = [
    { name: "name", label: "Nome", autoComplete: "name" },
    { name: "email", type: "email", label: "E-mail", placeholder: "voce@exemplo.com" },
    {
        name: "password",
        type: "password",
        label: "Senha",
        autoComplete: "new-password",
        showStrength: true,
    },
];

/** Default fields of `ForgotPasswordForm`: the e-mail, with a line saying what happens next. */
export const FORGOT_PASSWORD_FIELDS: readonly AuthField<"email">[] = [
    {
        name: "email",
        type: "email",
        label: "E-mail",
        placeholder: "voce@exemplo.com",
        helperText: "Enviaremos um link para você criar uma nova senha.",
    },
];

/** Default fields of `ResetPasswordForm`: new password (with strength meter) and confirmation. */
export const RESET_PASSWORD_FIELDS: readonly AuthField<"password" | "confirmPassword">[] = [
    {
        name: "password",
        type: "password",
        label: "Nova senha",
        autoComplete: "new-password",
        showStrength: true,
    },
    {
        name: "confirmPassword",
        type: "password",
        label: "Confirme a nova senha",
        autoComplete: "new-password",
    },
];
