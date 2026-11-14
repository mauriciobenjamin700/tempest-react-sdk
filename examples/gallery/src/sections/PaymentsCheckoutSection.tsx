import { useState, type ReactElement } from "react";
import {
    Alert,
    PixCheckout,
    SegmentedControl,
    describeCardCharge,
    type CardCharge,
    type PixCharge,
} from "tempest-react-sdk";
import { pixPayload } from "tempest-react-sdk/br";
import { Example } from "../Example";

type PixScenario = "pending" | "confirming" | "paid" | "expired";

const BR_CODE = pixPayload({
    key: "loja@tempest.dev",
    merchantName: "Loja Tempest",
    merchantCity: "São Paulo",
    amount: 109.64,
    txid: "ORDTST01",
});

/**
 * A charge in the shape the backend answers, for each state the screen has.
 *
 * `confirming` is a `pending` charge whose deadline already passed: the state
 * the screen shows while waiting for the backend to say "expired", which is
 * the one a reader is least likely to have seen.
 */
function scenarioCharge(scenario: PixScenario, now: number): PixCharge {
    const base: PixCharge = {
        provider: "mercado_pago",
        provider_charge_id: "ORDTST01",
        reference: "order-1042",
        amount_cents: 10964,
        currency: "BRL",
        status: "pending",
        provider_status: "action_required",
        br_code: BR_CODE,
        qr_code_base64: null,
        qr_code_image_url: null,
        end_to_end_id: null,
        expires_at: new Date(now + 15 * 60_000).toISOString(),
        paid_at: null,
    };
    if (scenario === "confirming")
        return { ...base, expires_at: new Date(now - 1000).toISOString() };
    if (scenario === "paid") return { ...base, status: "paid", provider_status: "processed" };
    if (scenario === "expired") return { ...base, status: "expired", provider_status: "canceled" };
    return base;
}

function PixDemo(): ReactElement {
    const [scenario, setScenario] = useState<PixScenario>("pending");
    const [now] = useState(() => Date.now());
    return (
        <div
            style={{
                display: "grid",
                gap: 16,
                justifyItems: "center",
                gridTemplateColumns: "minmax(0, 1fr)",
                width: "100%",
                minWidth: 0,
            }}
        >
            <SegmentedControl<PixScenario>
                aria-label="Estado da cobrança"
                value={scenario}
                onChange={setScenario}
                options={[
                    { value: "pending", label: "Pendente" },
                    { value: "confirming", label: "Vencido" },
                    { value: "paid", label: "Pago" },
                    { value: "expired", label: "Expirado" },
                ]}
            />
            <PixCheckout charge={scenarioCharge(scenario, now)} />
        </div>
    );
}

const CARD_RESULTS: Pick<CardCharge, "status" | "status_detail">[] = [
    { status: "paid", status_detail: "accredited" },
    { status: "authorized", status_detail: "waiting_capture" },
    { status: "failed", status_detail: "rejected_by_issuer" },
    { status: "failed", status_detail: "bad_filled_card_data" },
];

function CardOutcomes(): ReactElement {
    return (
        <div style={{ display: "grid", gap: 12 }}>
            {CARD_RESULTS.map((charge) => {
                const outcome = describeCardCharge(charge);
                return (
                    <Alert
                        key={`${charge.status}-${charge.status_detail ?? ""}`}
                        variant={outcome.tone}
                        title={`${outcome.title} · ${charge.status_detail ?? ""}`}
                        description={outcome.message}
                    />
                );
            })}
        </div>
    );
}

/**
 * The checkout half of `tempest-fastapi-sdk`'s payments: the Pix screen in each
 * state, and the card outcomes the backend can return.
 *
 * The card fields themselves (`useMercadoPagoCard`) are not rendered here: they
 * are Mercado Pago's iframes and need a real Public Key, and a fake that drew
 * plain inputs in their place would show exactly what the hook exists to
 * prevent. The code sample shows the wiring instead.
 */
export function PaymentsCheckoutSection(): ReactElement {
    return (
        <section className="gallery-section" id="payments-checkout">
            <h3>Checkout (Pix e cartão · Mercado Pago)</h3>
            <Example
                id="payments-pix-checkout"
                title="PixCheckout — a tela que o backend controla"
                note="QR desenhado localmente do br_code, copia-e-cola e contagem regressiva. Com o prazo vencido e o backend ainda em pending, a tela diz que está confirmando, não que expirou."
                code={`import { PixCheckout, usePixCharge } from "tempest-react-sdk";

const { charge } = usePixCharge(created, {
  refresh: (signal) => api.get(\`/api/pix/\${created.provider_charge_id}\`, { signal }),
});

<PixCheckout charge={charge} />`}
            >
                <PixDemo />
            </Example>
            <Example
                id="payments-card-outcome"
                title="describeCardCharge — recusa é resposta"
                note="O status decide, o status_detail refina a frase. waiting_capture é autorizado (reservado), nunca pago."
                code={`import { Alert, describeCardCharge, useMercadoPagoCard } from "tempest-react-sdk";

const card = useMercadoPagoCard({
  publicKey: import.meta.env.VITE_MP_PUBLIC_KEY,
  amountCents: 10964,
  containers: { cardNumber: "mp-number", expirationDate: "mp-expiry", securityCode: "mp-cvv" },
});
const { token, payment_method_id, installments } = await card.tokenize({ cardholderName: "APRO", installments: 1 });

const outcome = describeCardCharge(chargeFromBackend);
<Alert variant={outcome.tone} title={outcome.title} description={outcome.message} />`}
            >
                <CardOutcomes />
            </Example>
        </section>
    );
}
