import { useState } from "react";
import type { ReactNode } from "react";
import { FormProvider } from "react-hook-form";
import type { DefaultValues, FieldValues } from "react-hook-form";
import type { z } from "zod";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Divider } from "@/components/Divider";
import { Form } from "@/components/Form";
import { applyApiFieldErrors } from "@/forms/apply-api-field-errors";
import { useZodForm } from "@/forms/use-zod-form";
import { useDescribeApiError } from "@/http/use-describe-api-error";
import { cn } from "@/utils/cn";
import { AuthFieldControl } from "./AuthFieldControl";
import { DEFAULT_AUTH_FORM_LABELS } from "./auth-defaults";
import type { AuthField, AuthFormLabels, AuthFormProps } from "./types";
import styles from "./AuthForm.module.css";

/**
 * Initial values for every declared field.
 *
 * react-hook-form needs a defined value per field, or the controlled inputs
 * start uncontrolled and React warns on the first keystroke — and a missing
 * checkbox would submit `undefined`, which a `z.boolean()` rejects with a
 * message about types rather than about the terms.
 *
 * @param fields - The declared fields.
 * @param overrides - The caller's `defaultValues`, which win.
 * @returns One value per field.
 */
function initialValues(
    fields: readonly AuthField[],
    overrides: object | undefined,
): Record<string, unknown> {
    const base: Record<string, unknown> = {};
    for (const field of fields) base[field.name] = field.type === "checkbox" ? false : "";
    return { ...base, ...overrides };
}

/**
 * A complete auth form generated from a list of field configs and a zod schema.
 *
 * Every hand-built login and sign-up screen repeated the same wiring: a
 * `useZodForm`, one labelled input per field with its error slot, a password eye,
 * a submit button disabled while the request runs, and a `catch` that copied the
 * 422's field messages back onto the inputs. The app now declares *which* fields
 * and *what happens on submit*; the rest is here, built on the SDK's own controls
 * and its forms layer (`useZodForm` + `FormProvider` + `FormField`).
 *
 * Errors thrown by `onSubmit` are shown, never rethrown — a rethrow from a submit
 * handler is an unhandled rejection with nowhere to go. A `TempestApiError` whose
 * `fields` name fields of this form marks them; anything else, and any field
 * message that matched no declared field, goes to an `Alert` above the fields,
 * worded by `describeApiError`. Pass `onError` to log.
 *
 * @example
 * const schema = z.object({ email: z.email("E-mail inválido") });
 * <AuthForm
 *     schema={schema}
 *     fields={[{ name: "email", type: "email", label: "E-mail" }]}
 *     submitLabel="Continuar"
 *     onSubmit={async (values) => { await api.post("/auth/magic-link", { body: values }); }}
 * />
 */
export function AuthForm<TSchema extends z.ZodTypeAny>({
    schema,
    fields,
    onSubmit,
    submitLabel = "Enviar",
    defaultValues,
    beforeSubmit,
    afterSubmit,
    social,
    labels,
    errorOptions,
    onError,
    className,
}: AuthFormProps<TSchema>): ReactNode {
    const text: AuthFormLabels = { ...DEFAULT_AUTH_FORM_LABELS, ...labels };
    const describe = useDescribeApiError();
    const [failure, setFailure] = useState<string | null>(null);
    const form = useZodForm(schema, {
        defaultValues: initialValues(fields, defaultValues) as DefaultValues<
            z.input<TSchema> & FieldValues
        >,
    });

    const submit = form.handleSubmit(async (values) => {
        setFailure(null);
        try {
            await onSubmit(values);
        } catch (error) {
            const { marked, unmatched } = applyApiFieldErrors(form, error, {
                fields: fields.map((field) => field.name),
            });
            const leftover = Object.values(unmatched);
            if (marked.length === 0) setFailure(describe(error, text.error, errorOptions));
            else if (leftover.length > 0) setFailure(leftover.join(" "));
            onError?.(error);
        }
    });

    return (
        <FormProvider {...form}>
            <Form noValidate onSubmit={submit} className={cn(styles.form, className)}>
                {failure !== null && <Alert variant="danger" description={failure} />}
                {fields.map((field) => (
                    <AuthFieldControl key={field.name} config={field} />
                ))}
                {beforeSubmit}
                <Button type="submit" fullWidth size="lg" loading={form.formState.isSubmitting}>
                    {submitLabel}
                </Button>
                {social !== undefined && (
                    <>
                        <Divider label={text.divider} />
                        <div className={styles.social}>{social}</div>
                    </>
                )}
                {afterSubmit}
            </Form>
        </FormProvider>
    );
}
