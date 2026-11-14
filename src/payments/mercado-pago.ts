/**
 * The official MercadoPago.js v2 script.
 *
 * Loaded from Mercado Pago's own host, never bundled or vendored: the PCI DSS
 * self-assessment that keeps a merchant in the lightest scope (SAQ A) requires
 * the card fields to come straight from the processor, and Mercado Pago ships
 * the script unversioned so fixes reach every merchant without a rebuild. It is
 * also why this is not an npm dependency — there is no package to pin.
 *
 * A Content-Security-Policy needs `script-src https://sdk.mercadopago.com` and,
 * for the Secure Fields iframes and the API calls the script makes,
 * `frame-src https://secure-fields.mercadopago.com https://api-static.mercadopago.com`
 * plus `connect-src https://api.mercadopago.com https://api.mercadolibre.com`
 * (hosts read from the script itself, `js_version` 2.83.6, on 2026-11-14).
 */
export const MERCADO_PAGO_SCRIPT_URL = "https://sdk.mercadopago.com/js/v2";

/** The Secure Fields this module mounts. */
export type MercadoPagoFieldType = "cardNumber" | "expirationDate" | "securityCode";

/** Options for one Secure Field, as MercadoPago.js accepts them. */
export interface MercadoPagoFieldOptions {
    /** Placeholder shown inside the iframe. */
    placeholder?: string;
    /** Inline style applied inside the iframe (font, colour, size). */
    style?: Record<string, string>;
}

/** One mounted Secure Field — the subset of MercadoPago.js this module calls. */
export interface MercadoPagoFieldLike {
    /** Mounts the iframe into the element with this id. */
    mount(containerId: string): unknown;
    /** Removes the iframe. */
    unmount(): unknown;
    /** Subscribes to a field event (`binChange`, `validityChange`, `error`, …). */
    on(event: string, listener: (payload: unknown) => void): unknown;
}

/** One installment option, as `getInstallments` returns it. */
export interface MercadoPagoPayerCost {
    installments: number;
    installment_rate: number;
    installment_amount: number;
    total_amount: number;
    /** Ready-made text, e.g. `"2 parcelas de R$ 54,82 (R$ 109,64)"`. */
    recommended_message: string;
}

/** One entry of the `getInstallments` answer. */
export interface MercadoPagoInstallmentsEntry {
    payment_method_id: string;
    payment_type_id?: string;
    issuer?: { id?: string | number | null } | null;
    payer_costs: MercadoPagoPayerCost[];
}

/** Non-card data the token is bound to. */
export interface MercadoPagoCardTokenData {
    cardholderName: string;
    identificationType?: string;
    identificationNumber?: string;
}

/**
 * The subset of a `new MercadoPago(publicKey)` instance this module calls.
 *
 * Declared here instead of depending on `@mercadopago/sdk-js`, matching how the
 * SDK treats every injected provider: tests pass a fake with this shape, and an
 * app never pays for typings it does not use.
 */
export interface MercadoPagoLike {
    fields: {
        create(type: MercadoPagoFieldType, options?: MercadoPagoFieldOptions): MercadoPagoFieldLike;
        createCardToken(data: MercadoPagoCardTokenData): Promise<{ id: string }>;
    };
    getInstallments(params: {
        amount: string;
        bin: string;
        paymentTypeId?: string;
    }): Promise<MercadoPagoInstallmentsEntry[]>;
}

/** The `MercadoPago` global the script defines. */
export type MercadoPagoConstructor = new (
    publicKey: string,
    options?: { locale?: string },
) => MercadoPagoLike;

/** Options for {@link loadMercadoPago}. */
export interface LoadMercadoPagoOptions {
    /** Script URL. Default {@link MERCADO_PAGO_SCRIPT_URL}; override only for a proxy you control. */
    src?: string;
    /** Document to inject into. Default the global `document`. */
    document?: Document;
}

const pending = new WeakMap<Document, Promise<MercadoPagoConstructor>>();

function readGlobal(doc: Document): MercadoPagoConstructor | undefined {
    const view = doc.defaultView as (Window & { MercadoPago?: MercadoPagoConstructor }) | null;
    return view?.MercadoPago;
}

/**
 * Load MercadoPago.js once per document and resolve its constructor.
 *
 * Concurrent and repeated calls share one `<script>` tag and one promise, so a
 * checkout that remounts never injects the script twice. A failed load is
 * forgotten instead of cached — the next call tries again, which is what a
 * payer on a flaky connection needs — and the dead tag is removed.
 *
 * @param options - Script URL and target document.
 * @returns The `MercadoPago` constructor.
 * @throws {Error} When the script fails to load, or loads without defining
 *   `window.MercadoPago`.
 *
 * @example
 * const MercadoPago = await loadMercadoPago();
 * const mp = new MercadoPago(import.meta.env.VITE_MP_PUBLIC_KEY, { locale: "pt-BR" });
 */
export function loadMercadoPago(
    options: LoadMercadoPagoOptions = {},
): Promise<MercadoPagoConstructor> {
    const doc = options.document ?? document;
    const ready = readGlobal(doc);
    if (ready !== undefined) return Promise.resolve(ready);
    const inflight = pending.get(doc);
    if (inflight !== undefined) return inflight;

    const promise = new Promise<MercadoPagoConstructor>((resolve, reject) => {
        const script = doc.createElement("script");
        script.src = options.src ?? MERCADO_PAGO_SCRIPT_URL;
        script.async = true;
        const fail = (message: string): void => {
            pending.delete(doc);
            script.remove();
            reject(new Error(message));
        };
        script.addEventListener("load", () => {
            const loaded = readGlobal(doc);
            if (loaded === undefined) {
                fail("MercadoPago.js loaded but did not define window.MercadoPago.");
                return;
            }
            pending.delete(doc);
            resolve(loaded);
        });
        script.addEventListener("error", () =>
            fail(`MercadoPago.js failed to load from ${script.src}.`),
        );
        doc.head.appendChild(script);
    });
    pending.set(doc, promise);
    return promise;
}
