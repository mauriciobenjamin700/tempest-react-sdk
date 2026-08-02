import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    FakeBarcodeDetector,
    fakeVideoStream,
    installBarcodeDetector,
    installMediaDevices,
    installVideoElement,
    removeBarcodeDetector,
    setSecureContext,
} from "../../test/audio-mocks";
import { useBarcodeScanner, type UseBarcodeScannerOptions } from "./use-barcode-scanner";

function Probe(options: UseBarcodeScannerOptions) {
    const scanner = useBarcodeScanner({ intervalMs: 5, ...options });
    return (
        <div>
            <video ref={scanner.videoRef} data-testid="video" />
            <span data-testid="status">{scanner.status}</span>
            <span data-testid="supported">{String(scanner.supported)}</span>
            <span data-testid="scanning">{String(scanner.scanning)}</span>
            <span data-testid="formats">{scanner.formats.join(",")}</span>
            <span data-testid="value">{scanner.result?.rawValue ?? ""}</span>
            <span data-testid="format">{scanner.result?.format ?? ""}</span>
            <span data-testid="torch">{String(scanner.torch.supported)}</span>
            <span data-testid="error">{scanner.error?.kind ?? ""}</span>
        </div>
    );
}

/** A detector that always sees the same code, as a symbol held in frame does. */
function heldInFrame(rawValue: string, format = "ean_13") {
    return {
        detect: vi.fn(async () => [{ rawValue, format }]),
    };
}

