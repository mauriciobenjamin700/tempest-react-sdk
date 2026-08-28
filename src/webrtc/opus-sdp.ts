/**
 * @tempest-limits file-lines — parsing a session description, merging one
 * `fmtp` line and inserting a missing one are the same pass over the same
 * grammar; split apart, each half is a parser of half an SDP.
 */

/** What an Opus `fmtp` line can be asked to carry. Every field is optional. */
export interface OpusProfile {
    /**
     * Ceiling the encoder is asked to respect, in bits per second.
     *
     * This describes what we want **to receive**. To cap what we *send*, use
     * `setSenderBitrate` — in a mesh that is the one that matters, because the
     * uplink carries one copy per participant.
     */
    maxAverageBitrate?: number;
    /** Highest sample rate worth decoding, in Hz. `48000` for full band. */
    maxPlaybackRate?: number;
    /**
     * Two channels instead of one.
     *
     * Sets `stereo` **and** `sprop-stereo`, which point in opposite directions:
     * `stereo=1` asks the *remote* to send two channels, `sprop-stereo=1`
     * announces that *we* will. Setting only one leaves the link asymmetric,
     * which is the recurring reason "I asked for stereo and got mono".
     */
    stereo?: boolean;
    /**
     * In-band forward error correction (`useinbandfec`).
     *
     * Rebuilds a lost packet from the next one, which keeps speech intelligible
     * on a lossy link — and smears music, since it spends bitrate on redundancy
     * instead of detail.
     */
    fec?: boolean;
    /**
     * Discontinuous transmission (`usedtx`): stop sending during silence.
     *
     * Saves uplink in a mesh, at the cost of clipping the first instant after a
     * pause. Wrong for music and for a shared screen, where the quiet passages
     * are content.
     */
    dtx?: boolean;
    /** Constant bitrate (`cbr`). Off by default, as Opus intends. */
    cbr?: boolean;
    /**
     * Any other `fmtp` key, merged verbatim.
     *
     * The escape hatch for a parameter this type does not model. Values are
     * written as given; a key with an empty string is emitted as a bare flag.
     */
    extra?: Record<string, string>;
}

/**
 * Profiles to apply, keyed by audio m-line index (`0`, `1`, …) or by `mid`.
 *
 * Position and `mid` can be mixed in one object. A key that matches nothing is
 * ignored rather than an error — an SDP is negotiated, and a slot that was not
 * offered this time is normal.
 */
export type OpusProfileMap = Record<string | number, OpusProfile>;

/** Keys that identify a bare {@link OpusProfile} rather than a map of them. */
const PROFILE_KEYS: ReadonlySet<string> = new Set([
    "maxAverageBitrate",
    "maxPlaybackRate",
    "stereo",
    "fec",
    "dtx",
    "cbr",
    "extra",
]);

/**
 * Whether the caller passed one profile for every audio m-line, or a map.
 *
 * An empty object is read as a profile, which makes `tuneOpus(sdp, {})` a no-op
 * instead of a silent surprise.
 */
function isSingleProfile(value: OpusProfile | OpusProfileMap): value is OpusProfile {
    const keys = Object.keys(value);
    return keys.length === 0 || keys.some((key) => PROFILE_KEYS.has(key));
}

/** The `fmtp` parameters a profile asks for, in the order Opus documents them. */
function fmtpParams(profile: OpusProfile): Record<string, string> {
    const params: Record<string, string> = {};
    if (profile.maxAverageBitrate !== undefined) {
        params.maxaveragebitrate = String(profile.maxAverageBitrate);
    }
    if (profile.maxPlaybackRate !== undefined) {
        params.maxplaybackrate = String(profile.maxPlaybackRate);
    }
    if (profile.stereo !== undefined) {
        params.stereo = profile.stereo ? "1" : "0";
        params["sprop-stereo"] = profile.stereo ? "1" : "0";
    }
    if (profile.fec !== undefined) params.useinbandfec = profile.fec ? "1" : "0";
    if (profile.dtx !== undefined) params.usedtx = profile.dtx ? "1" : "0";
    if (profile.cbr !== undefined) params.cbr = profile.cbr ? "1" : "0";
    return { ...params, ...profile.extra };
}

/**
 * Merge parameters into an existing `fmtp` payload, key by key.
 *
 * Replacing the whole line is the obvious move and it is wrong: the browser
 * emits `minptime=10;useinbandfec=1` on its own, and overwriting drops the
 * `minptime` — a packetization decision nobody meant to change.
 */
function mergeFmtp(existing: string, params: Record<string, string>): string {
    const merged = new Map<string, string>();
    for (const entry of existing.split(";")) {
        const trimmed = entry.trim();
        if (!trimmed) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 0) merged.set(trimmed, "");
        else merged.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
    }
    for (const [key, value] of Object.entries(params)) merged.set(key, value);
    return [...merged.entries()]
        .map(([key, value]) => (value === "" ? key : `${key}=${value}`))
        .join(";");
}

/** Payload types this media block maps to Opus. There can be more than one. */
function opusPayloads(block: readonly string[]): string[] {
    const payloads: string[] = [];
    for (const line of block) {
        const match = /^a=rtpmap:(\d+)\s+opus\/48000/i.exec(line);
        if (match) payloads.push(match[1]);
    }
    return payloads;
}

/** The block's `mid`, when it declares one. */
function blockMid(block: readonly string[]): string | null {
    for (const line of block) {
        const match = /^a=mid:(.+)$/.exec(line);
        if (match) return match[1].trim();
    }
    return null;
}

