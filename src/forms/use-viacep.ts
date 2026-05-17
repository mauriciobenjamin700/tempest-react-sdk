import { useCallback, useState } from "react";

export interface ViaCEPResult {
    cep: string;
    logradouro: string;
    complemento: string;
    bairro: string;
    localidade: string;
    uf: string;
    ibge?: string;
    gia?: string;
    ddd?: string;
    siafi?: string;
}

export interface UseViaCEPResult {
    loading: boolean;
    error: string | null;
    data: ViaCEPResult | null;
    /** Fetch the given CEP (8 digits or masked). Sets `data`/`error`. Returns the result. */
    lookup: (cep: string) => Promise<ViaCEPResult | null>;
    reset: () => void;
}

/**
 * React hook for the public ViaCEP service (`viacep.com.br`). No backend
 * required. Returns address fields when the CEP exists, or sets `error` for
 * invalid CEPs.
 */
export function useViaCEP(): UseViaCEPResult {
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<ViaCEPResult | null>(null);

    const lookup = useCallback(async (cep: string): Promise<ViaCEPResult | null> => {
        const digits = cep.replace(/\D/g, "");
        if (digits.length !== 8) {
            setError("CEP inválido.");
            return null;
        }
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
            const json = (await response.json()) as ViaCEPResult & { erro?: boolean };
            if ("erro" in json && json.erro) {
                setError("CEP não encontrado.");
                setData(null);
                return null;
            }
            setData(json);
            return json;
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    const reset = useCallback(() => {
        setLoading(false);
        setError(null);
        setData(null);
    }, []);

    return { loading, error, data, lookup, reset };
}