describe("useBarcodeScanner", () => {
    const restores: Array<() => void> = [];

    beforeEach(() => {
        restores.push(setSecureContext(true), installVideoElement());
    });

    afterEach(() => {
        vi.restoreAllMocks();
        while (restores.length) restores.pop()?.();
    });

    it("reports unsupported when there is no decoder and none was injected", async () => {
        restores.push(removeBarcodeDetector());
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<Probe />);

        await waitFor(() => expect(screen.getByTestId("supported")).toHaveTextContent("false"));
        expect(screen.getByTestId("formats")).toHaveTextContent("");
        expect(screen.getByTestId("scanning")).toHaveTextContent("false");
    });

    it("does not open the camera at all while unsupported", async () => {
        restores.push(removeBarcodeDetector());
        const devices = installMediaDevices({});
        restores.push(devices.restore);
        const onScan = vi.fn();

        render(<Probe onScan={onScan} />);
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("idle"));

        // A prompt spent to then say "this browser cannot decode" also spends the next
        // feature that needs the camera, because a refusal is permanent.
        expect(devices.getUserMedia).not.toHaveBeenCalled();
        expect(onScan).not.toHaveBeenCalled();
    });

    it("asks the engine which formats it has, and uses the intersection", async () => {
        restores.push(installBarcodeDetector());
        FakeBarcodeDetector.supportedFormats = ["qr_code", "code_128"];
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<Probe />);

        // `new BarcodeDetector({ formats })` throws on an unknown entry, and the list
        // differs between two Chromium builds on two operating systems.
        await waitFor(() =>
            expect(screen.getByTestId("formats")).toHaveTextContent("qr_code,code_128"),
        );
        expect(FakeBarcodeDetector.instances[0].formats).toEqual(["qr_code", "code_128"]);
    });

    it("keeps the requested formats when the engine will not say", async () => {
        restores.push(installBarcodeDetector({ withoutProbe: true }));
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<Probe formats={["qr_code"]} />);

        await waitFor(() => expect(screen.getByTestId("formats")).toHaveTextContent("qr_code"));
    });

    it("reports unsupported when nothing requested is available", async () => {
        restores.push(installBarcodeDetector());
        FakeBarcodeDetector.supportedFormats = ["qr_code"];
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<Probe formats={["pdf417"]} />);

        await waitFor(() => expect(screen.getByTestId("supported")).toHaveTextContent("false"));
    });

    it("reports unsupported when the engine refuses to build a detector", async () => {
        restores.push(installBarcodeDetector());
        FakeBarcodeDetector.constructorShouldThrow = true;
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<Probe />);

        await waitFor(() => expect(screen.getByTestId("supported")).toHaveTextContent("false"));
    });

    it("scans with an injected detector where the native API is missing", async () => {
        restores.push(removeBarcodeDetector());
        const devices = installMediaDevices({});
        restores.push(devices.restore);
        const onScan = vi.fn();
        const detector = heldInFrame("00012345678905", "upc_a");

        render(<Probe detector={detector} onScan={onScan} />);

        await waitFor(() => expect(onScan).toHaveBeenCalledTimes(1));
        expect(screen.getByTestId("supported")).toHaveTextContent("true");
        expect(screen.getByTestId("value")).toHaveTextContent("00012345678905");
        expect(screen.getByTestId("format")).toHaveTextContent("upc_a");
    });

    it("fires once for a code held in frame, not on every look", async () => {
        restores.push(removeBarcodeDetector());
        const devices = installMediaDevices({});
        restores.push(devices.restore);
        const onScan = vi.fn();
        const detector = heldInFrame("7891234567895");

        render(<Probe detector={detector} onScan={onScan} repeatDelayMs={10_000} />);

        await waitFor(() => expect(detector.detect.mock.calls.length).toBeGreaterThan(4));
        // Wired to "add to cart", ten reads a second is a bug the user pays for.
        expect(onScan).toHaveBeenCalledTimes(1);
    });

    it("fires again for the same code once the suppression window passes", async () => {
        restores.push(removeBarcodeDetector());
        const devices = installMediaDevices({});
        restores.push(devices.restore);
        const onScan = vi.fn();
        const detector = heldInFrame("7891234567895");

        render(<Probe detector={detector} onScan={onScan} repeatDelayMs={20} />);

        await waitFor(() => expect(onScan.mock.calls.length).toBeGreaterThanOrEqual(2));
    });

    it("never suppresses a different value", async () => {
        restores.push(removeBarcodeDetector());
        const devices = installMediaDevices({});
        restores.push(devices.restore);
        const onScan = vi.fn();
        let value = "111";
        const detector = { detect: vi.fn(async () => [{ rawValue: value, format: "ean_13" }]) };

        render(<Probe detector={detector} onScan={onScan} repeatDelayMs={10_000} />);
        await waitFor(() => expect(onScan).toHaveBeenCalledTimes(1));

        value = "222";
        await waitFor(() => expect(onScan).toHaveBeenCalledTimes(2));
        expect(onScan.mock.calls[1][0].rawValue).toBe("222");
    });

    it("ignores a detection with an empty value", async () => {
        restores.push(removeBarcodeDetector());
        const devices = installMediaDevices({});
        restores.push(devices.restore);
        const onScan = vi.fn();
        const detector = { detect: vi.fn(async () => [{ format: "ean_13" }]) };

        render(<Probe detector={detector} onScan={onScan} />);

        await waitFor(() => expect(detector.detect.mock.calls.length).toBeGreaterThan(2));
        expect(onScan).not.toHaveBeenCalled();
    });

    it("stops looking while paused, without releasing the camera", async () => {
        restores.push(removeBarcodeDetector());
        const devices = installMediaDevices({});
        restores.push(devices.restore);
        const onScan = vi.fn();
        const detector = heldInFrame("7891234567895");

        const view = render(<Probe detector={detector} onScan={onScan} paused />);
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
        expect(screen.getByTestId("scanning")).toHaveTextContent("false");
        expect(detector.detect).not.toHaveBeenCalled();

        view.rerender(<Probe detector={detector} onScan={onScan} />);
        await waitFor(() => expect(onScan).toHaveBeenCalledTimes(1));
        // One prompt, one stream: pausing must not cost a second permission round-trip.
        expect(devices.getUserMedia).toHaveBeenCalledTimes(1);
    });

    it("does not decode a frame the video has not produced yet", async () => {
        restores.pop()?.();
        restores.push(installVideoElement({ readyState: 0 }));
        restores.push(removeBarcodeDetector());
        const devices = installMediaDevices({});
        restores.push(devices.restore);
        const detector = heldInFrame("7891234567895");

        render(<Probe detector={detector} />);
        await waitFor(() => expect(screen.getByTestId("scanning")).toHaveTextContent("true"));

        // `detect()` on a video with no current frame throws `InvalidStateError`.
        expect(detector.detect).not.toHaveBeenCalled();
    });

    it("does not decode a frame with no size yet", async () => {
        restores.pop()?.();
        restores.push(installVideoElement({ width: 0 }));
        restores.push(removeBarcodeDetector());
        const devices = installMediaDevices({});
        restores.push(devices.restore);
        const detector = heldInFrame("7891234567895");

        render(<Probe detector={detector} />);
        await waitFor(() => expect(screen.getByTestId("scanning")).toHaveTextContent("true"));

        expect(detector.detect).not.toHaveBeenCalled();
    });

    it("survives an engine that refuses a frame, and reports it", async () => {
        restores.push(removeBarcodeDetector());
        const devices = installMediaDevices({});
        restores.push(devices.restore);
        const onError = vi.fn();
        const detector = { detect: vi.fn(async () => Promise.reject(new Error("bad frame"))) };

        render(<Probe detector={detector} onError={onError} />);

        await waitFor(() => expect(onError).toHaveBeenCalled());
        // A failed frame is usually transient, so the loop keeps going.
        await waitFor(() => expect(detector.detect.mock.calls.length).toBeGreaterThan(2));
        expect(screen.getByTestId("scanning")).toHaveTextContent("true");
    });

    it("surfaces the camera error and stops looking", async () => {
        restores.push(removeBarcodeDetector());
        const devices = installMediaDevices({
            getUserMedia: () => Promise.reject(new DOMException("no", "NotAllowedError")),
        });
        restores.push(devices.restore);
        const detector = heldInFrame("7891234567895");

        render(<Probe detector={detector} />);

        await waitFor(() =>
            expect(screen.getByTestId("error")).toHaveTextContent("permission-denied"),
        );
        expect(screen.getByTestId("scanning")).toHaveTextContent("false");
        expect(detector.detect).not.toHaveBeenCalled();
    });

    it("exposes the torch of the camera it opened", async () => {
        restores.push(removeBarcodeDetector());
        const { stream } = fakeVideoStream({ capabilities: { torch: [true] } });
        const devices = installMediaDevices({ getUserMedia: () => Promise.resolve(stream) });
        restores.push(devices.restore);

        render(<Probe detector={heldInFrame("1")} />);

        await waitFor(() => expect(screen.getByTestId("torch")).toHaveTextContent("true"));
    });

    it("stops the loop at unmount", async () => {
        restores.push(removeBarcodeDetector());
        const devices = installMediaDevices({});
        restores.push(devices.restore);
        const detector = heldInFrame("7891234567895");

        const view = render(<Probe detector={detector} />);
        await waitFor(() => expect(detector.detect).toHaveBeenCalled());

        view.unmount();
        const after = detector.detect.mock.calls.length;
        await new Promise((resolve) => setTimeout(resolve, 40));
        expect(detector.detect.mock.calls.length).toBe(after);
    });
});
