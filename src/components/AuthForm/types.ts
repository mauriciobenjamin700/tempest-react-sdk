import type { ReactNode } from "react";
import type { ControllerFieldState, ControllerRenderProps, FieldValues } from "react-hook-form";
import type { z } from "zod";
import type { DescribeApiErrorOptions } from "@/http/describe-api-error";

/**
 * Which SDK control renders a field.
 *
 * `text` and `email` → `Input`, `password` → `PasswordInput`, `phone` / `cpf` /
 * `cnpj` → the masked inputs, `checkbox` → `Checkbox`, `pin` → `PinInput`. The
 * list is closed on purpose: these are the controls an auth screen uses, and
 * anything else goes through `render`.
 */
export type AuthFieldType =
    "text" | "email" | "password" | "phone" | "cpf" | "cnpj" | "checkbox" | "pin";

/** What a field's `render` receives: the react-hook-form binding plus the field's own config. */
export interface AuthFieldRenderProps {
    /** `name`, `value`, `onChange`, `onBlur` and `ref` — spread or wire them into the control. */
    field: ControllerRenderProps<FieldValues, string>;
    /** The field's validation state, including the server error mapped onto it. */
    fieldState: ControllerFieldState;
    /** The current error message, already resolved from `fieldState`. */
    error?: string;
    /** The config entry this field was declared with. */
    config: AuthField;
}

/**
 * One entry of an auth form's `fields` list.
 *
 * The form is generated from this list, so the app declares *which* fields and
 * *how they read* — never the markup, the wiring to react-hook-form or the error
 * slot.
 *
 * @typeParam TName - The schema's keys, so a typo in `name` fails to compile.
 */
export interface AuthField<TName extends string = string> {
    /** Key in the schema and in the submitted values. */
    name: TName;
    /** Visible label. Rich content works for `checkbox` (a terms link); keep it text for `pin`. */
    label: ReactNode;
    /** Control used to render it. Default `"text"`. */
    type?: AuthFieldType;
    /** Placeholder shown while the field is empty. */
    placeholder?: string;
    /**
     * `autocomplete` token. Defaults per type: `email` → `"email"`, `password` →
     * `"current-password"`, `phone` → `"tel"`. Sign-up and reset presets pass
     * `"new-password"` so password managers offer to generate one.
     */
    autoComplete?: string;
    /** Help text under the field, replaced by the error when there is one. */
    helperText?: ReactNode;
    /** Marks the control as required (visual hint + native attribute). */
    required?: boolean;
    /** `password` only: show the strength meter under the field. */
    showStrength?: boolean;
    /** `pin` only: number of cells. Default `6`. */
    length?: number;
    /** Render the control yourself — for a field none of the types covers. */
    render?: (props: AuthFieldRenderProps) => ReactNode;
}

/** The value object a schema produces, as react-hook-form sees it. */
export type AuthFormValues<TSchema extends z.ZodTypeAny> = z.infer<TSchema> & FieldValues;

/** The field names a schema accepts. */
export type AuthFieldName<TSchema extends z.ZodTypeAny> = Extract<keyof z.infer<TSchema>, string>;

/** Fixed sentences of {@link AuthFormProps}, PT-BR by default. */
export interface AuthFormLabels {
    /** Text of the divider drawn above the `social` slot. Default `"ou"`. */
    divider: string;
    /**
     * Fallback sentence of the error alert, when the thrown error carries nothing
     * better. Default `"Não foi possível concluir agora. Tente de novo."`.
     */
    error: string;
}

export interface AuthFormProps<TSchema extends z.ZodTypeAny> {
    /** Zod schema validating the values; its messages are what each field shows. */
    schema: TSchema;
    /** The fields, in display order. */
    fields: readonly AuthField<AuthFieldName<TSchema>>[];
    /**
     * Called with the validated values. Throw to fail: a `TempestApiError` whose
     * `fields` name fields of this form marks those fields; any other error shows
     * an alert above the form.
     */
    onSubmit: (values: z.infer<TSchema>) => Promise<void> | void;
    /** Submit button content. Default `"Enviar"`. */
    submitLabel?: ReactNode;
    /** Initial values. Fields left out start as `""` (`false` for checkboxes). */
    defaultValues?: Partial<z.input<TSchema>>;
    /** Content between the fields and the submit button — the "forgot password" link. */
    beforeSubmit?: ReactNode;
    /** Content after the submit button — the "no account? sign up" line. */
    afterSubmit?: ReactNode;
    /** Social sign-in buttons. Rendered under a divider reading `labels.divider`. */
    social?: ReactNode;
    /** Overrides for the fixed sentences. */
    labels?: Partial<AuthFormLabels>;
    /** Passed to `describeApiError` to word the alert — map error `codes`, `statuses`. */
    errorOptions?: DescribeApiErrorOptions;
    /** Called with every error `onSubmit` threw, after it is shown — for logging. */
    onError?: (error: unknown) => void;
    /** Class name for the `<form>`. */
    className?: string;
}

/**
 * Props every preset (`LoginForm`, `SignUpForm`, …) shares.
 *
 * `schema` and `fields` become optional — the preset ships both — and the slots
 * around the submit button are the preset's to fill, from its `links`.
 *
 * @typeParam TSchema - The schema in use; the preset's default when none is passed.
 */
export interface AuthPresetProps<TSchema extends z.ZodTypeAny> extends Omit<
    AuthFormProps<TSchema>,
    "schema" | "fields" | "labels" | "beforeSubmit" | "afterSubmit"
> {
    /** Replaces the preset's schema. Pair it with `fields` when it adds or renames keys. */
    schema?: TSchema;
    /** Replaces the preset's field list. */
    fields?: readonly AuthField<AuthFieldName<TSchema>>[];
}
