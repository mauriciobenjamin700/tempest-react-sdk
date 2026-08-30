import { setSenderBitrate } from "./sender-bitrate";
import type { MeshQuality, MeshSlot } from "./mesh-types";

/** Uplink assumed available when the caller names no budget, in kbps. */
const DEFAULT_UPLINK_BUDGET_KBPS = 6000;

/** Floor a video slot keeps after the division, in kbps. */
const DEFAULT_MIN_VIDEO_KBPS = 300;

/** Budget below which `maintain-framerate` stops being worth holding, in kbps. */
const DEFAULT_FLUID_FLOOR_KBPS = 900;

/**
 * Divide the video caps by the size of the room.
 *
 * A mesh sends one copy of everything per participant, so the uplink is the
 * shared resource and the caps are what compete for it. Nothing is divided while
 * the caller is alone with one peer — that is the case the largest sizes exist
 * for, and dividing a budget that is not being shared would make them
 * unreachable in the only call where they fit.
 *
 * The floor is what keeps the division honest: without it a busy room allocates
 * tens of kbps per stream, and everybody loses the picture instead of the excess
 * giving way.
 *
 * @param quality - The caps as asked for.
 * @param peers - How many links are live.
 * @returns The caps to actually apply. The input is never mutated, so a room
 *     that empties out climbs back to what was asked for.
 */
export function scaleForRoom(quality: MeshQuality, peers: number): MeshQuality {
    const video = quality.video ?? {};
    if (peers <= 1) return quality;

    const asked = Object.values(video).reduce<number>((sum, cap) => sum + (cap ?? 0), 0);
    if (asked === 0) return quality;

    const perPeer = (quality.uplinkBudgetKbps ?? DEFAULT_UPLINK_BUDGET_KBPS) / peers;
    if (asked <= perPeer) return quality;

    const floor = quality.minVideoKbps ?? DEFAULT_MIN_VIDEO_KBPS;
    const factor = perPeer / asked;
    const scaled: Record<string, number | null> = {};
    for (const [slot, cap] of Object.entries(video)) {
        scaled[slot] = cap === null ? null : Math.max(floor, Math.round(cap * factor));
    }
    return { ...quality, video: scaled };
}

/**
 * Decide what the encoder gives up, letting physics override the preference.
 *
 * `maintain-framerate` is honoured while there are bits enough for the frames to
 * be worth keeping. Once the room's division has taken the budget below the
 * fluid floor, holding the rate halves what each frame receives and the picture
 * is worse than the lower rate it replaced — so below that line the preference
 * is overridden rather than obeyed.
 *
 * @param quality - What was asked for.
 * @param effective - What the room's share actually allows.
 * @returns The degradation preference to write onto the senders, or `undefined`
 *     when the caller expressed no preference.
 */
export function resolveDegradation(
    quality: MeshQuality,
    effective: MeshQuality,
): RTCDegradationPreference | undefined {
    const asked = quality.degradationPreference;
    if (asked !== "maintain-framerate") return asked;

    const caps = Object.values(effective.video ?? {}).filter((cap): cap is number => cap !== null);
    if (caps.length === 0) return asked;

    const budget = Math.max(...caps);
    return budget >= (quality.fluidFloorKbps ?? DEFAULT_FLUID_FLOOR_KBPS)
        ? "maintain-framerate"
        : "maintain-resolution";
}

/**
 * Read a video sender's parameters back with the motion settings written on.
 *
 * Read fresh on every call because `setParameters` only accepts the object the
 * **same** sender's `getParameters` returned, so a rejected attempt cannot be
 * retried with the object that was rejected.
 *
 * @param sender - The video sender to read from.
 * @param degradation - What to give up first, or `undefined` to leave it alone.
 * @param fps - Frame ceiling, or `undefined` to leave it alone.
 * @returns Parameters ready to be written back to `sender`.
 */
function videoParameters(
    sender: RTCRtpSender,
    degradation: RTCDegradationPreference | undefined,
    fps: number | undefined,
): RTCRtpSendParameters {
    const params = sender.getParameters();
    if (degradation !== undefined) params.degradationPreference = degradation;
    if (fps !== undefined) {
        for (const encoding of params.encodings ?? []) encoding.maxFramerate = fps;
    }
    return params;
}

/**
 * Write the quality settings onto one link's senders.
 *
 * `degradationPreference` goes only on video: it describes trading resolution
 * against frame rate, which an audio sender has no analogue for, and some
 * browsers reject it outright there.
 *
 * The retry without `degradationPreference` is for Firefox, which rejects the
 * member entirely — sending both together would lose the frame-rate cap to an
 * objection about something else.
 *
 * @param transceivers - The link's transceivers, in slot order.
 * @param slots - The slot list those transceivers were allocated from.
 * @param effective - Caps after the room's division.
 * @param degradation - Already resolved against the fluid floor.
 */
export async function applyQualityToLink(
    transceivers: readonly RTCRtpTransceiver[],
    slots: readonly MeshSlot[],
    effective: MeshQuality,
    degradation: RTCDegradationPreference | undefined,
): Promise<void> {
    for (const [index, slot] of slots.entries()) {
        const sender = transceivers[index]?.sender;
        if (!sender) continue;

        if (slot.kind === "audio") {
            const bps = effective.audio?.[slot.name];
            if (bps !== undefined) await setSenderBitrate(sender, bps);
            continue;
        }

        const kbps = effective.video?.[slot.name];
        if (kbps !== undefined) await setSenderBitrate(sender, kbps === null ? null : kbps * 1000);

        if (degradation === undefined && effective.maxFramerate === undefined) continue;
        try {
            await sender.setParameters(
                videoParameters(sender, degradation, effective.maxFramerate),
            );
        } catch {
            try {
                await sender.setParameters(
                    videoParameters(sender, undefined, effective.maxFramerate),
                );
            } catch {
                /* the sender refused both; the bitrate cap above still applies */
            }
        }
    }
}
