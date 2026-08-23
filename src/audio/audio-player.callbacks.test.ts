import { describe, expect, it, vi } from "vitest";
import { createAudioPlayer, playAudio, stopAudio } from "./audio-player";

class AudioMock {
    static instances: AudioMock[] = [];
    play = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn();
    preload = "";
    loop = false;
    volume = 1;
    currentTime = 0;
    onended: (() => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    constructor() {
        AudioMock.instances.push(this);
    }
}

describe("audio-player callbacks", () => {
    it("attaches onEnded callback", async () => {
        AudioMock.instances = [];
        vi.stubGlobal("Audio", AudioMock);
        const onEnded = vi.fn();
        const player = createAudioPlayer();
        await player.play("/x.mp3", { onEnded });
        const instance = AudioMock.instances[0]!;
        instance.onended?.();
        expect(onEnded).toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it("respects loop flag", async () => {
        AudioMock.instances = [];
        vi.stubGlobal("Audio", AudioMock);
        const player = createAudioPlayer();
        await player.play("/x.mp3", { loop: true });
        expect(AudioMock.instances[0]!.loop).toBe(true);
        vi.unstubAllGlobals();
    });

    it("stopPrevious pauses the prior clip", async () => {
        AudioMock.instances = [];
        vi.stubGlobal("Audio", AudioMock);
        const player = createAudioPlayer();
        await player.play("/a.mp3");
        await player.play("/b.mp3", { stopPrevious: true });
        expect(AudioMock.instances[0]!.pause).toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it("autoplay=false skips play() call", async () => {
        AudioMock.instances = [];
        vi.stubGlobal("Audio", AudioMock);
        const player = createAudioPlayer();
        await player.play("/x.mp3", { autoplay: false });
        expect(AudioMock.instances[0]!.play).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it("playAudio (default player) + stopAudio works", async () => {
        AudioMock.instances = [];
        vi.stubGlobal("Audio", AudioMock);
        await playAudio("/x.mp3");
        stopAudio();
        const instance = AudioMock.instances.at(-1)!;
        expect(instance.pause).toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it("hands an element error to the caller", async () => {
        AudioMock.instances = [];
        vi.stubGlobal("Audio", AudioMock);
        const onError = vi.fn();
        const player = createAudioPlayer();
        await player.play("/x.mp3", { onError });

        AudioMock.instances[0]!.onerror?.(new Event("error"));

        expect(onError).toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it("routes the clip to a chosen output device before playing", async () => {
        AudioMock.instances = [];
        const setSinkId = vi.fn().mockResolvedValue(undefined);
        class RoutableAudio extends AudioMock {
            setSinkId = setSinkId;
        }
        vi.stubGlobal("Audio", RoutableAudio);

        const player = createAudioPlayer();
        await player.play("/x.mp3", { sinkId: "fone-usb" });

        expect(setSinkId).toHaveBeenCalledWith("fone-usb");
        vi.unstubAllGlobals();
    });
});
