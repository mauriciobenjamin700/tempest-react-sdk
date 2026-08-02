import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { findA11yViolations, formatA11yViolations } from "../../../test/a11y";
import {
    fakeVideoStream,
    installMediaDevices,
    installVideoElement,
    removeBarcodeDetector,
    setSecureContext,
} from "../../../test/audio-mocks";
import { BarcodeScanner } from "./BarcodeScanner";

/** A detector that always sees the same code, as a symbol held in frame does. */
function heldInFrame(rawValue: string, format = "ean_13") {
    return { detect: vi.fn(async () => [{ rawValue, format }]) };
}

describe("BarcodeScanner", () => {
    const restores: Array<() => void> = [];

    beforeEach(() => {
        restores.push(setSecureContext(true), installVideoElement(), removeBarcodeDetector());
    });

    afterEach(() => {
        vi.restoreAllMocks();
        while (restores.length) restores.pop()?.();
    });

    it("says so, and renders the fallback, when the browser cannot decode", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(
            <BarcodeScanner
                onScan={vi.fn()}
                unsupported={<button type="button">Digitar o código</button>}
            />,
        );

        await waitFor(() =>
            expect(
                screen.getByText("Este navegador não decodifica códigos de barras."),
            ).toBeInTheDocument(),
        );
        // On iOS and Firefox the fallback *is* the feature.
        expect(screen.getByRole("button", { name: "Digitar o código" })).toBeInTheDocument();
        expect(devices.getUserMedia).not.toHaveBeenCalled();
    });

    it("reads a code and reports it once", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);
        const onScan = vi.fn();

        render(
            <BarcodeScanner
                onScan={onScan}
                detector={heldInFrame("7891234567895")}
                intervalMs={5}
                repeatDelayMs={10_000}
            />,
        );

        await waitFor(() => expect(onScan).toHaveBeenCalledTimes(1));
        expect(screen.getByRole("status")).toHaveTextContent("Código lido: 7891234567895");
    });

    it("says what it is doing before anything is read", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(
            <BarcodeScanner
                onScan={vi.fn()}
                detector={{ detect: vi.fn(async () => []) }}
                intervalMs={5}
            />,
        );

        await waitFor(() =>
            expect(screen.getByRole("status")).toHaveTextContent("Procurando código…"),
        );
    });

    it("says it is paused while it is", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<BarcodeScanner onScan={vi.fn()} detector={heldInFrame("1")} paused />);

        await waitFor(() =>
            expect(screen.getByRole("status")).toHaveTextContent("Leitura pausada"),
        );
    });

    it("offers the torch only when the camera has one, and toggles it", async () => {
        const { stream, video } = fakeVideoStream({ capabilities: { torch: [true] } });
        const devices = installMediaDevices({ getUserMedia: () => Promise.resolve(stream) });
        restores.push(devices.restore);

        render(<BarcodeScanner onScan={vi.fn()} detector={{ detect: vi.fn(async () => []) }} />);

        const toggle = await screen.findByRole("button", { name: "Ligar lanterna" });
        await userEvent.click(toggle);

        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Desligar lanterna" })).toBeInTheDocument(),
        );
        expect(video.applied).toEqual([{ advanced: [{ torch: true }] }]);
    });

    it("hides the torch when asked, even on a camera that has one", async () => {
        const { stream } = fakeVideoStream({ capabilities: { torch: [true] } });
        const devices = installMediaDevices({ getUserMedia: () => Promise.resolve(stream) });
        restores.push(devices.restore);

        render(
            <BarcodeScanner
                onScan={vi.fn()}
                detector={{ detect: vi.fn(async () => []) }}
                torch={false}
            />,
        );

        await waitFor(() => expect(screen.getByRole("group")).toBeInTheDocument());
        expect(screen.queryByRole("button", { name: "Ligar lanterna" })).not.toBeInTheDocument();
    });

    it("shows the camera error with a way out", async () => {
        const devices = installMediaDevices({
            getUserMedia: () => Promise.reject(new DOMException("no", "NotAllowedError")),
        });
        restores.push(devices.restore);

        render(<BarcodeScanner onScan={vi.fn()} detector={heldInFrame("1")} />);

        await waitFor(() =>
            expect(screen.getByText(/Camera permission denied/)).toBeInTheDocument(),
        );
        await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
        // The user may have just changed the permission in site settings.
        await waitFor(() => expect(devices.getUserMedia).toHaveBeenCalledTimes(2));
    });

    it("renders a footer and forwards the aspect ratio", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(
            <BarcodeScanner
                onScan={vi.fn()}
                detector={{ detect: vi.fn(async () => []) }}
                aspectRatio={1}
                footer={<small>Aponte para a embalagem.</small>}
            />,
        );

        await waitFor(() => expect(screen.getByRole("group")).toHaveStyle({ aspectRatio: "1" }));
        expect(screen.getByText("Aponte para a embalagem.")).toBeInTheDocument();
    });

    it("uses the en locale labels", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(
            <BarcodeScanner
                onScan={vi.fn()}
                detector={heldInFrame("42")}
                locale="en"
                intervalMs={5}
            />,
        );

        await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Code read: 42"));
    });

    it("uses the en locale for the unsupported notice too", () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<BarcodeScanner onScan={vi.fn()} locale="en" />);
        expect(screen.getByText("This browser cannot decode barcodes.")).toBeInTheDocument();
    });
});

describe("BarcodeScanner accessibility", () => {
    const restores: Array<() => void> = [];

    beforeEach(() => {
        restores.push(setSecureContext(true), installVideoElement(), removeBarcodeDetector());
    });

    afterEach(() => {
        vi.restoreAllMocks();
        while (restores.length) restores.pop()?.();
    });

    /**
     * Swept here rather than in `components/a11y.test.tsx`, because the interesting
     * states need `getUserMedia` and a decoder mocked — in the shared sweep the
     * component would only ever render its "this browser cannot decode" fallback, and
     * auditing that proves nothing about the scanner.
     */
    it("has no axe violations while unsupported, while scanning, or after a read", async () => {
        const { stream } = fakeVideoStream({ capabilities: { torch: [true] } });
        const devices = installMediaDevices({ getUserMedia: () => Promise.resolve(stream) });
        restores.push(devices.restore);

        const bare = render(<BarcodeScanner onScan={vi.fn()} />);
        expect(formatA11yViolations(await findA11yViolations(bare.baseElement))).toBe("");
        bare.unmount();

        const view = render(
            <BarcodeScanner
                onScan={vi.fn()}
                detector={heldInFrame("7891234567895")}
                intervalMs={5}
                footer={<small>Aponte para a embalagem.</small>}
            />,
        );
        await waitFor(() => expect(screen.getByRole("group")).toBeInTheDocument());
        expect(formatA11yViolations(await findA11yViolations(view.baseElement))).toBe("");

        await waitFor(() =>
            expect(screen.getByRole("status")).toHaveTextContent("Código lido: 7891234567895"),
        );
        expect(formatA11yViolations(await findA11yViolations(view.baseElement))).toBe("");
    });
});
