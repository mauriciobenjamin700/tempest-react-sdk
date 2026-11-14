import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
    MercadoPagoCardTokenData,
    MercadoPagoConstructor,
    MercadoPagoFieldType,
    MercadoPagoInstallmentsEntry,
} from "./mercado-pago";
import { useMercadoPagoCard } from "./use-mercado-pago-card";
import type { UseMercadoPagoCardOptions } from "./use-mercado-pago-card";

/** Installments for the sandbox Visa at R$ 109,64, in the shape `getInstallments` answers. */
const VISA_INSTALLMENTS: MercadoPagoInstallmentsEntry[] = [
    {
        payment_method_id: "visa",
        payment_type_id: "credit_card",
        issuer: { id: "25" },
        payer_costs: [
            {
                installments: 1,
                installment_rate: 0,
                installment_amount: 109.64,
                total_amount: 109.64,
                recommended_message: "1 parcela de R$ 109,64 (R$ 109,64)",
            },
            {
                installments: 2,
                installment_rate: 4.35,
                installment_amount: 57.2,
                total_amount: 114.4,
                recommended_message: "2 parcelas de R$ 57,20 (R$ 114,40)",
            },
        ],
    },
];

interface Harness {
    load: () => Promise<MercadoPagoConstructor>;
    keys: string[];
    mounted: Map<MercadoPagoFieldType, string>;
    unmounted: MercadoPagoFieldType[];
    emitBin: (bin: string) => void;
    installmentCalls: { amount: string; bin: string }[];
    tokenCalls: MercadoPagoCardTokenData[];
}

function harness(
    installments: (params: {
        amount: string;
        bin: string;
    }) => Promise<MercadoPagoInstallmentsEntry[]> = () => Promise.resolve(VISA_INSTALLMENTS),
): Harness {
    const state: Harness = {
        load: () => Promise.resolve(FakeMercadoPago as unknown as MercadoPagoConstructor),
        keys: [],
        mounted: new Map(),
        unmounted: [],
        emitBin: () => undefined,
        installmentCalls: [],
        tokenCalls: [],
    };
    class FakeMercadoPago {
        constructor(publicKey: string) {
            state.keys.push(publicKey);
        }
        fields = {
            create: (type: MercadoPagoFieldType) => ({
                mount: (id: string) => state.mounted.set(type, id),
                unmount: () => state.unmounted.push(type),
                on: (event: string, listener: (payload: unknown) => void) => {
                    if (event === "binChange") state.emitBin = (bin) => listener({ bin });
                },
            }),
            createCardToken: (data: MercadoPagoCardTokenData) => {
                state.tokenCalls.push(data);
                return Promise.resolve({ id: "card-token-123" });
            },
        };
        getInstallments = (params: { amount: string; bin: string }) => {
            state.installmentCalls.push(params);
            return installments(params);
        };
    }
    return state;
}

function options(
    h: Harness,
    overrides: Partial<UseMercadoPagoCardOptions> = {},
): UseMercadoPagoCardOptions {
    return {
        publicKey: "TEST-public-key",
        amountCents: 10964,
        containers: {
            cardNumber: "mp-number",
            expirationDate: "mp-expiry",
            securityCode: "mp-cvv",
        },
        load: h.load,
        ...overrides,
    };
}

