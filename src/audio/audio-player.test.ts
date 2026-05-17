import { describe, expect, it, vi } from "vitest";
import { createAudioPlayer } from "./audio-player";

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

describe("createAudioPlayer", () => {
    it("returns null when autoplay is blocked", async () => {
        class Blocked extends AudioMock {
            override play = vi.fn().mockRejectedValue(new Error("blocked"));
        }
        vi.stubGlobal("Audio", Blocked);
        const onError = vi.fn();
        const player = createAudioPlayer();
        const result = await player.play("/x.mp3", { onError });
        expect(result).toBeNull();
        expect(onError).toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it("stop() pauses and rewinds the current clip", async () => {
        AudioMock.instances = [];
        vi.stubGlobal("Audio", AudioMock);
        const player = createAudioPlayer();
        await player.play("/x.mp3");
        const instance = AudioMock.instances[0]!;
        instance.currentTime = 5;
        player.stop();
        expect(instance.pause).toHaveBeenCalled();
        expect(instance.currentTime).toBe(0);
        vi.unstubAllGlobals();
    });
});
