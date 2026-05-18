export { FormField } from "./FormField";
export type { FormFieldChildProps, FormFieldProps } from "./FormField";

export { validateForm } from "./validate-form";
export type { ValidateFormFailure, ValidateFormResult, ValidateFormSuccess } from "./validate-form";
export { zodResolver } from "./zod-resolver";
export { useZodForm } from "./use-zod-form";

export { validateCPF, validateCNPJ, formatCEP, formatCNPJ, unmask } from "./br-validators";

export { CPFInput, CNPJInput, PhoneInput, CEPInput, MoneyInput } from "./masked-inputs";
export type { MoneyInputProps } from "./masked-inputs";

export { useViaCEP } from "./use-viacep";
export type { UseViaCEPResult, ViaCEPResult } from "./use-viacep";

// React Hook Form re-exports — convenience pass-through so apps can import
// everything from one place. `useZodForm` already wraps `useForm` + zod.
export {
    useFieldArray,
    useForm,
    useFormContext,
    useFormState,
    useWatch,
    Controller,
    FormProvider,
} from "react-hook-form";
export type {
    Control,
    FieldArrayWithId,
    FieldError,
    FieldErrors,
    FieldPath,
    FieldValues,
    Path,
    SubmitHandler,
    UseFieldArrayReturn,
    UseFormProps,
    UseFormRegister,
    UseFormReturn,
} from "react-hook-form";
