import { useCallback, useEffect, useState } from "react";

/**
 * `torch` is a real constrainable property in the Media Capture spec, but
 * TypeScript's `MediaTrackConstraintSet` does not list it, so the literal has to be
 * widened before `applyConstraints` will take it.
 */
type TorchConstraints = MediaTrackConstraints & {
    advanced?: Array<MediaTrackConstraintSet & { torch?: boolean }>;
};

/** `getCapabilities()` reports `torch` as a list of the values the lamp accepts. */
type TorchCapabilities = MediaTrackCapabilities & { torch?: readonly boolean[] };

/** Value returned by {@link useTorch}. */
export interface UseTorchResult {
    /** Whether this track has a controllable lamp. `false` on every desktop webcam. */
    supported: boolean;
    /** Whether the lamp is on, as far as this hook knows. */
    on: boolean;
    /**
     * Turn the lamp on or off.
     *
     * @param next - `true` to light it up.
     * @returns `false` when the track refused — treat that as "no torch".
     */
    set: (next: boolean) => Promise<boolean>;
    /** Flip it. Same return contract as {@link UseTorchResult.set}. */
    toggle: () => Promise<boolean>;
}

/**
 * Drive the camera's LED torch on the video track of a stream.
 *
 * The lamp is not a device you can open — it is a **constraint on a live video
 * track**, so there is nothing to control until a camera stream exists, and it
 * disappears when that stream is released. That is also why `supported` can only be
 * answered after the track is live: the same code is `true` on an Android rear camera
 * and `false` on the front one of the same phone.
 *
 * Capability detection prefers `getCapabilities()` and falls back to
 * `getSettings()`, because Firefox implements neither the torch nor
 * `getCapabilities()` and Safari reports the setting without the capability. When
 * neither mentions `torch`, the hook reports `supported: false` instead of offering a
 * button that silently does nothing.
 *
 * @param stream - A live camera stream, or `null` before permission lands.
 * @returns Whether a lamp exists, its state, and setters.
 *
 * @example
 * const camera = useBarcodeScanner();
 * {camera.torch.supported && (
 *     <button onClick={() => void camera.torch.toggle()}>Lanterna</button>
 * )}
 */
export function useTorch(stream: MediaStream | null): UseTorchResult {
    const [supported, setSupported] = useState(false);
    const [on, setOn] = useState(false);

    useEffect(() => {
        const track = stream?.getVideoTracks()[0] ?? null;
        if (!track) {
            setSupported(false);
            setOn(false);
            return;
        }
        const capabilities = (track.getCapabilities?.() ?? {}) as TorchCapabilities;
        const settings = track.getSettings();
        setSupported(capabilities.torch !== undefined || settings.torch !== undefined);
        setOn(settings.torch === true);
    }, [stream]);

    const set = useCallback(
        async (next: boolean): Promise<boolean> => {
            const track = stream?.getVideoTracks()[0] ?? null;
            if (!track) return false;
            try {
                await track.applyConstraints({
                    advanced: [{ torch: next }],
                } as TorchConstraints);
                setOn(next);
                return true;
            } catch {
                // A track without a lamp rejects with `OverconstrainedError`. There is
                // nothing for the user to fix, and the honest report is "no torch".
                setSupported(false);
                setOn(false);
                return false;
            }
        },
        [stream],
    );

    const toggle = useCallback((): Promise<boolean> => set(!on), [set, on]);

    return { supported, on, set, toggle };
}
