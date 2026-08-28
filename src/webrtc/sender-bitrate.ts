/**
 * Cap what one sender transmits, in bits per second.
 *
 * This is the other half of the pair that confuses people: an Opus `fmtp` line
 * describes what we want **to receive**, while this is what limits what we
 * **send**. Both are needed, and in a mesh topology this one matters more,
 * because the uplink carries one copy of the stream per participant.
 *
 * The read-modify-write is not ceremony. `setParameters` only accepts the very
 * object `getParameters` handed back — a freshly built one is rejected — and a
 * sender that has not negotiated yet reports **no** encodings at all, so writing
 * to `encodings[0]` without checking throws on exactly the call that sets the
 * cap before the first offer.
 *
 * @param sender - The `RTCRtpSender` to cap, from `pc.getSenders()` or
 *   `transceiver.sender`.
 * @param maxBitrate - Ceiling in bits per second, or `null` to lift the cap.
 * @returns `false` when the browser refused the change, which happens when the
 *   sender has no track or the transceiver is gone. Playback continues
 *   uncapped — a call that keeps running beats one that throws over a bitrate.
 *
 * @example
 * const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
 * if (sender) await setSenderBitrate(sender, 48_000);
 */
export async function setSenderBitrate(
    sender: RTCRtpSender,
    maxBitrate: number | null,
): Promise<boolean> {
    try {
        const parameters = sender.getParameters();
        if (!parameters.encodings || parameters.encodings.length === 0) {
            parameters.encodings = [{}];
        }
        for (const encoding of parameters.encodings) {
            if (maxBitrate === null) delete encoding.maxBitrate;
            else encoding.maxBitrate = maxBitrate;
        }
        await sender.setParameters(parameters);
        return true;
    } catch {
        return false;
    }
}
