import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { fakeStream, fakeVideoStream } from "../../test/audio-mocks";
import { useTorch } from "./use-torch";

function Probe({ stream }: { stream: MediaStream | null }) {
    const torch = useTorch(stream);
    return (
        <div>
            <span data-testid="supported">{String(torch.supported)}</span>
            <span data-testid="on">{String(torch.on)}</span>
            <button type="button" onClick={() => void torch.toggle()}>
                toggle
            </button>
            <button type="button" onClick={() => void torch.set(true)}>
                on
            </button>
        </div>
    );
}

const click = (name: string): void => {
    act(() => screen.getByRole("button", { name }).click());
};

describe("useTorch", () => {
    it("reports no lamp without a stream", () => {
        render(<Probe stream={null} />);
        expect(screen.getByTestId("supported")).toHaveTextContent("false");
    });

    it("does nothing when asked to light a lamp that is not there", () => {
        render(<Probe stream={null} />);
        click("on");
        expect(screen.getByTestId("on")).toHaveTextContent("false");
    });

    it("reports no lamp on an audio-only stream", () => {
        render(<Probe stream={fakeStream()} />);
        expect(screen.getByTestId("supported")).toHaveTextContent("false");
    });

    it("reports no lamp on a camera that has none", () => {
        const { stream } = fakeVideoStream({ capabilities: { facingMode: ["user"] } });
        render(<Probe stream={stream} />);
        expect(screen.getByTestId("supported")).toHaveTextContent("false");
    });

    it("finds the lamp through getCapabilities", () => {
        const { stream } = fakeVideoStream({ capabilities: { torch: [false, true] } });
        render(<Probe stream={stream} />);
        expect(screen.getByTestId("supported")).toHaveTextContent("true");
        expect(screen.getByTestId("on")).toHaveTextContent("false");
    });

    it("falls back to getSettings where getCapabilities is missing", () => {
        const { stream } = fakeVideoStream({
            hasCapabilities: false,
            settings: { torch: true },
        });
        render(<Probe stream={stream} />);
        expect(screen.getByTestId("supported")).toHaveTextContent("true");
        // A lamp already lit by a previous session must not read as off.
        expect(screen.getByTestId("on")).toHaveTextContent("true");
    });

    it("applies the constraint and tracks the state", async () => {
        const { stream, video } = fakeVideoStream({ capabilities: { torch: [false, true] } });
        render(<Probe stream={stream} />);

        click("toggle");

        await waitFor(() => expect(screen.getByTestId("on")).toHaveTextContent("true"));
        expect(video.applied).toEqual([{ advanced: [{ torch: true }] }]);

        click("toggle");
        await waitFor(() => expect(screen.getByTestId("on")).toHaveTextContent("false"));
        expect(video.applied.at(-1)).toEqual({ advanced: [{ torch: false }] });
    });

    it("reports no lamp once the track refuses the constraint", async () => {
        const { stream, video } = fakeVideoStream({ capabilities: { torch: [true] } });
        video.applyShouldReject = true;
        render(<Probe stream={stream} />);

        click("on");

        // Reporting `supported` after a rejection would keep a dead button on screen.
        await waitFor(() => expect(screen.getByTestId("supported")).toHaveTextContent("false"));
        expect(screen.getByTestId("on")).toHaveTextContent("false");
    });

    it("resets when the stream is released", () => {
        const { stream } = fakeVideoStream({ capabilities: { torch: [true] } });
        const view = render(<Probe stream={stream} />);
        expect(screen.getByTestId("supported")).toHaveTextContent("true");

        view.rerender(<Probe stream={null} />);
        expect(screen.getByTestId("supported")).toHaveTextContent("false");
    });
});
