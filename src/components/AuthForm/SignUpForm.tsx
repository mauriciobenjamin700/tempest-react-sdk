import type { ReactNode } from "react";
import type { z } from "zod";
import { AuthForm } from "./AuthForm";
import { SIGN_UP_FIELDS } from "./auth-defaults";
import { AuthPrompt } from "./AuthLinks";
import { signUpSchema } from "./auth-schemas";
import type { AuthField, AuthFieldName, AuthFormLabels, AuthPresetProps } from "./types";

/** Sentences of {@link SignUpForm}, PT-BR by default. */
export interface SignUpFormLabels extends AuthFormLabels {
    /** Default `"Já tem uma conta?"`. */
    signInPrompt: string;
    /** Default `"Entrar"`. */
    signIn: string;
}

/** Routes the sign-up form links to. */
export interface SignUpFormLinks {
    /** "Entrar" link, under the form. */
    signIn?: string;
}

export interface SignUpFormProps<
    TSchema extends z.ZodTypeAny = typeof signUpSchema,
> extends AuthPresetProps<TSchema> {
    /** Where the links go. */
    links?: SignUpFormLinks;
    /** Overrides for the fixed sentences. */
    labels?: Partial<SignUpFormLabels>;
}

const DEFAULT_LABELS: Omit<SignUpFormLabels, keyof AuthFormLabels> = {
    signInPrompt: "Já tem uma conta?",
    signIn: "Entrar",
};

/**
 * Sign-up form: name, e-mail and password by default, plus the "Já tem uma conta?"
 * line.
 *
 * Apps differ most here — a phone, a CPF, a terms checkbox — so the usual call
 * passes `fields` and a `schema` built with `signUpSchema.extend({...})`. The
 * password defaults to `new-password` autocomplete, which is what makes a
 * password manager offer to generate one.
 *
 * @example
 * <SignUpForm
 *     schema={signUpSchema.extend({ terms: z.literal(true, "Aceite os termos") })}
 *     fields={[...SIGN_UP_FIELDS, { name: "terms", type: "checkbox", label: "Aceito os termos" }]}
 *     onSubmit={async (values) => { await api.post("/auth/register", { body: values }); }}
 *     links={{ signIn: "/login" }}
 * />
 */
export function SignUpForm<TSchema extends z.ZodTypeAny = typeof signUpSchema>({
    schema,
    fields,
    links,
    labels,
    submitLabel = "Criar conta",
    ...props
}: SignUpFormProps<TSchema>): ReactNode {
    const text = { ...DEFAULT_LABELS, ...labels };
    return (
        <AuthForm<TSchema>
            {...props}
            schema={schema ?? (signUpSchema as unknown as TSchema)}
            fields={fields ?? (SIGN_UP_FIELDS as readonly AuthField<AuthFieldName<TSchema>>[])}
            labels={labels}
            submitLabel={submitLabel}
            afterSubmit={
                <AuthPrompt prompt={text.signInPrompt} label={text.signIn} to={links?.signIn} />
            }
        />
    );
}
