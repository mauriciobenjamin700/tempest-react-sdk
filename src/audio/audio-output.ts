/** A media element that may support output routing. */
type SinkCapableElement = HTMLMediaElement & {
    setSinkId?: (sinkId: string) => Promise<void>;
    sinkId?: string;
};

/**
 * Whether this browser can route audio to a chosen output device.
 *
 * Chromium-only at the time of writing: Firefox has `setSinkId` behind a preference
 * that is off by default, and Safari does not implement it at all. Check this before
 * rendering an output picker, or the control is a lie on two of three engines.
 */
export function isAudioOutputSelectionSupported(): boolean {
    return (
        typeof HTMLMediaElement !== "undefined" &&
        typeof (HTMLMediaElement.prototype as SinkCapableElement).setSinkId === "function"
    );
}

/**
 * Send an element's audio to a specific output device.
 *
 * The `sinkId` comes from `useMediaDevices().audioOutputs` — and, like every device
 * label, that list is anonymous until a capture permission has been granted, so an
 * output picker realistically only works after the microphone has been allowed once.
 *
 * Returns `false` instead of throwing when the browser has no `setSinkId`, because
 * "this engine cannot route audio" is the common case and not an error the caller can
 * act on: the sound still plays, on the system default device. A rejected
 * `setSinkId` — a device that was unplugged between enumeration and playback is the
 * usual cause — also resolves `false`, and playback continues on the default.
 *
 * @param element - The `<audio>` or `<video>` element to route.
 * @param sinkId - Device id, or `""` for the system default.
 * @returns `true` when the route was applied.
 *
 * @example
 * const ok = await setAudioOutput(audioRef.current, selectedSpeakerId);
 * if (!ok) toast("Este navegador não permite escolher a saída de som.");
 */
export async function setAudioOutput(
    element: HTMLMediaElement | null,
    sinkId: string,
): Promise<boolean> {
    const target = element as SinkCapableElement | null;
    if (!target || typeof target.setSinkId !== "function") return false;
    try {
        await target.setSinkId(sinkId);
        return true;
    } catch {
        return false;
    }
}
