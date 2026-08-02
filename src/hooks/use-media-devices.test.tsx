import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { fakeDevice, installMediaDevices, removeMediaDevices } from "../../test/audio-mocks";
import { useMediaDevices } from "./use-media-devices";

function Probe() {
    const { audioInputs, audioOutputs, videoInputs, labelsAvailable, supported, refresh } =
        useMediaDevices();
    return (
        <div>
            <span data-testid="mics">{audioInputs.map((d) => d.deviceId).join(",")}</span>
            <span data-testid="outs">{audioOutputs.map((d) => d.deviceId).join(",")}</span>
            <span data-testid="cams">{videoInputs.map((d) => d.deviceId).join(",")}</span>
            <span data-testid="labels">{String(labelsAvailable)}</span>
            <span data-testid="supported">{String(supported)}</span>
            <button type="button" onClick={refresh}>
                refresh
            </button>
        </div>
    );
}

describe("useMediaDevices", () => {
    const restores: Array<() => void> = [];
    afterEach(() => {
        while (restores.length) restores.pop()?.();
    });

    it("splits the list by kind", async () => {
        const devices = installMediaDevices({
            devices: [
                fakeDevice("audioinput", "mic-1", "Headset"),
                fakeDevice("audiooutput", "spk-1", "Speakers"),
                fakeDevice("videoinput", "cam-1", "Webcam"),
            ],
        });
        restores.push(devices.restore);

        render(<Probe />);

        await waitFor(() => expect(screen.getByTestId("mics")).toHaveTextContent("mic-1"));
        expect(screen.getByTestId("outs")).toHaveTextContent("spk-1");
        expect(screen.getByTestId("cams")).toHaveTextContent("cam-1");
        expect(screen.getByTestId("labels")).toHaveTextContent("true");
    });

    it("reports labelsAvailable false before permission is granted", async () => {
        // The ids are real, the names are not — a picker rendered here is a column of
        // blanks.
        const devices = installMediaDevices({
            devices: [
                fakeDevice("audioinput", "mic-1", ""),
                fakeDevice("audiooutput", "spk-1", ""),
            ],
        });
        restores.push(devices.restore);

        render(<Probe />);

        await waitFor(() => expect(screen.getByTestId("mics")).toHaveTextContent("mic-1"));
        expect(screen.getByTestId("labels")).toHaveTextContent("false");
    });

    it("is false for an empty list, not true-with-no-devices", async () => {
        const devices = installMediaDevices({ devices: [] });
        restores.push(devices.restore);

        render(<Probe />);
        await waitFor(() => expect(screen.getByTestId("labels")).toHaveTextContent("false"));
    });

    it("re-enumerates when a device is plugged in", async () => {
        const devices = installMediaDevices({
            devices: [fakeDevice("audioinput", "mic-1", "Built-in")],
        });
        restores.push(devices.restore);

        render(<Probe />);
        await waitFor(() => expect(screen.getByTestId("mics")).toHaveTextContent("mic-1"));

        devices.setDevices([
            fakeDevice("audioinput", "mic-1", "Built-in"),
            fakeDevice("audioinput", "mic-2", "USB headset"),
        ]);
        act(() => devices.fireDeviceChange());

        await waitFor(() => expect(screen.getByTestId("mics")).toHaveTextContent("mic-1,mic-2"));
    });

    it("re-enumerates on refresh", async () => {
        const devices = installMediaDevices({ devices: [] });
        restores.push(devices.restore);

        render(<Probe />);
        await waitFor(() => expect(screen.getByTestId("supported")).toHaveTextContent("true"));

        devices.setDevices([fakeDevice("audioinput", "mic-9", "Late")]);
        act(() => screen.getByRole("button", { name: "refresh" }).click());

        await waitFor(() => expect(screen.getByTestId("mics")).toHaveTextContent("mic-9"));
    });

    it("empties the list when enumeration fails", async () => {
        const devices = installMediaDevices({
            devices: [fakeDevice("audioinput", "mic-1")],
            enumerateShouldReject: true,
        });
        restores.push(devices.restore);

        render(<Probe />);
        await waitFor(() => expect(screen.getByTestId("mics")).toHaveTextContent(""));
    });

    it("reports unsupported with no mediaDevices", () => {
        restores.push(removeMediaDevices());

        render(<Probe />);

        expect(screen.getByTestId("supported")).toHaveTextContent("false");
        expect(screen.getByTestId("mics")).toHaveTextContent("");
    });
});
