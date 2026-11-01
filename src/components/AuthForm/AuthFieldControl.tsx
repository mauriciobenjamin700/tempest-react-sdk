import { useId } from "react";
import type { ReactElement, ReactNode } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Checkbox } from "@/components/Checkbox";
import { ErrorText } from "@/components/ErrorText";
import { Input } from "@/components/Input";
import { PasswordInput } from "@/components/PasswordInput";
import { PinInput } from "@/components/PinInput";
import { FormField } from "@/forms/FormField";
import { CNPJInput, CPFInput, PhoneInput } from "@/forms/masked-inputs";
import type { AuthField } from "./types";

/**
 * Default `autocomplete` token per field type.
 *
 * These are what password managers and mobile keyboards key on; a login form
 * without them is the one where the saved password never gets offered.
 */
const AUTOCOMPLETE: Partial<Record<NonNullable<AuthField["type"]>, string>> = {
    email: "email",
    password: "current-password",
    phone: "tel",
};

/**
 * Build the SDK control for a value-typed field.
 *
 * Returned bare, without value or handlers: `FormField` clones it with the
 * react-hook-form binding, the label and the error.
 *
 * @param config - The field's config entry.
 * @returns The control element.
 */
function controlFor(config: AuthField): ReactElement {
    const autoComplete = config.autoComplete ?? AUTOCOMPLETE[config.type ?? "text"];
    const shared = { placeholder: config.placeholder, autoComplete };
    switch (config.type) {
        case "password":
            return <PasswordInput {...shared} showStrength={config.showStrength} />;
        case "phone":
            return <PhoneInput {...shared} />;
        case "cpf":
            return <CPFInput {...shared} />;
        case "cnpj":
            return <CNPJInput {...shared} />;
        case "pin":
            return <PinInput length={config.length} />;
        case "email":
            return <Input {...shared} type="email" inputMode="email" />;
        default:
            return <Input {...shared} type="text" />;
    }
}

/**
 * A checkbox bound to a boolean value, with its error under it.
 *
 * Not routed through `FormField`, which hands the control `value`: a checkbox
 * is driven by `checked`, and `Checkbox` has no error slot of its own.
 *
 * @param props - The field's config entry.
 * @returns The bound checkbox.
 */
function CheckboxField({ config }: { config: AuthField }): ReactNode {
    const errorId = useId();
    return (
        <Controller
            name={config.name}
            render={({ field, fieldState }) => (
                <div>
                    <Checkbox
                        ref={field.ref}
                        name={field.name}
                        checked={Boolean(field.value)}
                        onChange={(event) => field.onChange(event.target.checked)}
                        onBlur={field.onBlur}
                        label={config.label}
                        description={fieldState.error ? undefined : config.helperText}
                        required={config.required}
                        aria-invalid={fieldState.error ? true : undefined}
                        aria-describedby={fieldState.error ? errorId : undefined}
                    />
                    <ErrorText id={errorId}>{fieldState.error?.message}</ErrorText>
                </div>
            )}
        />
    );
}

/**
 * Render one entry of an auth form's `fields` list as its SDK control.
 *
 * Must sit under the `FormProvider` the form mounts; the binding is read from
 * that context.
 *
 * @param props - The field's config entry.
 * @returns The bound control.
 */
export function AuthFieldControl({ config }: { config: AuthField }): ReactNode {
    const { control } = useFormContext();
    const { render } = config;
    if (render) {
        return (
            <Controller
                name={config.name}
                control={control}
                render={({ field, fieldState }) => (
                    <>{render({ field, fieldState, error: fieldState.error?.message, config })}</>
                )}
            />
        );
    }
    if (config.type === "checkbox") return <CheckboxField config={config} />;
    return (
        <FormField
            name={config.name}
            label={config.label}
            helperText={config.helperText}
            required={config.required}
        >
            {controlFor(config)}
        </FormField>
    );
}
