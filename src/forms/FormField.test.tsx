import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FormField } from "./FormField";
import { useZodForm } from "./use-zod-form";

const schema = z.object({
    email: z.string().email("invalid email"),
});

function ControlledInput({
    value,
    onChange,
    onBlur,
    label,
    error,
    required,
    name,
}: {
    value?: unknown;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur?: () => void;
    label?: React.ReactNode;
    error?: string;
    required?: boolean;
    name?: string;
}) {
    return (
        <label>
            {label}
            <input
                aria-label={typeof label === "string" ? label : undefined}
                value={(value as string) ?? ""}
                onChange={onChange}
                onBlur={onBlur}
                required={required}
                name={name}
            />
            {error && <span role="alert">{error}</span>}
        </label>
    );
}

describe("FormField", () => {
    it("routes value/onChange via Controller through FormProvider", async () => {
        function Demo() {
            const form = useZodForm(schema, { defaultValues: { email: "" } });
            return (
                <FormProvider {...form}>
                    <form>
                        <FormField name="email" label="Email">
                            <ControlledInput />
                        </FormField>
                    </form>
                </FormProvider>
            );
        }
        render(<Demo />);
        const input = screen.getByLabelText("Email") as HTMLInputElement;
        await userEvent.type(input, "user@x.com");
        expect(input.value).toBe("user@x.com");
    });

    it("forwards error message after submit + invalid value", async () => {
        function Demo() {
            const form = useZodForm(schema, { defaultValues: { email: "" } });
            return (
                <FormProvider {...form}>
                    <form onSubmit={form.handleSubmit(() => {})}>
                        <FormField name="email" label="Email">
                            <ControlledInput />
                        </FormField>
                        <button type="submit">Submit</button>
                    </form>
                </FormProvider>
            );
        }
        render(<Demo />);
        await userEvent.click(screen.getByText("Submit"));
        expect(await screen.findByText("invalid email")).toBeInTheDocument();
    });

    it("throws when no control prop and no FormProvider", () => {
        const original = console.error;
        console.error = () => {};
        expect(() => {
            render(
                <FormField name="email">
                    <ControlledInput />
                </FormField>,
            );
        }).toThrow(/FormField requires/);
        console.error = original;
    });

    it("accepts explicit control prop without FormProvider", () => {
        function Demo() {
            const form = useForm({ defaultValues: { email: "" } });
            return (
                <form>
                    <FormField name="email" label="Email" control={form.control}>
                        <ControlledInput />
                    </FormField>
                </form>
            );
        }
        render(<Demo />);
        expect(screen.getByLabelText("Email")).toBeInTheDocument();
    });
});
