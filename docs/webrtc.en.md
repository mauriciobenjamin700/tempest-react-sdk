# WebRTC

Audio over WebRTC is **mono and narrow by default**, and the only place that gets corrected is the SDP. This module brings the machinery for editing it — parsing, merging and fallback — plus the send-side cap, which is the other half of a pair people routinely mix up.

!!! info "When do you need this?"
    If the call is voice only and the browser default is fine, you do not. Where it becomes necessary is **shared-screen** audio: music and video inherit the speech profile — mono, ~32 kbps, FEC on, DTX gating the quiet passages — which is exactly why system audio in a call sounds like a telephone. No high-level API lets you change it.

## The problem, in one line

`RTCPeerConnection` exposes no codec knob. The Opus profile lives in an `a=fmtp:` line of the SDP, and changing it means editing text — with a long tail of protocol traps (RFC 7587), not taste ones.

## `tuneOpus` — a profile per audio m-line

```ts
import { tuneOpus } from "tempest-react-sdk";

const offer = await pc.createOffer();

const tuned = tuneOpus(offer.sdp!, {
  // by audio m-line index (0 is the first), or by mid
  0: { maxAverageBitrate: 48_000, stereo: false, fec: true, dtx: true },
  1: { maxAverageBitrate: 192_000, stereo: true, fec: false, dtx: false },
});

await pc.setLocalDescription({ ...offer, sdp: tuned });
```

One profile for every audio m-line is the short form:

```ts
const tuned = tuneOpus(offer.sdp!, { stereo: true, dtx: false });
```

| Field | Becomes | What for |
| --- | --- | --- |
| `maxAverageBitrate` | `maxaveragebitrate` | ceiling we ask the **remote** encoder for |
| `maxPlaybackRate` | `maxplaybackrate` | highest rate worth decoding |
| `stereo` | `stereo` **and** `sprop-stereo` | two channels in both directions |
| `fec` | `useinbandfec` | rebuilds a lost packet — saves speech, smears music |
| `dtx` | `usedtx` | stops sending during silence — wrong for music |
| `cbr` | `cbr` | constant bitrate |
| `extra` | whatever you write | escape hatch for an unmodelled key |

!!! danger "No preset table, on purpose"
    Which values to use is your call: voice in a mesh does not want what system audio wants. A preset table is precisely the kind of thing that has no business inside a dependency — what lives here is the parsing, the merging and the fallback, which is where the long tail is.

### The traps this handles

Getting any of them wrong degrades **silently**: nobody sees an exception, the audio is just worse.

!!! warning "`stereo` and `sprop-stereo` point in opposite directions"
    `stereo=1` asks the **remote** to send two channels; `sprop-stereo=1` announces that **we** will. Setting only one leaves the link asymmetric — the recurring reason for "I asked for stereo and got mono". The `stereo` field writes both.

!!! warning "The `fmtp` already exists and must not be overwritten"
    The browser emits `a=fmtp:111 minptime=10;useinbandfec=1`. Replacing the whole line drops the `minptime` — a packetization decision nobody meant to change. The merge is per key: whatever you do not name stays.

!!! warning "The payload type varies, and there may be more than one"
    The number comes from `a=rtpmap:(\d+) opus/48000`, never from a hard-coded `111`. Every Opus payload in the block is tuned.

!!! warning "There may be no `fmtp` at all"
    Then the line is **inserted** right after the `rtpmap`. "The parameter is missing" and "the parameter is empty" are the same request from the caller's side.

!!! warning "Audio m-lines only"
    With several slots (mic plus system audio on separate transceivers) each wants a different profile — and the index counts audio blocks only, so a video m-line in between shifts nothing.

## `setTunedLocalDescription` — the fallback that saves the call

```ts
import { setTunedLocalDescription } from "tempest-react-sdk";

const applied = await setTunedLocalDescription(pc, await pc.createOffer(), profiles);
if (applied === "original") logger.warn("the browser refused the Opus profile");
```

Chrome has been tightening what `setLocalDescription` accepts from edited SDP, and there is no way to know in advance. Without a fallback to the original SDP, **the call dies instead of merely losing the profile** — the wrong trade by a wide margin: worse audio beats no audio.

The return value says which one landed, because `"original"` means the profile silently did not apply — worth reporting.

## `setSenderBitrate` — the other half of the pair

```ts
import { setSenderBitrate } from "tempest-react-sdk";

const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
if (sender) await setSenderBitrate(sender, 48_000);
```

!!! tip "`fmtp` is what we want **to receive**; `setParameters` limits what we **send**"
    Both are needed, and in a **mesh** topology the second one matters more: the uplink carries one copy of the stream per participant, so that is what saturates first.

Two things make this a function instead of two lines in your code: `setParameters` only accepts **the very object** `getParameters` returned (a freshly built one is refused), and a sender that has not negotiated yet reports **no** encodings — writing to `encodings[0]` without checking throws on exactly the call that sets the cap before the first offer. `null` lifts the cap; the return is `false` when the browser refuses, and the call then runs uncapped rather than breaking.

## Recap

- `tuneOpus(sdp, profiles)` rewrites the **audio** m-lines: per-key merge, every Opus payload, inserts a missing `fmtp`, ignores video.
- `stereo` writes `stereo` **and** `sprop-stereo` — setting only one is the classic reason for "it came back mono".
- Profiles keyed by audio m-line index or by `mid`; a bare profile applies to all of them.
- No built-in presets: the values are the consumer's decision.
- `setTunedLocalDescription` tries the edited SDP and falls back to the original — losing the profile is far cheaper than losing the call.
- `setSenderBitrate` caps the **send** side, which is what saturates the uplink in a mesh.

## See also

- [Audio](./audio.md) — `createAudioBus` for gain above 100% and output routing
- [WebSocket](./websocket.md) — the signaling channel
