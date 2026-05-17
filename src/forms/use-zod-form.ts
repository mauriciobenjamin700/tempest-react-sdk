import { useForm } from "react-hook-form";
import type { FieldValues, UseFormProps, UseFormReturn } from "react-hook-form";
import type { z } from "zod";
import { zodResolver } from "./zod-resolver";

/**
 * Convenience wrapper around `react-hook-form`'s `useForm` that wires a zod
 * resolver and infers the form's value type from the schema.
 *
 * Both `react-hook-form` and `zod` are optional peer dependencies — install
 * them when your app uses forms.
 *
 * @example
 * const form = useZodForm(loginSchema, { defaultValues: { email: "" } });
 * form.register("email");
 */
export function useZodForm<
    TSchema extends z.ZodTypeAny,
    TValues extends FieldValues = z.infer<TSchema> & FieldValues,
>(
    schema: TSchema,
    options: Omit<UseFormProps<TValues>, "resolver"> = {},
): UseFormReturn<TValues> {
    return useForm<TValues>({
        ...options,
        resolver: zodResolver(schema) as unknown as UseFormProps<TValues>["resolver"],
    });
}
