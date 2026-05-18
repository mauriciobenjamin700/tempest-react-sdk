import { cloneElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import {
    Controller,
    useFormContext,
    type Control,
    type ControllerRenderProps,
    type FieldPath,
    type FieldValues,
} from "react-hook-form";

export interface FormFieldChildProps {
    name: string;
    value: unknown;
    onChange: (...args: unknown[]) => void;
    onBlur: () => void;
    ref: ControllerRenderProps["ref"];
    error?: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
    label?: ReactNode;
    helperText?: ReactNode;
    required?: boolean;
    id?: string;
}

export interface FormFieldProps<
    TValues extends FieldValues = FieldValues,
    TName extends FieldPath<TValues> = FieldPath<TValues>,
> {
    /** Field name (dot path supported, e.g. `"address.city"`). */
    name: TName;
    /** Field label rendered by the wrapped control. */
    label?: ReactNode;
    /** Helper text rendered by the wrapped control when there is no error. */
    helperText?: ReactNode;
    /** When `true`, marks the control as required (visual hint + native attribute). */
    required?: boolean;
    /**
     * Explicit `control` from `useForm()` / `useZodForm()`. Optional when a
     * `FormProvider` is in the tree.
     */
    control?: Control<TValues>;
    /**
     * The control to render. Receives `{ value, onChange, onBlur, ref, error, ... }`
     * via `cloneElement`. Pass `<Input />`, `<Select />`, masked inputs, etc.
     */
    children: ReactElement;
}

/**
 * Glue between `react-hook-form` `Controller` and the SDK's controlled
 * components. Wraps any control that accepts `{ value, onChange, label,
 * error }` and routes RHF state into it — eliminating the per-field
 * `<Controller render={...} />` boilerplate.
 *
 * @example
 * const form = useZodForm(schema);
 * <FormProvider {...form}>
 *     <Form>
 *         <FormField name="email" label="Email" required>
 *             <Input type="email" />
 *         </FormField>
 *         <FormField name="cep" label="CEP">
 *             <CEPInput />
 *         </FormField>
 *     </Form>
 * </FormProvider>;
 */
export function FormField<
    TValues extends FieldValues = FieldValues,
    TName extends FieldPath<TValues> = FieldPath<TValues>,
>({ name, label, helperText, required, control, children }: FormFieldProps<TValues, TName>) {
    const context = useFormContext<TValues>();
    const resolvedControl = control ?? context?.control;
    if (!resolvedControl) {
        throw new Error(
            "FormField requires either a `control` prop or a <FormProvider> in the tree.",
        );
    }

    return (
        <Controller
            name={name}
            control={resolvedControl}
            render={({ field, fieldState }) => {
                if (!isValidElement(children)) return children;
                const errorMessage = fieldState.error?.message;
                return cloneElement(children as ReactElement<FormFieldChildProps>, {
                    name: field.name,
                    value: field.value,
                    onChange: field.onChange,
                    onBlur: field.onBlur,
                    ref: field.ref,
                    label,
                    helperText: errorMessage ? undefined : helperText,
                    error: errorMessage,
                    required,
                    "aria-invalid": !!errorMessage,
                });
            }}
        />
    );
}
