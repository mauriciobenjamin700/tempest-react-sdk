import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VideoPlayer } from "./VideoPlayer";

/**
 * jsdom's `HTMLMediaElement` throws on `play()` and hard-codes `paused: true`.
 *
 * The `paused` getter has to move with the stub: the component decides between
 * play and pause by reading it, so a permanently-paused element makes the pause
 * path unreachable and a test of it silently passes for the wrong reason.
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

const videoEl = (): HTMLVideoElement => {
    const node = document.querySelector("video");
    if (!node) throw new Error("no <video> rendered");
    return node;
};

describe("VideoPlayer", () => {
    const restores: Array<() => void> = [];

    beforeEach(() => {
        restores.push(installMediaElement());
    });

    afterEach(() => {
        for (const restore of restores.splice(0)) restore();
    });

    it("renders a video that stays in the page on iOS", async () => {
        render(<VideoPlayer src="/clipe.webm" poster="/capa.webp" />);

        const node = videoEl();
        expect(node).toHaveAttribute("playsinline");
        expect(node).toHaveAttribute("poster", "/capa.webp");
        expect(node).toHaveAttribute("src", "/clipe.webm");
    });

    it("toggles play and pause", async () => {
        render(<VideoPlayer src="/clipe.webm" />);

        await userEvent.click(screen.getByRole("button", { name: "Tocar" }));
        expect(await screen.findByRole("button", { name: "Pausar" })).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Pausar" }));
        expect(screen.getByRole("button", { name: "Tocar" })).toBeInTheDocument();
    });

    it("reports a refused play instead of pretending it started", async () => {
        restores.push(installMediaElement({ playRejects: true }));
        const onError = vi.fn();
        render(<VideoPlayer src="/clipe.webm" onError={onError} />);

        await userEvent.click(screen.getByRole("button", { name: "Tocar" }));

        expect(onError).toHaveBeenCalledOnce();
        expect(screen.getByRole("button", { name: "Tocar" })).toBeInTheDocument();
    });

    it("seeks, and moves the elapsed label with it", () => {
        render(<VideoPlayer src="/clipe.webm" durationMs={20_000} />);

        fireEvent.change(screen.getByRole("slider", { name: "Posição" }), {
            target: { value: "8000" },
        });

        expect(videoEl().currentTime).toBe(8);
        expect(screen.getByText("0:08")).toBeInTheDocument();
    });

    it("prefers a caller-supplied duration over the element's", () => {
        render(<VideoPlayer src="/clipe.webm" durationMs={7_000} />);

        expect(screen.getByText("0:07")).toBeInTheDocument();
    });

    it("uses the duration the element reports for a plain URL", () => {
        render(<VideoPlayer src="/clipe.webm" />);
        const node = videoEl();
        setDuration(node, 42);

        fireEvent.loadedMetadata(node);

        expect(screen.getByText("0:42")).toBeInTheDocument();
    });

    it("does not probe when the caller already gave a duration", () => {
        render(<VideoPlayer src="/gravacao.webm" durationMs={9_000} />);
        const node = videoEl();
        setDuration(node, Number.POSITIVE_INFINITY);

        fireEvent.loadedMetadata(node);

        expect(node.currentTime, "no seek past the end").toBe(0);
        expect(screen.getByText("0:09")).toBeInTheDocument();
    });

    it("follows the element when something else starts it", () => {
        render(<VideoPlayer src="/clipe.webm" />);
        const node = videoEl();

        fireEvent.play(node);
        expect(screen.getByRole("button", { name: "Pausar" })).toBeInTheDocument();

        fireEvent.pause(node);
        expect(screen.getByRole("button", { name: "Tocar" })).toBeInTheDocument();
    });

    it("moves the elapsed label as the element reports progress", () => {
        render(<VideoPlayer src="/clipe.webm" durationMs={30_000} />);
        const node = videoEl();
        node.currentTime = 5;

        fireEvent.timeUpdate(node);

        expect(screen.getByText("0:05")).toBeInTheDocument();
    });

    it("coaxes a duration out of an element reporting Infinity", () => {
        render(<VideoPlayer src="/gravacao.webm" />);
        const node = videoEl();
        setDuration(node, Number.POSITIVE_INFINITY);

        fireEvent.loadedMetadata(node);
        expect(node.currentTime, "seeks past the end to force a demux").toBe(1e101);

        setDuration(node, 12);
        fireEvent.timeUpdate(node);

        expect(screen.getByText("0:12")).toBeInTheDocument();
        expect(node.currentTime, "and puts the position back").toBe(0);
    });
});

describe("VideoPlayer · the rate", () => {
    const restores: Array<() => void> = [];

    beforeEach(() => {
        restores.push(installMediaElement());
    });

    afterEach(() => {
        for (const restore of restores.splice(0)) restore();
    });

    /**
     * The defect this pins is invisible in jsdom, so the assertion is structural.
     *
     * A browser copies `defaultPlaybackRate` onto `playbackRate` when a source
     * loads, so a player that writes only the second silently drops back to 1×
     * on every clip change. jsdom keeps the two as independent values and
     * implements no load algorithm at all — measured in
     * `node_modules/jsdom/lib/jsdom/living/nodes/HTMLMediaElement-impl.js` —
     * which means no jsdom test can observe the reset. What it *can* observe is
     * that both are written, which is what prevents it.
     */
    it("writes both playbackRate and defaultPlaybackRate", () => {
        const { rerender } = render(<VideoPlayer src="/um.webm" rate={2} />);

        expect(videoEl().playbackRate).toBe(2);
        expect(videoEl().defaultPlaybackRate, "or the rate is lost on load").toBe(2);

        rerender(<VideoPlayer src="/dois.webm" rate={2} />);

        expect(videoEl().playbackRate).toBe(2);
        expect(videoEl().defaultPlaybackRate).toBe(2);
    });

    it("keeps the pitch by default, and lets it rise when asked", () => {
        const { rerender } = render(<VideoPlayer src="/clipe.webm" rate={1.5} />);
        expect(videoEl().preservesPitch).toBe(true);

        rerender(<VideoPlayer src="/clipe.webm" rate={1.5} shiftPitch />);
        expect(videoEl().preservesPitch).toBe(false);
    });

    it("does not move a controlled rate on its own", async () => {
        const onRateChange = vi.fn();
        render(<VideoPlayer src="/clipe.webm" rate={1} onRateChange={onRateChange} />);

        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Velocidade" }), "2");

        expect(onRateChange).toHaveBeenCalledWith(2);
        expect(videoEl().playbackRate, "the caller owns the value").toBe(1);
    });

    it("moves an uncontrolled rate itself", async () => {
        render(<VideoPlayer src="/clipe.webm" />);

        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Velocidade" }), "0.5");

        expect(videoEl().playbackRate).toBe(0.5);
        expect(videoEl().defaultPlaybackRate).toBe(0.5);
    });

    it("labels the presets the way the locale reads them", () => {
        const { rerender } = render(<VideoPlayer src="/clipe.webm" rates={[1.5]} />);
        expect(screen.getByRole("option", { name: "1,5×" })).toBeInTheDocument();

        rerender(<VideoPlayer src="/clipe.webm" rates={[1.5]} locale="en" />);
        expect(screen.getByRole("option", { name: "1.5×" })).toBeInTheDocument();
    });

    it("hides the control when there is nothing to pick", () => {
        render(<VideoPlayer src="/clipe.webm" rates={[]} />);

        expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });
});

