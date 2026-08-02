import { useCallback, useEffect, useState } from "react";

/** Which capture permission to observe. */
export type MediaPermissionName = "microphone" | "camera";

/**
 * Permission state, including the two cases the browser prompt cannot tell you
 * apart on its own.
 *
 * - `"unknown"` — the Permissions API is unavailable (Safari does not report
 *   `microphone`), so the only way to learn the answer is to ask for the device.
 * - `"prompt"` — never asked. Asking now shows the browser prompt.
 * - `"granted"` / `"denied"` — settled. `"denied"` is **sticky**: calling
 *   `getUserMedia` again does not re-prompt, it rejects immediately.
 */
export type MediaPermissionState = "unknown" | "prompt" | "granted" | "denied";

/** Value returned by {@link useMediaPermission}. */
export interface UseMediaPermissionResult {
    /** Current state. Updates live when the user changes it in browser settings. */
    state: MediaPermissionState;
    /** Whether the Permissions API could answer at all. */
    supported: boolean;
    /** Re-read the permission. Rarely needed — the hook subscribes to changes. */
    refresh: () => void;
}

/**
 * Read a capture permission **without triggering the prompt**.
 *
 * This is the piece that makes a good permission flow possible. `getUserMedia` is
 * the only way to *get* a device, but calling it is also the only way to *ask*, and
 * a prompt fired on page load — before the user has pressed anything — is the
 * single most reliable way to earn a permanent "Block". Reading the state first
 * lets a page explain why it needs the microphone, and only then ask.
 *
 * It also separates "never asked" from "denied", which matters because they need
 * opposite UI: `"prompt"` gets a button, `"denied"` gets instructions for the
 * browser's site settings, since no amount of clicking will re-prompt.
 *
 * Safari does not expose `microphone` to the Permissions API and throws on the
 * query, which surfaces as `state: "unknown"` and `supported: false` — treat that
 * as "you will have to ask to find out", not as an error.
 *
 * @param name - Which permission to observe.
 * @returns The live state, whether it could be read, and a manual `refresh()`.
 *
 * @example
 * const { state } = useMediaPermission("microphone");
 * if (state === "denied") return <p>Libere o microfone nas configurações do site.</p>;
 * return <button onClick={start}>Gravar</button>;
 */
export function useMediaPermission(name: MediaPermissionName): UseMediaPermissionResult {
    const [state, setState] = useState<MediaPermissionState>("unknown");
    const [supported, setSupported] = useState(false);
    const [token, setToken] = useState(0);

    const refresh = useCallback(() => setToken((value) => value + 1), []);

    useEffect(() => {
        let cancelled = false;
        let status: PermissionStatus | null = null;
        const onChange = (): void => {
            if (!cancelled && status) setState(status.state as MediaPermissionState);
        };

        async function read(): Promise<void> {
            if (typeof navigator === "undefined" || !navigator.permissions?.query) {
                if (!cancelled) {
                    setSupported(false);
                    setState("unknown");
                }
                return;
            }
            try {
                status = await navigator.permissions.query({
                    name: name as PermissionName,
                });
                if (cancelled) return;
                setSupported(true);
                setState(status.state as MediaPermissionState);
                status.addEventListener("change", onChange);
            } catch {
                if (!cancelled) {
                    setSupported(false);
                    setState("unknown");
                }
            }
        }

        void read();

        return () => {
            cancelled = true;
            status?.removeEventListener("change", onChange);
        };
    }, [name, token]);

    return { state, supported, refresh };
}
