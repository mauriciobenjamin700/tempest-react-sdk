import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AudioPlayer } from "./AudioPlayer";

/**
 * jsdom's `HTMLMediaElement` throws on `play()` and hard-codes `paused: true`.
 *
 * The `paused` getter has to move with the stub: the component decides between play
 * and pause by reading it, so a permanently-paused element makes the pause path
 * unreachable and a test of it silently passes for the wrong reason.
 */
function installMediaElement(options: { playRejects?: boolean } = {}): () => void {
    const proto = HTMLMediaElement.prototype as unknown as Record<string, unknown>;
    const previous = {
        play: proto.play,
        pause: proto.pause,
        paused: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "paused"),
    };
    let paused = true;

    proto.play = vi.fn(() => {
        if (options.playRejects) return Promise.reject(new Error("blocked"));
        paused = false;
        return Promise.resolve();
    });
    proto.pause = vi.fn(() => {
        paused = true;
    });
    Object.defineProperty(HTMLMediaElement.prototype, "paused", {
        configurable: true,
        get: () => paused,
    });

    return () => {
        proto.play = previous.play;
        proto.pause = previous.pause;
        if (previous.paused) {
            Object.defineProperty(HTMLMediaElement.prototype, "paused", previous.paused);
        }
    };
}

/** Force `duration`, which jsdom reports as `NaN`. */
function setDuration(node: HTMLMediaElement, value: number): void {
    Object.defineProperty(node, "duration", { configurable: true, value });
}

const audioEl = (): HTMLAudioElement => {
    const node = document.querySelector("audio");
    if (!node) throw new Error("no <audio> rendered");
    return node;
};

