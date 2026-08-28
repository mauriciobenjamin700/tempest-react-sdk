import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeAudioContext, installAudioContext, installVideoElement } from "../../test/audio-mocks";
import { useAudioBus } from "./use-audio-bus";

describe("useAudioBus", () => {
    let restore: () => void;
    let restoreMedia: () => void;
    beforeEach(() => {
        restore = installAudioContext();
        restoreMedia = installVideoElement();
    });
    afterEach(() => {
        restoreMedia();
        restore();
    });

    it("builds one bus and keeps it across renders", () => {
        const { result, rerender } = renderHook(() => useAudioBus({ maxGain: 2 }));
        const first = result.current;

        rerender();

        expect(result.current).toBe(first);
        expect(FakeAudioContext.instances).toHaveLength(1);
    });

    it("closes the context on unmount, since browsers cap how many may live", () => {
        const { unmount } = renderHook(() => useAudioBus());

        unmount();

        expect(FakeAudioContext.instances[0].closed).toBe(true);
    });

    it("does not rebuild the bus when options change mid-session", () => {
        const { result, rerender } = renderHook(({ maxGain }) => useAudioBus({ maxGain }), {
            initialProps: { maxGain: 2 },
        });
        const first = result.current;

        rerender({ maxGain: 5 });

        expect(result.current).toBe(first);
        expect(FakeAudioContext.instances).toHaveLength(1);
    });
});
