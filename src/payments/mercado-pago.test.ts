import { afterEach, describe, expect, it } from "vitest";

import { MERCADO_PAGO_SCRIPT_URL, loadMercadoPago } from "./mercado-pago";
import type { MercadoPagoConstructor } from "./mercado-pago";

type Global = Window & { MercadoPago?: MercadoPagoConstructor };

class FakeMercadoPago {
    fields = {
        create: () => ({ mount: () => undefined, unmount: () => undefined, on: () => undefined }),
        createCardToken: () => Promise.resolve({ id: "tok" }),
    };
    getInstallments = () => Promise.resolve([]);
}

function scripts(): HTMLScriptElement[] {
    return Array.from(document.head.querySelectorAll("script"));
}

afterEach(() => {
    delete (window as Global).MercadoPago;
    for (const script of scripts()) script.remove();
});

describe("loadMercadoPago", () => {
    it("loads the official v2 script from Mercado Pago's host", () => {
        expect(MERCADO_PAGO_SCRIPT_URL).toBe("https://sdk.mercadopago.com/js/v2");
        void loadMercadoPago().catch(() => undefined);
        expect(scripts().map((script) => script.src)).toEqual([MERCADO_PAGO_SCRIPT_URL]);
        scripts()[0]?.dispatchEvent(new Event("error"));
    });

    it("injects one script for concurrent callers and resolves the global it defines", async () => {
        const first = loadMercadoPago();
        const second = loadMercadoPago();
        expect(second).toBe(first);
        expect(scripts()).toHaveLength(1);
        (window as Global).MercadoPago = FakeMercadoPago as unknown as MercadoPagoConstructor;
        scripts()[0]?.dispatchEvent(new Event("load"));
        await expect(first).resolves.toBe(FakeMercadoPago);
    });

    it("resolves at once without a new tag when the global already exists", async () => {
        (window as Global).MercadoPago = FakeMercadoPago as unknown as MercadoPagoConstructor;
        await expect(loadMercadoPago()).resolves.toBe(FakeMercadoPago);
        expect(scripts()).toHaveLength(0);
    });

    it("forgets a failed load so the next call retries with a fresh tag", async () => {
        const failed = loadMercadoPago({ src: "https://sdk.mercadopago.com/js/v2?retry" });
        scripts()[0]?.dispatchEvent(new Event("error"));
        await expect(failed).rejects.toThrow(/failed to load/);
        expect(scripts()).toHaveLength(0);
        const retry = loadMercadoPago();
        expect(retry).not.toBe(failed);
        expect(scripts()).toHaveLength(1);
        scripts()[0]?.dispatchEvent(new Event("error"));
        await expect(retry).rejects.toThrow();
    });

    it("rejects when the script loads without defining window.MercadoPago", async () => {
        const promise = loadMercadoPago();
        scripts()[0]?.dispatchEvent(new Event("load"));
        await expect(promise).rejects.toThrow(/did not define window.MercadoPago/);
    });
});
