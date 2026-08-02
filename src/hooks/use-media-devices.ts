import { useCallback, useEffect, useState } from "react";

/** One device the browser is willing to tell us about. */
export interface MediaDeviceOption {
    deviceId: string;
    /**
     * Human label, or `""` until permission has been granted.
     *
     * See {@link UseMediaDevicesResult.labelsAvailable} — an empty label is not a
     * bug, it is the browser refusing to fingerprint the machine.
     */
    label: string;
    kind: MediaDeviceKind;
    groupId: string;
}

/** Value returned by {@link useMediaDevices}. */
export interface UseMediaDevicesResult {
    /** Every device, in the order the browser listed them. */
    devices: MediaDeviceOption[];
    /** Microphones and other audio sources. */
    audioInputs: MediaDeviceOption[];
    /** Speakers and headsets. Empty on browsers with no output routing (Safari, Firefox). */
    audioOutputs: MediaDeviceOption[];
    /** Cameras. */
    videoInputs: MediaDeviceOption[];
    /**
     * Whether labels are filled in.
     *
     * `false` means the list is real but anonymous — render a picker only after a
     * capture permission has been granted, or the user sees "" repeated N times.
     */
    labelsAvailable: boolean;
    /** `enumerateDevices` is unavailable in this browser. */
    supported: boolean;
    /** Re-enumerate. The hook already does this on `devicechange`. */
    refresh: () => void;
}

const EMPTY: MediaDeviceOption[] = [];

/**
 * List capture and playback devices, and keep the list fresh.
 *
 * Two things about `enumerateDevices` that decide how a picker must be built:
 *
 * 1. **Labels are gated behind permission.** Before the user grants a capture
 *    permission, every `label` is `""` — the list length and ids are real, the names
 *    are not. A device picker rendered at that point is a column of blanks, so
 *    `labelsAvailable` is exposed to gate it. Ask for the microphone first, then
 *    show the picker.
 * 2. **The list changes while the page is open.** Plugging in a headset mid-recording
 *    is the normal case, not an edge case, so the hook subscribes to `devicechange`
 *    instead of enumerating once on mount.
 *
 * `audioOutputs` is empty on browsers with no output routing at all (Safari and
 * Firefox do not implement `setSinkId`); an empty array there means "you cannot
 * offer this choice", not "no speakers".
 *
 * @returns The device lists, whether labels are filled in, and a `refresh()`.
 *
 * @example
 * const { audioInputs, labelsAvailable } = useMediaDevices();
 * // ...after the mic permission is granted:
 * {labelsAvailable && <Select options={audioInputs.map((d) => ({ value: d.deviceId, label: d.label }))} />}
 */
export function useMediaDevices(): UseMediaDevicesResult {
    const [devices, setDevices] = useState<MediaDeviceOption[]>(EMPTY);
    const [supported, setSupported] = useState(false);
    const [token, setToken] = useState(0);

    const refresh = useCallback(() => setToken((value) => value + 1), []);

    useEffect(() => {
        let cancelled = false;

        if (
            typeof navigator === "undefined" ||
            !navigator.mediaDevices ||
            typeof navigator.mediaDevices.enumerateDevices !== "function"
        ) {
            setSupported(false);
            setDevices(EMPTY);
            return;
        }
        setSupported(true);
        const media = navigator.mediaDevices;

        async function read(): Promise<void> {
            try {
                const list = await media.enumerateDevices();
                if (cancelled) return;
                setDevices(
                    list.map((device) => ({
                        deviceId: device.deviceId,
                        label: device.label,
                        kind: device.kind,
                        groupId: device.groupId,
                    })),
                );
            } catch {
                if (!cancelled) setDevices(EMPTY);
            }
        }

        void read();
        const onChange = (): void => void read();
        media.addEventListener?.("devicechange", onChange);

        return () => {
            cancelled = true;
            media.removeEventListener?.("devicechange", onChange);
        };
    }, [token]);

    return {
        devices,
        audioInputs: devices.filter((device) => device.kind === "audioinput"),
        audioOutputs: devices.filter((device) => device.kind === "audiooutput"),
        videoInputs: devices.filter((device) => device.kind === "videoinput"),
        labelsAvailable: devices.length > 0 && devices.some((device) => device.label !== ""),
        supported,
        refresh,
    };
}
