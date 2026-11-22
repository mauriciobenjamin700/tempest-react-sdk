import { act, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TempestApiError } from "@/http/errors";
import { applyApiFieldErrors } from "./apply-api-field-errors";
import { useZodForm } from "./use-zod-form";

const schema = z.object({
    name: z.string(),
    address: z.object({ cep: z.string() }),
});

/**
 * A 422 carrying per-field messages, as `createApiClient` builds it.
 *
 * @param fields - The `error.fields` map.
 * @returns The error.
 */
function rejection(fields: Record<string, string>): TempestApiError {
    return new TempestApiError({ status: 422, detail: "Unprocessable", fields });
}

/**
 * A `useZodForm` with every field defaulted, the way the helper expects it.
 *
 * @returns The rendered hook's result.
 */
function renderForm() {
    return renderHook(() =>
        useZodForm(schema, { defaultValues: { name: "", address: { cep: "" } } }),
    ).result;
}

describe("applyApiFieldErrors", () => {
    it("marks every field of the form the API named, nested paths included", () => {
        const form = renderForm();
        let outcome = { marked: [] as string[], unmatched: {} as Record<string, string> };
        act(() => {
            outcome = applyApiFieldErrors(
                form.current,
                rejection({ name: "Nome curto", "address.cep": "CEP inválido" }),
            );
        });
        expect(outcome).toEqual({ marked: ["name", "address.cep"], unmatched: {} });
        expect(form.current.getFieldState("name").error).toMatchObject({
            type: "server",
            message: "Nome curto",
        });
        expect(form.current.getFieldState("address.cep").error?.message).toBe("CEP inválido");
    });

    it("returns a name the form does not have instead of marking an input that does not exist", () => {
        const form = renderForm();
        let unmatched: Record<string, string> = {};
        act(() => {
            ({ unmatched } = applyApiFieldErrors(
                form.current,
                rejection({ tenant_id: "Inquilino inválido", name: "Nome curto" }),
            ));
        });
        expect(unmatched).toEqual({ tenant_id: "Inquilino inválido" });
        expect(form.current.getFieldState("name").error?.message).toBe("Nome curto");
        expect(form.current.getFieldState("tenant_id" as "name").error).toBeUndefined();
    });

    it("keeps a __proto__ field name as a key of unmatched instead of its prototype", () => {
        const form = renderForm();
        const fields = JSON.parse('{"__proto__": "x"}') as Record<string, string>;
        const { unmatched } = applyApiFieldErrors(form.current, rejection(fields));
        expect(Object.keys(unmatched)).toEqual(["__proto__"]);
        expect(Object.getPrototypeOf(unmatched)).toBe(Object.prototype);
    });

    it("an explicit fields list decides which names count, over getValues", () => {
        const form = renderForm();
        let outcome = { marked: [] as string[], unmatched: {} as Record<string, string> };
        act(() => {
            outcome = applyApiFieldErrors(
                form.current,
                rejection({ name: "Nome curto", "address.cep": "CEP inválido" }),
                { fields: ["address.cep"] },
            );
        });
        expect(outcome).toEqual({
            marked: ["address.cep"],
            unmatched: { name: "Nome curto" },
        });
    });

    it("marks nothing for an error that is not an API rejection with fields", () => {
        const form = renderForm();
        expect(applyApiFieldErrors(form.current, new Error("offline"))).toEqual({
            marked: [],
            unmatched: {},
        });
        expect(
            applyApiFieldErrors(
                form.current,
                new TempestApiError({ status: 500, detail: "Internal" }),
            ),
        ).toEqual({ marked: [], unmatched: {} });
    });

    it("moves focus to the first marked field, and only when asked", () => {
        function Probe({ focus }: { focus: boolean }) {
            const form = useZodForm(schema, {
                defaultValues: { name: "", address: { cep: "" } },
            });
            return (
                <form>
                    <input aria-label="name" {...form.register("name")} />
                    <input aria-label="cep" {...form.register("address.cep")} />
                    <button
                        type="button"
                        onClick={() =>
                            applyApiFieldErrors(
                                form,
                                rejection({ "address.cep": "CEP inválido", name: "Curto" }),
                                { focus },
                            )
                        }
                    >
                        apply
                    </button>
                </form>
            );
        }
        const { unmount } = render(<Probe focus />);
        act(() => screen.getByText("apply").click());
        expect(document.activeElement).toBe(screen.getByLabelText("cep"));
        unmount();
        render(<Probe focus={false} />);
        act(() => screen.getByText("apply").click());
        expect(document.activeElement).toBe(document.body);
    });
});
