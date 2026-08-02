import { afterEach, describe, expect, it, vi } from "vitest";

import { isAudioOutputSelectionSupported, setAudioOutput } from "./audio-output";

/** Add or remove `setSinkId` on the prototype, as engine support does. */
function withSinkSupport(impl: ((sinkId: string) => Promise<void>) | null): () => void {
    const proto = HTMLMediaElement.prototype as unknown as Record<string, unknown>;
    const had = "setSinkId" in proto;
    const previous = proto.setSinkId;
    if (impl) proto.setSinkId = impl;
    else delete proto.setSinkId;
    return () => {
        if (had) proto.setSinkId = previous;
        else delete proto.setSinkId;
    };
}

describe("isAudioOutputSelectionSupported", () => {
    const restores: Array<() => void> = [];
    afterEach(() => {
        while (restores.length) restores.pop()?.();
    });

    it("is false on an engine with no setSinkId (Safari, Firefox)", () => {
        restores.push(withSinkSupport(null));
        expect(isAudioOutputSelectionSupported()).toBe(false);
    });

    it("is true once the prototype has it", () => {
        restores.push(withSinkSupport(async () => undefined));
        expect(isAudioOutputSelectionSupported()).toBe(true);
    });
});

describe("setAudioOutput", () => {
    const restores: Array<() => void> = [];
    afterEach(() => {
        while (restores.length) restores.pop()?.();
    });

    it("applies the route and reports success", async () => {
        const setSinkId = vi.fn(async () => undefined);
        restores.push(withSinkSupport(setSinkId));

        const element = document.createElement("audio");
        await expect(setAudioOutput(element, "speaker-2")).resolves.toBe(true);
        expect(setSinkId).toHaveBeenCalledWith("speaker-2");
    });

    it("reports false rather than throwing where the engine cannot route", async () => {
        // "This browser cannot choose an output" is the common case, and the sound
        // still plays on the default device — not an error the caller can act on.
        restores.push(withSinkSupport(null));
        await expect(setAudioOutput(document.createElement("audio"), "x")).resolves.toBe(false);
    });

    it("reports false when the device disappeared between enumeration and playback", async () => {
        restores.push(
            withSinkSupport(async () => {
                throw new DOMException("gone", "NotFoundError");
            }),
        );
        await expect(setAudioOutput(document.createElement("audio"), "unplugged")).resolves.toBe(
            false,
        );
    });

    it("reports false for a null element", async () => {
        restores.push(withSinkSupport(async () => undefined));
        await expect(setAudioOutput(null, "x")).resolves.toBe(false);
    });
});