describe("useMercadoPagoCard", () => {
    it("mounts the three Secure Fields with the app's public key", async () => {
        const h = harness();
        const { result } = renderHook(() => useMercadoPagoCard(options(h)));
        await waitFor(() => expect(result.current.status).toBe("ready"));
        expect(h.keys).toEqual(["TEST-public-key"]);
        expect(Object.fromEntries(h.mounted)).toEqual({
            cardNumber: "mp-number",
            expirationDate: "mp-expiry",
            securityCode: "mp-cvv",
        });
    });

    it("quotes installments by BIN with the provider's recommended_message and the amount as a decimal string", async () => {
        const h = harness();
        const { result } = renderHook(() => useMercadoPagoCard(options(h)));
        await waitFor(() => expect(result.current.status).toBe("ready"));
        act(() => h.emitBin("423564"));
        await waitFor(() => expect(result.current.installmentOptions).toHaveLength(2));
        expect(h.installmentCalls).toEqual([{ amount: "109.64", bin: "423564" }]);
        expect(result.current.paymentMethodId).toBe("visa");
        expect(result.current.installmentOptions[1]).toEqual({
            installments: 2,
            recommendedMessage: "2 parcelas de R$ 57,20 (R$ 114,40)",
            installmentAmountCents: 5720,
            totalAmountCents: 11440,
        });
    });

    it("clears the quote when the BIN is erased instead of keeping the previous card's options", async () => {
        const h = harness();
        const { result } = renderHook(() => useMercadoPagoCard(options(h)));
        await waitFor(() => expect(result.current.status).toBe("ready"));
        act(() => h.emitBin("423564"));
        await waitFor(() => expect(result.current.installmentOptions).toHaveLength(2));
        act(() => h.emitBin(""));
        expect(result.current.installmentOptions).toEqual([]);
        expect(result.current.paymentMethodId).toBeNull();
        expect(h.installmentCalls).toHaveLength(1);
    });

    it("returns exactly token, payment_method_id and installments — no card data", async () => {
        const h = harness();
        const { result } = renderHook(() => useMercadoPagoCard(options(h)));
        await waitFor(() => expect(result.current.status).toBe("ready"));
        act(() => h.emitBin("423564"));
        await waitFor(() => expect(result.current.paymentMethodId).toBe("visa"));
        let token: unknown;
        await act(async () => {
            token = await result.current.tokenize({
                cardholderName: "APRO",
                installments: 2,
                identificationType: "CPF",
                identificationNumber: "12345678909",
            });
        });
        expect(token).toEqual({
            token: "card-token-123",
            payment_method_id: "visa",
            installments: 2,
        });
        expect(h.tokenCalls).toEqual([
            {
                cardholderName: "APRO",
                identificationType: "CPF",
                identificationNumber: "12345678909",
            },
        ]);
    });

    it("refuses to tokenize before the brand is known or with an installment count the card does not offer", async () => {
        const h = harness();
        const { result } = renderHook(() => useMercadoPagoCard(options(h)));
        await waitFor(() => expect(result.current.status).toBe("ready"));
        await expect(
            result.current.tokenize({ cardholderName: "APRO", installments: 1 }),
        ).rejects.toThrow(/brand has not been identified/);
        act(() => h.emitBin("423564"));
        await waitFor(() => expect(result.current.paymentMethodId).toBe("visa"));
        await expect(
            result.current.tokenize({ cardholderName: "APRO", installments: 12 }),
        ).rejects.toThrow(/12 installments is not an option/);
        expect(h.tokenCalls).toEqual([]);
    });

    it("refuses to tokenize while the fields are still loading", async () => {
        const h = harness();
        const never = new Promise<MercadoPagoConstructor>(() => undefined);
        const { result } = renderHook(() => useMercadoPagoCard(options(h, { load: () => never })));
        expect(result.current.status).toBe("loading");
        await expect(
            result.current.tokenize({ cardholderName: "APRO", installments: 1 }),
        ).rejects.toThrow(/not ready/);
    });

    it("reports a script that fails to load as an error state", async () => {
        const h = harness();
        const { result } = renderHook(() =>
            useMercadoPagoCard(options(h, { load: () => Promise.reject(new Error("offline")) })),
        );
        await waitFor(() => expect(result.current.status).toBe("error"));
        expect(result.current.error?.message).toBe("offline");
    });

    it("turns MercadoPago.js's array-shaped rejection into an Error with the messages", async () => {
        const h = harness(() =>
            Promise.reject([{ message: "bin is invalid" }, { message: "amount is required" }]),
        );
        const { result } = renderHook(() => useMercadoPagoCard(options(h)));
        await waitFor(() => expect(result.current.status).toBe("ready"));
        act(() => h.emitBin("000000"));
        await waitFor(() => expect(result.current.installmentsError).not.toBeNull());
        expect(result.current.installmentsError?.message).toBe(
            "bin is invalid; amount is required",
        );
        expect(result.current.installmentsLoading).toBe(false);
    });

    it("reports an empty installments answer as an error rather than an empty select", async () => {
        const h = harness(() => Promise.resolve([]));
        const { result } = renderHook(() => useMercadoPagoCard(options(h)));
        await waitFor(() => expect(result.current.status).toBe("ready"));
        act(() => h.emitBin("423564"));
        await waitFor(() =>
            expect(result.current.installmentsError?.message).toMatch(/no installments/),
        );
    });

    it("ignores a quote that arrives after the BIN changed", async () => {
        const resolvers: ((entries: MercadoPagoInstallmentsEntry[]) => void)[] = [];
        const h = harness(
            () =>
                new Promise((resolve) => {
                    resolvers.push(resolve);
                }),
        );
        const { result } = renderHook(() => useMercadoPagoCard(options(h)));
        await waitFor(() => expect(result.current.status).toBe("ready"));
        act(() => h.emitBin("423564"));
        act(() => h.emitBin("503143"));
        const master: MercadoPagoInstallmentsEntry[] = [
            { ...VISA_INSTALLMENTS[0]!, payment_method_id: "master" },
        ];
        await act(async () => {
            resolvers[1]?.(master);
            resolvers[0]?.(VISA_INSTALLMENTS);
            await Promise.resolve();
        });
        await waitFor(() => expect(result.current.paymentMethodId).toBe("master"));
    });

    it("unmounts the fields on unmount and survives a field that is already gone", async () => {
        const h = harness();
        const { result, unmount } = renderHook(() => useMercadoPagoCard(options(h)));
        await waitFor(() => expect(result.current.status).toBe("ready"));
        unmount();
        expect(h.unmounted).toEqual(["cardNumber", "expirationDate", "securityCode"]);
    });

    it("tolerates unmount() throwing during cleanup", async () => {
        const throwing = class {
            fields = {
                create: () => ({
                    mount: () => undefined,
                    unmount: () => {
                        throw new Error("Field already unmounted");
                    },
                    on: () => undefined,
                }),
                createCardToken: vi.fn(),
            };
            getInstallments = vi.fn();
        };
        const { result, unmount } = renderHook(() =>
            useMercadoPagoCard(
                options(harness(), {
                    load: () => Promise.resolve(throwing as unknown as MercadoPagoConstructor),
                }),
            ),
        );
        await waitFor(() => expect(result.current.status).toBe("ready"));
        expect(() => unmount()).not.toThrow();
    });

    it("does not mount fields when unmounted before the script resolves", async () => {
        const h = harness();
        let release: (value: MercadoPagoConstructor) => void = () => undefined;
        const pendingLoad = new Promise<MercadoPagoConstructor>((resolve) => {
            release = resolve;
        });
        const { unmount } = renderHook(() =>
            useMercadoPagoCard(options(h, { load: () => pendingLoad })),
        );
        unmount();
        await act(async () => {
            release(await h.load());
        });
        expect(h.mounted.size).toBe(0);
    });

    it("surfaces a token failure as an Error and ignores a malformed binChange payload", async () => {
        const failing = class {
            fields = {
                create: () => ({
                    mount: () => undefined,
                    unmount: () => undefined,
                    on: (_event: string, listener: (payload: unknown) => void) => {
                        listener(null);
                        listener({ bin: 423564 });
                        listener({ bin: "423564" });
                    },
                }),
                createCardToken: () => Promise.reject("network down"),
            };
            getInstallments = () => Promise.resolve(VISA_INSTALLMENTS);
        };
        const { result } = renderHook(() =>
            useMercadoPagoCard(
                options(harness(), {
                    load: () => Promise.resolve(failing as unknown as MercadoPagoConstructor),
                }),
            ),
        );
        await waitFor(() => expect(result.current.paymentMethodId).toBe("visa"));
        await expect(
            result.current.tokenize({ cardholderName: "APRO", installments: 1 }),
        ).rejects.toThrow("network down");
    });
});
