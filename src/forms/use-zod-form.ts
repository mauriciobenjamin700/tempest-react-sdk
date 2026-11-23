import { useForm } from "react-hook-form";
import type { FieldValues, UseFormProps, UseFormReturn } from "react-hook-form";
import type { z } from "zod";
import { zodResolver } from "./zod-resolver";

/**
 * Convenience wrapper around `react-hook-form`'s `useForm` that wires a zod
 * resolver and types the form from the schema — **both sides of it**.
 *
 * - The fields, `defaultValues`, `watch`, `setValue` and `setError` are typed by
 *   the schema's **input** (`z.input`): what the inputs hold while the person
 *   edits.
 * - `handleSubmit` receives the schema's **output** (`z.output`): what the
 *   resolver hands over after a successful parse. That was already the runtime
 *   value; only the type said otherwise.
 *
 * The two differ exactly where a form needs them to. A required select that
 * opens empty is `z.union([z.enum(STATUSES), z.literal("")]).refine((value) =>
 * value !== "", "Escolha um status")`: the input accepts `""` as a default, and
 * the refine narrows the output, so the submit handler sees only the enum. When
 * both sides were typed by the output, the default `""` did not compile, and the
 * workaround (a refine without a type predicate) leaked `""` into the submitted
 * type. Likewise a `z.coerce.number()` field holds the text the input typed
 * (`unknown` on the input side) and submits a `number`.
 *
 * `options` is `NoInfer`: the type comes from the schema, never from
 * `defaultValues`. Without it TypeScript inferred the form from the defaults, so
 * `{ status: "" }` typed the field as `string` and dropped the enum the schema
 * declares.
 *
 * Both `react-hook-form` and `zod` are dependencies of the SDK.
 *
 * @example
 * const form = useZodForm(loginSchema, { defaultValues: { email: "" } });
 * form.register("email");
 *
 * @param schema - The zod schema that validates and shapes the form.
 * @param options - Everything `useForm` takes except `resolver`.
 * @returns The `useForm` instance, typed by the schema's input and output.
 */
export function useZodForm<
    TSchema extends z.ZodTypeAny,
    TValues extends FieldValues = z.input<TSchema> & FieldValues,
    TOutput = z.output<TSchema>,
>(
    schema: TSchema,
    options: Omit<UseFormProps<NoInfer<TValues>, unknown, NoInfer<TOutput>>, "resolver"> = {},
): UseFormReturn<TValues, unknown, TOutput> {
    return useForm<TValues, unknown, TOutput>({
        ...options,
        resolver: zodResolver(schema) as unknown as UseFormProps<
            TValues,
            unknown,
            TOutput
        >["resolver"],
    });
}