describe("VideoPlayer · sound, captions and the frame", () => {
    const restores: Array<() => void> = [];

    beforeEach(() => {
        restores.push(installMediaElement());
    });

    afterEach(() => {
        for (const restore of restores.splice(0)) restore();
    });

    it("mutes and unmutes", async () => {
        render(<VideoPlayer src="/clipe.webm" />);

        await userEvent.click(screen.getByRole("button", { name: "Silenciar" }));
        expect(videoEl().muted).toBe(true);

        await userEvent.click(screen.getByRole("button", { name: "Ativar som" }));
        expect(videoEl().muted).toBe(false);
    });

    it("treats a volume dragged to zero as muting", () => {
        render(<VideoPlayer src="/clipe.webm" />);

        fireEvent.change(screen.getByRole("slider", { name: "Volume" }), {
            target: { value: "0" },
        });

        expect(videoEl().muted).toBe(true);
        expect(screen.getByRole("button", { name: "Ativar som" })).toBeInTheDocument();
    });

    it("follows a volume change the element made on its own", () => {
        render(<VideoPlayer src="/clipe.webm" />);
        const node = videoEl();

        node.volume = 0.25;
        node.muted = true;
        fireEvent.volumeChange(node);

        expect(screen.getByRole("button", { name: "Ativar som" })).toBeInTheDocument();
    });

    it("renders one track per caption file, honouring the default", () => {
        render(
            <VideoPlayer
                src="/clipe.webm"
                tracks={[
                    { src: "/pt.vtt", srcLang: "pt-BR", label: "Português", default: true },
                    { src: "/en.vtt", srcLang: "en", label: "English", kind: "subtitles" },
                ]}
            />,
        );

        const rendered = [...document.querySelectorAll("track")];
        expect(rendered).toHaveLength(2);
        expect(rendered[0]).toHaveAttribute("kind", "captions");
        expect(rendered[0]).toHaveAttribute("default");
        expect(rendered[1]).toHaveAttribute("kind", "subtitles");
        expect(rendered[1]).not.toHaveAttribute("default");
    });

    it("keeps the frame shape before the video reports one", () => {
        render(<VideoPlayer src="/clipe.webm" aspectRatio={4 / 3} />);

        const frame = videoEl().parentElement;
        expect(frame?.style.aspectRatio, "jsdom normalises the shorthand to `n / 1`").toBe(
            `${4 / 3} / 1`,
        );
    });

    it("hides the fullscreen button when the caller does not want it", () => {
        render(<VideoPlayer src="/clipe.webm" fullscreen={false} />);

        expect(screen.queryByRole("button", { name: "Tela cheia" })).not.toBeInTheDocument();
    });

    it("disables every control at once", () => {
        render(<VideoPlayer src="/clipe.webm" durationMs={5_000} disabled />);

        expect(screen.getByRole("button", { name: "Tocar" })).toBeDisabled();
        expect(screen.getByRole("slider", { name: "Posição" })).toBeDisabled();
        expect(screen.getByRole("slider", { name: "Volume" })).toBeDisabled();
        expect(screen.getByRole("combobox", { name: "Velocidade" })).toBeDisabled();
    });

    it("reports a decode failure from the element", () => {
        const onError = vi.fn();
        render(<VideoPlayer src="/quebrado.webm" onError={onError} />);

        fireEvent.error(videoEl());

        expect(onError).toHaveBeenCalledOnce();
    });

    it("clears the transport when playback reaches the end", () => {
        const onEnded = vi.fn();
        render(<VideoPlayer src="/clipe.webm" onEnded={onEnded} />);

        fireEvent.ended(videoEl());

        expect(onEnded).toHaveBeenCalledOnce();
        expect(screen.getByRole("button", { name: "Tocar" })).toBeInTheDocument();
    });

    it("renders the actions slot", () => {
        render(<VideoPlayer src="/clipe.webm" actions={<button type="button">Baixar</button>} />);

        expect(screen.getByRole("button", { name: "Baixar" })).toBeInTheDocument();
    });
});

