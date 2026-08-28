import { useEffect, useState } from "react";
import { createAudioBus, type AudioBus, type AudioBusOptions } from "./audio-bus";

/**
 * Keep one {@link AudioBus} alive for as long as the component is mounted.
 *
 * The bus is built on the first render and closed on unmount, which matters more
 * than it looks: browsers cap the number of live `AudioContext`s (Chrome allows
 * around six), so a bus leaked on unmount eventually breaks every later one on
 * the page.
 *
 * Options are read once. A bus is a device route and a mixing graph, not a
 * render output — rebuilding it because a prop changed would drop every attached
 * source mid-sentence. Change gain and output through the bus itself.
 *
 * @param options - See {@link AudioBusOptions}. Read on the first render only.
 * @returns The bus, stable for the component's lifetime.
 *
 * @example
 * const bus = useAudioBus({ maxGain: 3 });
 *
 * useEffect(() => {
 *   const handle = bus.attach(stream, { gain: 1 });
 *   return () => handle.stop();
 * }, [bus, stream]);
 */
export function useAudioBus(options: AudioBusOptions = {}): AudioBus {
    const [bus] = useState<AudioBus>(() => createAudioBus(options));

    useEffect(() => {
        return () => bus.close();
    }, [bus]);

    return bus;
}
