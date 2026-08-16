import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSfxPool } from "./use-sfx-pool";

class AudioMock {
    static instances: AudioMock[] = [];
    play = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn();
    load = vi.fn();
    removeAttribute = vi.fn();
    preload = "";
    volume = 1;
    currentTime = 0;
    paused = false;
    src: string;

    constructor(src?: string) {
        this.src = src ?? "";
        AudioMock.instances.push(this);
    }
}

beforeEach(() => {
    AudioMock.instances = [];
    vi.stubGlobal("Audio", AudioMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("useSfxPool", () => {
    it("returns a stable handle across renders", () => {
        const { result, rerender } = renderHook(() => useSfxPool());
        const first = result.current;

        rerender();

        expect(result.current).toBe(first);
    });

    it("applies a volume change without rebuilding the pool", () => {
        const { result, rerender } = renderHook(({ volume }) => useSfxPool({ volume }), {
            initialProps: { volume: 1 },
        });

        result.current.play("blip.mp3");
        const element = AudioMock.instances[0];
        expect(AudioMock.instances).toHaveLength(1);

        rerender({ volume: 0.5 });

        // Same element — the downloaded clip was not thrown away.
        expect(AudioMock.instances).toHaveLength(1);
        expect(element.volume).toBeCloseTo(0.5);
    });

    it("applies the initial volume to the first play", () => {
        const { result } = renderHook(() => useSfxPool({ volume: 0.25 }));

        result.current.play("blip.mp3");

        expect(AudioMock.instances[0].volume).toBeCloseTo(0.25);
    });

    it("passes creation options through", () => {
        const { result } = renderHook(() => useSfxPool({ baseUrl: "/app/", voices: 2 }));

        result.current.play("blip.mp3");
        result.current.play("blip.mp3");

        expect(AudioMock.instances).toHaveLength(2);
        expect(AudioMock.instances[0].src).toBe("/app/blip.mp3");
    });

    it("disposes the pool on unmount", () => {
        const { result, unmount } = renderHook(() => useSfxPool());
        result.current.play("blip.mp3");
        const element = AudioMock.instances[0];

        unmount();

        expect(element.pause).toHaveBeenCalled();
        expect(element.removeAttribute).toHaveBeenCalledWith("src");
    });

    it("builds a fresh pool after a remount", () => {
        const first = renderHook(() => useSfxPool());
        const firstPool = first.result.current;
        first.unmount();

        const second = renderHook(() => useSfxPool());

        expect(second.result.current).not.toBe(firstPool);
    });
});
