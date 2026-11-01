import { z } from "zod";

/**
 * An e-mail field: trimmed and lower-cased *before* it is validated.
 *
 * The order is the point. Validating first rejects `" ana@x.com"` pasted with a
 * trailing space from a password manager, and a backend that compares e-mails
 * case-sensitively creates a second account for `Ana@x.com`. An empty value gets
 * its own sentence instead of "e-mail inválido", which reads like an accusation
 * on a field the user simply has not reached yet.
 *
 * @returns A schema producing the normalized address.
 */
export function authEmail(): z.ZodPipe<z.ZodString, z.ZodEmail> {
    return z
        .string()
        .trim()
        .toLowerCase()
        .min(1, "Informe seu e-mail")
        .pipe(z.email("Informe um e-mail válido"));
}

/**
 * A password field with the minimum length every Tempest backend enforces.
 *
 * @param message - Sentence shown below 8 characters.
 * @returns The password schema.
 */
export function authPassword(
    message: string = "A senha deve ter no mínimo 8 caracteres",
): z.ZodString {
    return z.string().min(8, message);
}

/** Default schema of `LoginForm`: normalized e-mail + password of at least 8 characters. */
export const loginSchema = z.object({
    email: authEmail(),
    password: authPassword(),
});

/**
 * Default schema of `SignUpForm`: name, e-mail and password.
 *
 * Exported so an app adds its own fields with `.extend()` instead of rewriting
 * the three it shares with every other app — see the phone and terms example in
 * the docs.
 */
export const signUpSchema = z.object({
    name: z.string().trim().min(3, "Informe seu nome completo"),
    email: authEmail(),
    password: authPassword(),
});

/** Default schema of `ForgotPasswordForm`: the e-mail the reset link goes to. */
export const forgotPasswordSchema = z.object({
    email: authEmail(),
});

/**
 * Default schema of `ResetPasswordForm`: new password and its confirmation.
 *
 * The mismatch is reported on `confirmPassword` (`path`), so the message lands
 * under the field the user has to fix rather than in a form-level alert.
 */
export const resetPasswordSchema = z
    .object({
        password: authPassword(),
        confirmPassword: z.string().min(1, "Confirme a nova senha"),
    })
    .refine((values) => values.password === values.confirmPassword, {
        message: "As senhas não coincidem",
        path: ["confirmPassword"],
    });
