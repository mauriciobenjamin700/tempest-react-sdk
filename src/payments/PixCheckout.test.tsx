import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { findA11yViolations, formatA11yViolations } from "../../test/a11y";

import { formatPixRemaining } from "./format";
import { PixCheckout } from "./PixCheckout";
import type { PaymentStatus, PixCharge } from "./types";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const PNG =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function charge(overrides: Partial<PixCharge> = {}): PixCharge {
    return {
        provider: "mercado_pago",
        provider_charge_id: "ORDTST01",
        reference: "order-1042",
        amount_cents: 10964,
        currency: "BRL",
        status: "pending",
        provider_status: "action_required",
        br_code:
            "00020101021226820014br.gov.bcb.pix2560pix.example/qr/v2/abc5204000053039865802BR6304ABCD",
        qr_code_base64: PNG,
        qr_code_image_url: null,
        end_to_end_id: null,
        expires_at: new Date(NOW + 15 * 60_000).toISOString(),
        paid_at: null,
        ...overrides,
    };
}

beforeEach(() => {
    vi.useFakeTimers({
        toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"],
    });
    vi.setSystemTime(NOW);
});

afterEach(() => {
    vi.useRealTimers();
});

describe("PixCheckout", () => {
    it("shows the amount, the provider's Base64 QR, the copia-e-cola and the countdown while pending", () => {
        render(<PixCheckout charge={charge()} />);
        expect(screen.getByText(/R\$\s?109,64/)).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "QR code do Pix" })).toHaveAttribute(
            "src",
            `data:image/png;base64,${PNG}`,
        );
        expect(screen.getByTestId("pix-checkout-code")).toHaveTextContent(charge().br_code ?? "");
        expect(screen.getByRole("timer")).toHaveTextContent("Expira em 15:00");
        expect(screen.getByRole("button", { name: /Copiar código/ })).toBeInTheDocument();
    });

    it("counts down against the clock", () => {
        render(<PixCheckout charge={charge()} />);
        act(() => {
            vi.advanceTimersByTime(65_000);
        });
        expect(screen.getByRole("timer")).toHaveTextContent("13:55");
    });

    it("hides the QR and says it is confirming — not expired — when the deadline passes while still pending", () => {
        render(<PixCheckout charge={charge({ expires_at: new Date(NOW + 2000).toISOString() })} />);
        act(() => {
            vi.advanceTimersByTime(3000);
        });
        expect(screen.queryByRole("img")).not.toBeInTheDocument();
        expect(screen.queryByRole("timer")).not.toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent(/confirmando/);
        expect(screen.queryByText("Pix expirado")).not.toBeInTheDocument();
    });

    it("draws the QR locally from br_code when the provider sent no Base64 (OpenPix)", () => {
        render(
            <PixCheckout
                charge={charge({
                    qr_code_base64: null,
                    qr_code_image_url: "https://img.example/qr.png",
                })}
            />,
        );
        const image = screen.getByRole("img", { name: "QR code do Pix" });
        expect(image.tagName.toLowerCase()).not.toBe("img");
        expect(document.querySelector('img[src^="https://"]')).toBeNull();
    });

    it("refuses a qr_code_base64 that is not Base64 instead of putting it in an image src", () => {
        render(<PixCheckout charge={charge({ qr_code_base64: 'x" onerror="alert(1)' })} />);
        expect(document.querySelector("img")).toBeNull();
        expect(screen.getByRole("img", { name: "QR code do Pix" })).toBeInTheDocument();
    });

    it("accepts a Base64 that already carries the data:image/png prefix, once", () => {
        render(<PixCheckout charge={charge({ qr_code_base64: `data:image/png;base64,${PNG}` })} />);
        expect(document.querySelector("img")).toHaveAttribute(
            "src",
            `data:image/png;base64,${PNG}`,
        );
    });

    it("renders no countdown when the charge has no deadline", () => {
        render(<PixCheckout charge={charge({ expires_at: null })} />);
        expect(screen.queryByRole("timer")).not.toBeInTheDocument();
        expect(document.querySelector("img")).not.toBeNull();
    });

    it.each<[PaymentStatus, string]>([
        ["paid", "Pagamento confirmado"],
        ["expired", "Pix expirado"],
        ["cancelled", "Pix cancelado"],
        ["failed", "Pix não concluído"],
        ["unknown", "Verificando o pagamento"],
    ])("renders %s as the backend reported it, without the QR", (status, title) => {
        render(<PixCheckout charge={charge({ status })} />);
        expect(screen.getByRole("alert")).toHaveTextContent(title);
        expect(screen.queryByTestId("pix-checkout-code")).not.toBeInTheDocument();
        expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    });

    it("reads a status this version does not know as unknown", () => {
        render(<PixCheckout charge={charge({ status: "on_the_moon" as PaymentStatus })} />);
        expect(screen.getByRole("alert")).toHaveTextContent("Verificando o pagamento");
    });

    it("copies the copia-e-cola and reports it", async () => {
        vi.useRealTimers();
        const writeText = vi.fn(() => Promise.resolve());
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
        const onCopied = vi.fn();
        render(<PixCheckout charge={charge({ expires_at: null })} onCopied={onCopied} />);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Copiar código/ }));
            await Promise.resolve();
        });
        expect(writeText).toHaveBeenCalledWith(charge().br_code);
        expect(onCopied).toHaveBeenCalledOnce();
    });

    it("takes translated labels and a footer", () => {
        render(
            <PixCheckout
                charge={charge({ status: "expired" })}
                labels={{
                    states: { expired: { title: "Pix expired", description: "Create a new one." } },
                }}
                footer={<button type="button">Gerar novo Pix</button>}
            />,
        );
        expect(screen.getByRole("alert")).toHaveTextContent("Pix expired");
        expect(screen.getByRole("button", { name: "Gerar novo Pix" })).toBeInTheDocument();
    });

    it("has no axe violations while pending", async () => {
        vi.useRealTimers();
        const { baseElement } = render(<PixCheckout charge={charge({ expires_at: null })} />);
        expect(formatA11yViolations(await findA11yViolations(baseElement))).toBe("");
    });
});

describe("formatPixRemaining", () => {
    it("prints mm:ss under an hour and h:mm:ss above, rounding the last second up", () => {
        expect(formatPixRemaining(65_000)).toBe("01:05");
        expect(formatPixRemaining(3_725_000)).toBe("1:02:05");
        expect(formatPixRemaining(1)).toBe("00:01");
        expect(formatPixRemaining(-5)).toBe("00:00");
    });
});
