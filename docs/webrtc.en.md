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

## Measuring the link: `createLinkStatsSampler` and `useLinkStats`

The badge every call shows — `1.2 Mbps · 42 ms · 1080p60` — comes ready-made from nowhere. `getStats()` returns dozens of entries holding **cumulative** counters, and turning that into three numbers is where every app rewrites the same two mistakes.

### In React

```ts
import { useLinkStats } from "tempest-react-sdk";

function LinkBadge({ pc }: { pc: RTCPeerConnection | null }) {
  const stats = useLinkStats(pc);

  if (!stats) return <span>measuring…</span>;

  return (
    <span>
      {stats.kbps} kbps · {stats.rttMs ?? "—"} ms · {stats.width}×{stats.height}
      {stats.fps > 0 ? `@${stats.fps}` : ""}
    </span>
  );
}
```

Samples every 2 s, **only** while `connectionState === "connected"`, and stops sampling when the tab goes to the background.

### Outside React

```ts
import { createLinkStatsSampler } from "tempest-react-sdk";

const sampler = createLinkStatsSampler();

setInterval(async () => {
  const stats = await sampler.sample(pc);
  badge.textContent = `${stats.kbps} kbps`;
}, 2000);
```

!!! warning "One sampler per connection"
    The rate is a **delta**, so the sampler keeps the previous reading. Sharing one across peers subtracts one connection's counter from another's and reports nonsense. A five-person mesh has four samplers.

Already holding the report? `sampler.read(report)` runs the reduction without fetching again — useful when the same `getStats()` feeds more than one thing.

### The two mistakes this avoids

**1. Round trip read from the wrong pair.** A connection keeps several candidate pairs alive at once — host, server-reflexive, relayed — and only **one** carries traffic. Taking the first `candidate-pair` with `state: "succeeded"` makes the number jump between paths nobody is travelling: 8 ms from an idle host pair alternating with 180 ms from the TURN pair doing the work.

The right one is the pair the `transport` names in `selectedCandidatePairId`. `readRoundTripMs` does that, and it is exported on its own because it is useful outside the sampler:

```ts
import { readRoundTripMs } from "tempest-react-sdk";

const rttMs = readRoundTripMs(await pc.getStats());
```

**2. Throughput derived without a delta.** `bytesSent` is cumulative since the connection opened. Dividing it by the session length gives the historical average — a number that only falls and never shows what is happening now. The rate is `(bytes − previousBytes) × 8 ÷ 1000 ÷ seconds`, and keeping the "previous" is exactly the part every copy rewrites.

### What the sampler sums, and why

| Field | Comes from |
| --- | --- |
| `kbps` | the sum of **every** sender matching `kind` |
| `width` / `height` / `fps` | the stream with the **largest area**, not the last one reported |
| `rttMs` | the candidate pair the transport selected |

A peer publishing a camera and a screen at the same time occupies **one** uplink with both — and the uplink is what runs out. Hence the sum. Resolution comes from the largest because that is the stream dominating that bandwidth, and the one a viewer is looking at.

The default counts video only. `kind: "all"` folds audio in when the figure is meant to be the connection's real cost:

```ts
const sampler = createLinkStatsSampler({ kind: "all" });
```

### Pausing, resuming and `reset()`

```ts
const stats = useLinkStats(pc, {
  intervalMs: 2000,       // getStats walks the whole report; 2 s is not laziness
  pauseWhenHidden: true,  // default
  kind: "video",          // default
});
```

Coming back from the background calls `reset()` before the next sample. Without it, the first sample after five minutes hidden divides five minutes of bytes by five minutes and reports the average of a period nobody asked about. Call `sampler.reset()` by hand for the same reason after an **ICE restart** or a reconnect.

`reset()` clears the baseline, not the screen: the next reading comes back at `kbps: 0` and keeps the resolution and round trip already on show, so the badge does not blink.