describe("VideoPlayer · the object URL for a Blob", () => {
    const restores: Array<() => void> = [];

    beforeEach(() => {
        restores.push(installMediaElement());
    });

    afterEach(() => {
        for (const restore of restores.splice(0)) restore();
        vi.restoreAllMocks();
    });

    it("revokes the URL it made when the blob changes, and on unmount", () => {
        const create = vi
            .spyOn(URL, "createObjectURL")
            .mockImplementation(() => `blob:${Math.random()}`);
        const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

        const first = new Blob(["um"], { type: "video/webm" });
        const second = new Blob(["dois"], { type: "video/webm" });
        const { rerender, unmount } = render(<VideoPlayer src={first} />);
        expect(create).toHaveBeenCalledTimes(1);

        rerender(<VideoPlayer src={second} />);
        expect(revoke).toHaveBeenCalledTimes(1);

        unmount();
        expect(revoke).toHaveBeenCalledTimes(2);
    });

    it("plays a plain URL without minting one", () => {
        const create = vi.spyOn(URL, "createObjectURL");

        render(<VideoPlayer src="/clipe.webm" />);

        expect(create).not.toHaveBeenCalled();
    });

    it("disables the transport while there is nothing to play", () => {
        render(<VideoPlayer src={null} />);

        expect(screen.getByRole("button", { name: "Tocar" })).toBeDisabled();
    });
});

