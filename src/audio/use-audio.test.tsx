import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAudio } from "./use-audio";

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

describe("useAudio", () => {
    it("toggles unlocked after a successful play", async () => {
        vi.stubGlobal("Audio", AudioMock);
        const { result } = renderHook(() => useAudio());
        expect(result.current.unlocked).toBe(false);
        await act(async () => {
            await result.current.play("/x.mp3");
        });
        expect(result.current.unlocked).toBe(true);
        vi.unstubAllGlobals();
    });
});
