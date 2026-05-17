import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