/**
 * jsdom implements no Fullscreen API at all, so `useFullscreen` reports
 * `supported: false` and the button never renders. Installing the two things it
 * reads — `requestFullscreen` on the root and `document.fullscreenElement` — is
 * what puts the control in the tree; the state still comes from the
 * `fullscreenchange` event, which is the whole point of that hook.
 */
function installFullscreen(options: { requestRejects?: boolean } = {}): () => void {
    const proto = Element.prototype as unknown as Record<string, unknown>;
    const previousRequest = proto.requestFullscreen;
    const previousElement = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
    let presented: Element | null = null;

    /*
     * On `Element.prototype`, not on `documentElement`: `isFullscreenSupported`
     * probes the root, and `enter()` calls the method on the target element —
     * stubbing only the root makes the control render and then refuse. What gets
     * presented is looked up by test id rather than read off `this`, because the
     * tests render exactly one player and an arrow keeps the lint rule about
     * aliasing `this` satisfied.
     */
    proto.requestFullscreen = vi.fn(async () => {
        if (options.requestRejects) throw new Error("refused");
        presented = document.querySelector("[data-testid='player']");
        document.dispatchEvent(new Event("fullscreenchange"));
    });
    Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => presented,
    });
    Object.defineProperty(document, "exitFullscreen", {
        configurable: true,
        writable: true,
        value: vi.fn(async () => {
            presented = null;
            document.dispatchEvent(new Event("fullscreenchange"));
        }),
    });

    return () => {
        proto.requestFullscreen = previousRequest;
        if (previousElement) Object.defineProperty(document, "fullscreenElement", previousElement);
        else delete (document as unknown as Record<string, unknown>).fullscreenElement;
    };
}

describe("VideoPlayer · fullscreen", () => {
    const restores: Array<() => void> = [];

    afterEach(() => {
        for (const restore of restores.splice(0)) restore();
        vi.restoreAllMocks();
    });

    it("offers the control, and flips the label from the browser's own event", async () => {
        restores.push(installMediaElement(), installFullscreen());
        render(<VideoPlayer src="/clipe.webm" data-testid="player" />);

        await userEvent.click(screen.getByRole("button", { name: "Tela cheia" }));

        const exit = await screen.findByRole("button", { name: "Sair da tela cheia" });
        expect(exit).toBeInTheDocument();

        await userEvent.click(exit);
        expect(await screen.findByRole("button", { name: "Tela cheia" })).toBeInTheDocument();
    });

    it("reports a refused request instead of pretending it worked", async () => {
        restores.push(installMediaElement(), installFullscreen({ requestRejects: true }));
        const onError = vi.fn();
        render(<VideoPlayer src="/clipe.webm" data-testid="player" onError={onError} />);

        await userEvent.click(screen.getByRole("button", { name: "Tela cheia" }));

        expect(onError).toHaveBeenCalledOnce();
        expect(screen.getByRole("button", { name: "Tela cheia" })).toBeInTheDocument();
    });
});
