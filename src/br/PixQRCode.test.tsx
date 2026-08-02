import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { findA11yViolations, formatA11yViolations } from "../../test/a11y";
import { PixQRCode } from "./PixQRCode";
import { PixError, pixPayload } from "./pix";

const PIX = {
    key: "12345678909",
    merchantName: "Loja Tempest",
    merchantCity: "Sao Paulo",
    amount: 25.5,
    txid: "PEDIDO123",
} as const;

const EXPECTED_PAYLOAD =
    "00020101021126330014br.gov.bcb.pix011112345678909520400005303986540525.505802BR5912Loja Tempest6009Sao Paulo62130509PEDIDO1236304D68C";

describe("PixQRCode", () => {
    let writeText: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("renders the symbol and the copia-e-cola line built from `pix`", () => {
        render(<PixQRCode pix={PIX} />);
        expect(screen.getByRole("img", { name: "QR code do Pix" })).toBeInTheDocument();
        expect(screen.getByTestId("pix-payload")).toHaveTextContent(EXPECTED_PAYLOAD);
    });

    it("uses a payload from the PSP verbatim", () => {
        const payload = pixPayload({
            kind: "dynamic",
            url: "pix.example.com/qr/v2/abc123",
            merchantName: "Tempest",
            merchantCity: "Recife",
        });
        render(<PixQRCode payload={`  ${payload}  `} />);
        expect(screen.getByTestId("pix-payload")).toHaveTextContent(payload);
    });

    it("copies the payload and swaps the button label", async () => {
        const onCopied = vi.fn();
        render(<PixQRCode pix={PIX} onCopied={onCopied} />);

        fireEvent.click(screen.getByRole("button"));

        await waitFor(() => expect(writeText).toHaveBeenCalledWith(EXPECTED_PAYLOAD));
        await waitFor(() => expect(screen.getByRole("button")).toHaveAttribute("data-copied"));
        expect(onCopied).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("button")).toHaveTextContent("Copiado");
    });

    it("hides the copy affordance when asked", () => {
        render(<PixQRCode pix={PIX} showCopy={false} />);
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
        expect(screen.queryByTestId("pix-payload")).not.toBeInTheDocument();
    });

    it("renders the captions only when they are given", () => {
        const { rerender } = render(<PixQRCode pix={PIX} />);
        expect(screen.queryByText("R$ 25,50")).not.toBeInTheDocument();

        rerender(<PixQRCode pix={PIX} amountLabel="R$ 25,50" payeeLabel="Loja Tempest" />);
        expect(screen.getByText("R$ 25,50")).toBeInTheDocument();
        expect(screen.getByText("Loja Tempest")).toBeInTheDocument();
    });

    it("takes translated labels", () => {
        render(<PixQRCode pix={PIX} labels={{ qr: "Pix QR code", copy: "Copy code" }} />);
        expect(screen.getByRole("img", { name: "Pix QR code" })).toBeInTheDocument();
        expect(screen.getByRole("button")).toHaveTextContent("Copy code");
    });

    it("forwards className and DOM props", () => {
        render(<PixQRCode pix={PIX} className="mine" data-testid="wrapper" />);
        expect(screen.getByTestId("wrapper").className).toContain("mine");
    });

    it("throws when neither `pix` nor `payload` is given", () => {
        expect(() => render(<PixQRCode />)).toThrow(PixError);
    });

    it("throws when both `pix` and `payload` are given", () => {
        expect(() => render(<PixQRCode pix={PIX} payload={EXPECTED_PAYLOAD} />)).toThrow(PixError);
    });

    it("lets a bad key surface instead of rendering an unscannable symbol", () => {
        expect(() => render(<PixQRCode pix={{ ...PIX, key: "nope" }} />)).toThrow(PixError);
    });

    it("has no axe violations", async () => {
        const { container } = render(
            <PixQRCode pix={PIX} amountLabel="R$ 25,50" payeeLabel="Loja Tempest" />,
        );
        const violations = await findA11yViolations(container);
        expect(formatA11yViolations(violations)).toBe("");
    });
});
