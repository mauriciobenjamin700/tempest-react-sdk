import { act, renderHook } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { useZodForm } from "./use-zod-form";

const schema = z.object({ name: z.string().min(2) });

describe("useZodForm", () => {
    it("returns a react-hook-form instance", () => {
        const { result } = renderHook(() => useZodForm(schema, { defaultValues: { name: "" } }));
        expect(typeof result.current.handleSubmit).toBe("function");
        expect(typeof result.current.register).toBe("function");
    });
});

describe("useZodForm types the fields by the schema input and the submit by its output", () => {
    const STATUSES = ["active", "paused"] as const;
    const productSchema = z.object({
        status: z
            .union([z.enum(STATUSES), z.literal("")])
            .refine((value) => value !== "", "Escolha um status"),
        stock: z.coerce.number(),
    });

    it("a required select can open empty and the submit handler sees only the enum", async () => {
        const { result } = renderHook(() =>
            useZodForm(productSchema, { defaultValues: { status: "", stock: "3" } }),
        );
        const typed: UseFormReturn<
            z.input<typeof productSchema> & FieldValues,
            unknown,
            z.output<typeof productSchema>
        > = result.current;
        expect(typed).toBe(result.current);
        let submitted: z.output<typeof productSchema> | null = null;
        let rejected = false;
        await act(async () => {
            await result.current.handleSubmit(
                (values) => {
                    expectTypeOf(values.status).toEqualTypeOf<"active" | "paused">();
                    expectTypeOf(values.stock).toEqualTypeOf<number>();
                    submitted = values;
                },
                () => {
                    rejected = true;
                },
            )();
        });
        expect(rejected).toBe(true);
        expect(submitted).toBeNull();
        expect(result.current.getFieldState("status").error?.message).toBe("Escolha um status");

        act(() => result.current.setValue("status", "paused"));
        await act(async () => {
            await result.current.handleSubmit((values) => {
                submitted = values;
            })();
        });
        expect(submitted).toEqual({ status: "paused", stock: 3 });
    });
});