describe("AudioPlayer", () => {
    const restores: Array<() => void> = [];

    beforeEach(() => {
        restores.push(installMediaElement());
    });

    afterEach(() => {
        while (restores.length) restores.pop()?.();
    });

    it("shows a placeholder total until a duration is known", () => {
        render(<AudioPlayer src="/note.webm" />);
        // `<audio>.duration` on a fresh MediaRecorder blob is `Infinity`; `NaN:aN` is
        // the bug this guards against.
        expect(screen.getAllByText("--:--").length).toBeGreaterThan(0);
    });

    it("prefers a caller-supplied duration over the element's", () => {
        render(<AudioPlayer src="/note.webm" durationMs={7_000} />);
        expect(screen.getByText("0:07")).toBeInTheDocument();
    });

    it("uses the element's duration for a plain URL", () => {
        render(<AudioPlayer src="/song.mp3" />);
        setDuration(audioEl(), 12);
        fireEvent.loadedMetadata(audioEl());
        expect(screen.getByText("0:12")).toBeInTheDocument();
    });

    it("coaxes a duration out of an element reporting Infinity", () => {
        render(<AudioPlayer src="/note.webm" />);
        const node = audioEl();
        setDuration(node, Number.POSITIVE_INFINITY);

        fireEvent.loadedMetadata(node);
        // The seek past the end is the only way to make the browser demux to the last
        // frame and learn the real length.
        expect(node.currentTime).toBeGreaterThan(1e100);

        setDuration(node, 5);
        fireEvent.timeUpdate(node);
        expect(screen.getByText("0:05")).toBeInTheDocument();
    });

    it("does not probe when the caller already gave a duration", () => {
        render(<AudioPlayer src="/note.webm" durationMs={3_000} />);
        const node = audioEl();
        setDuration(node, Number.POSITIVE_INFINITY);
        fireEvent.loadedMetadata(node);
        expect(node.currentTime).toBe(0);
    });

    it("toggles play and pause", async () => {
        render(<AudioPlayer src="/note.webm" durationMs={5_000} />);

        await userEvent.click(screen.getByRole("button", { name: "Tocar" }));
        expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();

        fireEvent.play(audioEl());
        await userEvent.click(screen.getByRole("button", { name: "Pausar" }));
        expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    });

    it("reports a blocked play", async () => {
        while (restores.length) restores.pop()?.();
        restores.push(installMediaElement({ playRejects: true }));
        const onError = vi.fn();
        render(<AudioPlayer src="/note.webm" durationMs={5_000} onError={onError} />);

        await userEvent.click(screen.getByRole("button", { name: "Tocar" }));
        expect(onError).toHaveBeenCalledTimes(1);
    });

    it("seeks and keeps the accessible value in sync", () => {
        render(<AudioPlayer src="/note.webm" durationMs={10_000} />);
        const slider = screen.getByRole("slider", { name: "Posição" });

        fireEvent.change(slider, { target: { value: "4000" } });

        expect(audioEl().currentTime).toBe(4);
        expect(slider).toHaveAttribute("aria-valuetext", "0:04 / 0:10");
    });

    it("disables the seek bar while the length is unknown", () => {
        render(<AudioPlayer src="/note.webm" />);
        expect(screen.getByRole("slider", { name: "Posição" })).toBeDisabled();
    });

    it("follows playback position", () => {
        render(<AudioPlayer src="/note.webm" durationMs={10_000} />);
        const node = audioEl();
        Object.defineProperty(node, "currentTime", {
            configurable: true,
            writable: true,
            value: 3,
        });

        fireEvent.timeUpdate(node);
        expect(screen.getByText("0:03")).toBeInTheDocument();
    });

    it("rewinds and reports the end", () => {
        const onEnded = vi.fn();
        render(<AudioPlayer src="/note.webm" durationMs={10_000} onEnded={onEnded} />);

        fireEvent.ended(audioEl());

        expect(onEnded).toHaveBeenCalledTimes(1);
        expect(screen.getByText("0:00")).toBeInTheDocument();
    });

    it("reports an element error", () => {
        const onError = vi.fn();
        render(<AudioPlayer src="/broken.webm" onError={onError} />);
        fireEvent.error(audioEl());
        expect(onError).toHaveBeenCalledTimes(1);
    });

    it("wraps a Blob in an object URL", () => {
        const created = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
        try {
            render(<AudioPlayer src={new Blob([new Uint8Array(4)])} durationMs={1_000} />);
            expect(created).toHaveBeenCalledTimes(1);
            expect(audioEl()).toHaveAttribute("src", "blob:fake");
        } finally {
            created.mockRestore();
        }
    });

    it("revokes the object URL when it unmounts", () => {
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
        const revoked = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
        try {
            // A page that records twenty notes must not leak twenty URLs.
            render(<AudioPlayer src={new Blob([new Uint8Array(4)])} />).unmount();
            expect(revoked).toHaveBeenCalledWith("blob:fake");
        } finally {
            vi.restoreAllMocks();
        }
    });

    it("disables the transport with no source", () => {
        render(<AudioPlayer src={null} />);
        expect(screen.getByRole("button", { name: "Tocar" })).toBeDisabled();
    });

    it("honours disabled", () => {
        render(<AudioPlayer src="/note.webm" durationMs={5_000} disabled />);
        expect(screen.getByRole("button", { name: "Tocar" })).toBeDisabled();
        expect(screen.getByRole("slider", { name: "Posição" })).toBeDisabled();
    });

    it("routes to a chosen output device", async () => {
        const proto = HTMLMediaElement.prototype as unknown as Record<string, unknown>;
        const setSinkId = vi.fn(async () => undefined);
        proto.setSinkId = setSinkId;
        try {
            render(<AudioPlayer src="/note.webm" sinkId="spk-2" durationMs={1_000} />);
            await vi.waitFor(() => expect(setSinkId).toHaveBeenCalledWith("spk-2"));
        } finally {
            delete proto.setSinkId;
        }
    });

    it("renders caller actions and passes loop through", () => {
        render(
            <AudioPlayer
                src="/note.webm"
                durationMs={1_000}
                loop
                actions={<button type="button">Baixar</button>}
            />,
        );
        expect(screen.getByRole("button", { name: "Baixar" })).toBeInTheDocument();
        expect(audioEl()).toHaveAttribute("loop");
    });

    it("uses the en locale labels", () => {
        render(<AudioPlayer src="/note.webm" durationMs={1_000} locale="en" />);
        expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
        expect(screen.getByRole("slider", { name: "Seek" })).toBeInTheDocument();
    });

    it("resets when the source changes", () => {
        const view = render(<AudioPlayer src="/a.webm" durationMs={9_000} />);
        const node = audioEl();
        Object.defineProperty(node, "currentTime", {
            configurable: true,
            writable: true,
            value: 5,
        });
        fireEvent.timeUpdate(node);
        expect(screen.getByText("0:05")).toBeInTheDocument();

        view.rerender(<AudioPlayer src="/b.webm" durationMs={9_000} />);
        expect(screen.getByText("0:00")).toBeInTheDocument();
    });

    it("follows a pause that came from the element itself", () => {
        const restore = installMediaElement();
        const { container } = render(<AudioPlayer src="/nota.webm" durationMs={4000} />);
        const audio = container.querySelector("audio") as HTMLAudioElement;

        fireEvent.play(audio);
        expect(screen.getByRole("button", { name: "Pausar" })).toBeInTheDocument();

        fireEvent.pause(audio);
        expect(screen.getByRole("button", { name: "Tocar" })).toBeInTheDocument();

        restore();
    });
});
