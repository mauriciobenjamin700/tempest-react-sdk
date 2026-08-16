import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSfxPool } from "./sfx-pool";

class AudioMock {
    static instances: AudioMock[] = [];
    play = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn();
    load = vi.fn();
    removeAttribute = vi.fn();
    preload = "";
    volume = 1;
    currentTime = 0;
    paused = true;
    src: string;

    constructor(src?: string) {
        this.src = src ?? "";
        AudioMock.instances.push(this);
    }
}

/** Elements created for `src`, in creation order. */
function instancesFor(src: string): AudioMock[] {
    return AudioMock.instances.filter((instance) => instance.src === src);
}

beforeEach(() => {
    AudioMock.instances = [];
    vi.stubGlobal("Audio", AudioMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("createSfxPool", () => {
    it("allocates one element per source and reuses it", () => {
        const pool = createSfxPool();

        pool.play("blip.mp3");
        pool.play("blip.mp3");
        pool.play("blip.mp3");

        expect(AudioMock.instances).toHaveLength(1);
        expect(AudioMock.instances[0].play).toHaveBeenCalledTimes(3);
    });

    it("rewinds before replaying, so a rapid repeat is audible", () => {
        const pool = createSfxPool();

        pool.play("blip.mp3");
        const element = AudioMock.instances[0];
        element.currentTime = 0.4;

        pool.play("blip.mp3");

        expect(element.pause).toHaveBeenCalled();
        expect(element.currentTime).toBe(0);
    });

    it("keeps separate elements per source", () => {
        const pool = createSfxPool();

        pool.play("a.mp3");
        pool.play("b.mp3");

        expect(AudioMock.instances).toHaveLength(2);
        expect(instancesFor("a.mp3")).toHaveLength(1);
        expect(instancesFor("b.mp3")).toHaveLength(1);
    });

    it("round-robins across voices so a sound can overlap itself", () => {
        const pool = createSfxPool({ voices: 3 });

        pool.play("hit.mp3");
        pool.play("hit.mp3");
        pool.play("hit.mp3");
        pool.play("hit.mp3");

        const elements = instancesFor("hit.mp3");
        expect(elements).toHaveLength(3);
        expect(elements[0].play).toHaveBeenCalledTimes(2);
        expect(elements[1].play).toHaveBeenCalledTimes(1);
        expect(elements[2].play).toHaveBeenCalledTimes(1);
    });

    it("multiplies the per-play volume by the master", () => {
        const pool = createSfxPool({ volume: 0.5 });

        pool.play("blip.mp3", { volume: 0.4 });

        expect(AudioMock.instances[0].volume).toBeCloseTo(0.2);
    });

    it("clamps volumes into range and survives NaN", () => {
        const pool = createSfxPool({ volume: 5 });
        pool.play("a.mp3", { volume: 3 });
        expect(instancesFor("a.mp3")[0].volume).toBe(1);

        const nan = createSfxPool({ volume: Number.NaN });
        nan.play("b.mp3");
        expect(instancesFor("b.mp3")[0].volume).toBe(1);

        const negative = createSfxPool();
        negative.play("c.mp3", { volume: -2 });
        expect(instancesFor("c.mp3")[0].volume).toBe(0);
    });

    it("rescales live playback by its own gain when the master changes", () => {
        const pool = createSfxPool({ volume: 1 });

        pool.play("quiet.mp3", { volume: 0.5 });
        pool.play("loud.mp3", { volume: 1 });
        for (const instance of AudioMock.instances) instance.paused = false;

        pool.setVolume(0.5);

        // 0.5 * 0.5 — not yanked up to the master.
        expect(instancesFor("quiet.mp3")[0].volume).toBeCloseTo(0.25);
        expect(instancesFor("loud.mp3")[0].volume).toBeCloseTo(0.5);
    });

    it("leaves paused elements alone on setVolume, applying it on the next play", () => {
        const pool = createSfxPool({ volume: 1 });

        pool.play("blip.mp3");
        const element = instancesFor("blip.mp3")[0];
        element.volume = 1;
        element.paused = true;

        pool.setVolume(0.25);
        expect(element.volume).toBe(1);

        pool.play("blip.mp3");
        expect(element.volume).toBeCloseTo(0.25);
    });

    it("resolves relative sources against baseUrl and leaves absolute ones alone", () => {
        const pool = createSfxPool({ baseUrl: "/my-app/" });

        pool.play("sfx/blip.mp3");
        pool.play("/sfx/back.mp3");
        pool.play("https://cdn.example.com/x.mp3");
        pool.play("data:audio/wav;base64,AAAA");

        const urls = AudioMock.instances.map((instance) => instance.src);
        expect(urls).toContain("/my-app/sfx/blip.mp3");
        expect(urls).toContain("/my-app/sfx/back.mp3");
        expect(urls).toContain("https://cdn.example.com/x.mp3");
        expect(urls).toContain("data:audio/wav;base64,AAAA");
    });

    it("treats the same clip reached by two spellings as one source", () => {
        const pool = createSfxPool({ baseUrl: "/my-app/" });

        pool.play("sfx/blip.mp3");
        pool.play("/sfx/blip.mp3");

        expect(AudioMock.instances).toHaveLength(1);
    });

    it("preload allocates and loads without playing", () => {
        const pool = createSfxPool();

        pool.preload(["a.mp3", "b.mp3"]);

        expect(AudioMock.instances).toHaveLength(2);
        for (const instance of AudioMock.instances) {
            expect(instance.load).toHaveBeenCalled();
            expect(instance.play).not.toHaveBeenCalled();
        }
    });

    it("preload accepts a single source", () => {
        const pool = createSfxPool();
        pool.preload("a.mp3");
        expect(AudioMock.instances).toHaveLength(1);
    });

    it("stop rewinds one source, or every source", () => {
        const pool = createSfxPool();
        pool.play("a.mp3");
        pool.play("b.mp3");
        for (const instance of AudioMock.instances) instance.currentTime = 1;

        pool.stop("a.mp3");
        expect(instancesFor("a.mp3")[0].currentTime).toBe(0);
        expect(instancesFor("b.mp3")[0].currentTime).toBe(1);

        pool.stop();
        expect(instancesFor("b.mp3")[0].currentTime).toBe(0);
    });

    it("stop ignores a source that was never played", () => {
        const pool = createSfxPool();
        expect(() => pool.stop("never.mp3")).not.toThrow();
    });

    it("evicts the least recently played source past maxSources", () => {
        const pool = createSfxPool({ maxSources: 2 });

        pool.play("a.mp3");
        pool.play("b.mp3");
        pool.play("a.mp3"); // a is now the most recent
        pool.play("c.mp3"); // pushes the pool over the cap

        // b was the least recently played, so it is the one released.
        expect(instancesFor("b.mp3")[0].removeAttribute).toHaveBeenCalledWith("src");
        expect(instancesFor("a.mp3")[0].removeAttribute).not.toHaveBeenCalled();

        // And it is gone from the pool: playing it allocates a fresh element.
        pool.play("b.mp3");
        expect(instancesFor("b.mp3")).toHaveLength(2);
    });

    it("dispose releases every element", () => {
        const pool = createSfxPool();
        pool.play("a.mp3");
        pool.play("b.mp3");

        pool.dispose();

        for (const instance of AudioMock.instances) {
            expect(instance.pause).toHaveBeenCalled();
            expect(instance.removeAttribute).toHaveBeenCalledWith("src");
        }

        // The pool is empty, not broken.
        pool.play("a.mp3");
        expect(instancesFor("a.mp3")).toHaveLength(2);
    });

    it("swallows a playback rejection from the autoplay policy", () => {
        class Blocked extends AudioMock {
            override play = vi.fn().mockRejectedValue(new Error("blocked"));
        }
        vi.stubGlobal("Audio", Blocked);

        const pool = createSfxPool();
        expect(() => pool.play("blip.mp3")).not.toThrow();
    });

    it("is inert without an Audio constructor", () => {
        vi.stubGlobal("Audio", undefined);
        const pool = createSfxPool();

        expect(() => {
            pool.play("blip.mp3");
            pool.preload("blip.mp3");
            pool.setVolume(0.5);
            pool.stop();
            pool.dispose();
        }).not.toThrow();
    });
});