!!! tip "The last reading survives the pause"
    `useLinkStats` keeps the previous value while paused instead of dropping back to `null`. A badge that blanks every time the tab loses focus reads as a dropped connection.

### What this does **not** measure

Written down on purpose: each item is a question the report answers and this module does not, so you know where to look instead of finding out the number was lying.

- **What you receive.** There is only `outbound-rtp` here. "Their video is stuttering" is `inbound-rtp` (`bytesReceived`, `framesDecoded`, `packetsLost`), and that reading has a different enough shape not to fit the same reduction — it answers about **their encoder**, not your uplink.
- **Why the rate dropped.** `qualityLimitationReason` (`"bandwidth"`, `"cpu"`, `"none"`) lives in the same `outbound-rtp` and tells "the network tightened" apart from "this machine cannot keep up" — which call for opposite actions. Read it straight off the report when you need it.
- **Loss and jitter.** `packetsLost` and `jitter` are there, but they are read against what was sent in the same interval; a raw lost-packet counter is a number without a denominator.
- **The cadence while the tab is hidden.** With `pauseWhenHidden: false` the timer keeps going, but browsers throttle background timers (Chrome drops to ≥ 1 min). No API works around that — sampling simply spaces out, and the delta stays correct because it is derived from measured time, not from the interval you asked for.
- **Real browser behaviour.** This module's tests run in jsdom, which ships no WebRTC at all: they prove the **reduction** against synthetic reports, not the connection. The report's shape was checked separately, in Chromium, with two loopback `RTCPeerConnection`s carrying a 640×360@30 canvas — the same report carries `kind` **and** `mediaType`, `frameWidth`/`frameHeight`/`framesPerSecond` come filled in, `transport.selectedCandidatePairId` is there, and the first sample lands at `0` kbps before settling around 350 kbps. Still, confirm on your own topology before trusting a production dashboard: TURN relaying, simulcast and mobile all change what shows up.

!!! note "`rttMs: 0` is not `rttMs: null`"
    Zero is a reading — it is what the local loopback measured. `null` means **no** pair has reported a timing yet, which is the normal state while the connection settles. A UI treating the two alike shows "0 ms" for a call that has not connected.

### When the browser does not cooperate

The module already covers what varies between engines, and it is worth knowing that it varies:

| Situation | What happens |
| --- | --- |
| Browser leaves `selectedCandidatePairId` empty | falls back to the first `succeeded` pair with a timing |
| Browser reports `mediaType` instead of `kind` (older Chrome) | both are read |
| `framesPerSecond` missing | `fps: 0`, and the last good reading is kept |
| Counter restarts (ICE restart) | a negative delta becomes `0` and the baseline is rebuilt |
| Simulcast (several layers on one track) | the layers sum; resolution comes from the largest |

## Recap

- `tuneOpus(sdp, profiles)` rewrites the **audio** m-lines: per-key merge, every Opus payload, inserts a missing `fmtp`, ignores video.
- `stereo` writes `stereo` **and** `sprop-stereo` — setting only one is the classic reason for "it came back mono".
- Profiles keyed by audio m-line index or by `mid`; a bare profile applies to all of them.
- No built-in presets: the values are the consumer's decision.
- `setTunedLocalDescription` tries the edited SDP and falls back to the original — losing the profile is far cheaper than losing the call.
- `setSenderBitrate` caps the **send** side, which is what saturates the uplink in a mesh.
- `useLinkStats(pc)` gives `kbps`, resolution, fps and round trip, pausing while the tab is hidden; `createLinkStatsSampler()` does the same outside React, **one per connection**.
- `readRoundTripMs(report)` reads the **selected** candidate pair, not the first `succeeded` one — that is the difference between 42 ms and a number that jumps.
- The rate is a delta: call `reset()` after an ICE restart, a reconnect or a long pause.

## See also

- [Audio](./audio.md) — `createAudioBus` for gain above 100% and output routing
- [WebSocket](./websocket.md) — the signaling channel
