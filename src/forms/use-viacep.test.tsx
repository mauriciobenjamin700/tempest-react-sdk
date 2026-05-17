import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useViaCEP } from "./use-viacep";

describe("useViaCEP", () => {
    afterEach(() => vi.restoreAllMocks());

    it("rejects invalid CEPs without fetching", async () => {
        const fetchSpy = vi.spyOn(global, "fetch");
        const { result } = renderHook(() => useViaCEP());
        await act(async () => {
            await result.current.lookup("123");
        });
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(result.current.error).toBe("CEP inválido.");
    });

    it("returns ViaCEP payload on success", async () => {
        const payload = {
            cep: "01310-100",
            logradouro: "Av. Paulista",
            complemento: "",
            bairro: "Bela Vista",
            localidade: "São Paulo",
            uf: "SP",
        };
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                json: () => Promise.resolve(payload),
            }),
        );
        const { result } = renderHook(() => useViaCEP());
        await act(async () => {
            await result.current.lookup("01310-100");
        });
        expect(result.current.data?.uf).toBe("SP");
        vi.unstubAllGlobals();
    });

    it("sets error when ViaCEP returns { erro: true }", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                json: () => Promise.resolve({ erro: true }),
            }),
        );
        const { result } = renderHook(() => useViaCEP());
        await act(async () => {
            await result.current.lookup("00000-000");
        });
        expect(result.current.error).toBe("CEP não encontrado.");
        vi.unstubAllGlobals();
    });
});