/**
 * Rewrite one media block's Opus `fmtp` lines to carry a profile.
 *
 * A payload type with no `fmtp` of its own gets one inserted right after its
 * `rtpmap`, because "the parameter is missing" and "the parameter is empty" are
 * the same request from the caller's side.
 */
function tuneBlock(block: readonly string[], profile: OpusProfile): string[] {
    const params = fmtpParams(profile);
    const payloads = opusPayloads(block);
    if (payloads.length === 0 || Object.keys(params).length === 0) return [...block];

    const out: string[] = [];
    for (const line of block) {
        const fmtp = /^a=fmtp:(\d+)\s+(.*)$/.exec(line);
        if (fmtp && payloads.includes(fmtp[1])) {
            out.push(`a=fmtp:${fmtp[1]} ${mergeFmtp(fmtp[2], params)}`);
            continue;
        }
        out.push(line);

        const rtpmap = /^a=rtpmap:(\d+)\s+opus\/48000/i.exec(line);
        if (rtpmap && !block.some((other) => other.startsWith(`a=fmtp:${rtpmap[1]} `))) {
            out.push(`a=fmtp:${rtpmap[1]} ${mergeFmtp("", params)}`);
        }
    }
    return out;
}

/** Split a session description into its session part plus one block per m-line. */
function mediaBlocks(sdp: string): string[][] {
    const blocks: string[][] = [];
    let current: string[] = [];
    for (const line of sdp.split(/\r\n|\n/)) {
        if (line.startsWith("m=") && current.length > 0) {
            blocks.push(current);
            current = [];
        }
        current.push(line);
    }
    if (current.length > 0) blocks.push(current);
    return blocks;
}

/**
 * Apply Opus profiles to the audio m-lines of a session description.
 *
 * Audio over WebRTC is mono and narrow by default, and the only place that is
 * corrected is the SDP — which is why shared-screen audio famously sounds like a
 * telephone: music and video inherit the speech profile (mono, ~32 kbps, FEC on,
 * DTX gating the quiet passages) and no high-level API lets you change it.
 *
 * Deliberately **without** built-in presets: which values to use is the
 * consumer's call — voice in a mesh does not want what system audio wants — and
 * a preset table is the kind of thing that has no business inside a dependency.
 * What lives here is the parsing, merging and insertion, which is where the long
 * tail is. Getting any of it wrong degrades silently: nobody sees an exception,
 * the audio is just worse.
 *
 * @param sdp - The description from `createOffer` or `createAnswer`.
 * @param profiles - One {@link OpusProfile} for every audio m-line, or an
 *   {@link OpusProfileMap} keyed by audio m-line index or by `mid`.
 * @returns The rewritten SDP, with CRLF line endings as RFC 4566 requires.
 *   Untouched when there is no Opus, when no profile matches, or when a profile
 *   asks for nothing.
 *
 * @example
 * const tuned = tuneOpus(offer.sdp, {
 *   0: { maxAverageBitrate: 48_000, stereo: false, fec: true, dtx: true },
 *   1: { maxAverageBitrate: 192_000, stereo: true, fec: false, dtx: false },
 * });
 *
 * @example
 * const tuned = tuneOpus(offer.sdp, { stereo: true, dtx: false });
 */
export function tuneOpus(sdp: string, profiles: OpusProfile | OpusProfileMap): string {
    const single = isSingleProfile(profiles) ? profiles : null;
    const map = single ? null : (profiles as OpusProfileMap);

    let audioIndex = 0;
    const tuned = mediaBlocks(sdp).map((block) => {
        if (!block[0]?.startsWith("m=audio")) return block;

        const index = audioIndex;
        audioIndex += 1;
        if (single) return tuneBlock(block, single);

        const mid = blockMid(block);
        const profile = map?.[index] ?? (mid !== null ? map?.[mid] : undefined);
        return profile ? tuneBlock(block, profile) : block;
    });

    return tuned.flat().join("\r\n");
}

/** Which description a peer connection actually accepted. */
export type TunedDescriptionResult = "tuned" | "original";

/**
 * Set a local description, falling back to the untouched one if it is refused.
 *
 * Chrome has been tightening what `setLocalDescription` accepts from edited SDP,
 * and there is no way to know in advance. Without a fallback the call dies
 * instead of merely losing the profile — which is the wrong trade by a wide
 * margin: worse audio beats no audio.
 *
 * @param connection - The peer connection.
 * @param description - The description from `createOffer` / `createAnswer`.
 * @param profiles - Passed straight to {@link tuneOpus}.
 * @returns `"tuned"` when the rewritten SDP was accepted, `"original"` when the
 *   fallback was used — worth reporting, because it means the profile silently
 *   did not apply.
 * @throws Whatever `setLocalDescription` throws for the original description: at
 *   that point the failure is not about the rewrite and the caller has to know.
 *
 * @example
 * const applied = await setTunedLocalDescription(pc, await pc.createOffer(), profiles);
 * if (applied === "original") logger.warn("opus profile refused by the browser");
 */
export async function setTunedLocalDescription(
    connection: RTCPeerConnection,
    description: RTCSessionDescriptionInit,
    profiles: OpusProfile | OpusProfileMap,
): Promise<TunedDescriptionResult> {
    if (description.sdp) {
        const sdp = tuneOpus(description.sdp, profiles);
        if (sdp !== description.sdp) {
            try {
                await connection.setLocalDescription({ ...description, sdp });
                return "tuned";
            } catch {
                /* the browser refused the edit; the untouched offer still works */
            }
        }
    }
    await connection.setLocalDescription(description);
    return "original";
}
