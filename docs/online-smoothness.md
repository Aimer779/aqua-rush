# Remote boat smoothness

## Problem and fix

The original remote interpolation kept only the previous and latest snapshots.
Every arrival reset its interpolation fraction to zero. An early packet advanced
the displayed position abruptly; a late packet left the opponent stationary once
the fraction reached one. Boat roll, pitch and presentation values also came
straight from the latest snapshot instead of the interpolated time.

`SnapshotInterpolation` now maintains a bounded snapshot buffer and a continuous
playback clock. Packet arrival adds samples without resetting that clock. The
target buffer is 100 ms on a stable connection, growing up to 250 ms with measured
arrival jitter and shrinking gradually. Small playback-speed adjustments correct
clock drift without moving the timeline backwards.

Remote positions use velocity-aware Hermite interpolation, clamped to the segment
bounds to prevent overshoot around collision corrections. Quaternion, roll/pitch,
heading and numeric presentation values share the buffered timeline. Recovery
teleports take effect at their timestamp without sweeping across the course.

This follows the established buffered-playback approach described in
[Gaffer on Games](https://gafferongames.com/post/snapshot_interpolation/) and
[Mirror's snapshot interpolation documentation](https://mirror-networking.gitbook.io/docs/manual/components/network-transform/snapshot-interpolation).
Three.js supplies the existing quaternion operations; no new dependency or wire
protocol is needed.

The tradeoff is a small additional delay in **other players' presentation**. Local
input prediction and authoritative collision/finish rules are unchanged. The
client holds the last valid pose if the buffer runs out, rather than extrapolating
through unknown collisions. A gap longer than 500 ms resets stale history on the
next snapshot. A large backlog delivered together after an outage also resyncs to
fresh state instead of slowly replaying seconds of stale motion. This cannot
conceal an arbitrarily long network outage.

## Measured comparison

Baseline: merged upstream `cac011d` (same implementation as `764ce36`). Both runs
used the production build, local Cloudflare runtime, one actual browser and one
real WebSocket opponent following legal checkpoints. The browser received ordered
messages with 50–85 ms of injected delay. A moving frame is one where authoritative
remote planar speed exceeds five world units per second; a stalled moving frame
has no corresponding change in the displayed opponent's planar position.

1920×1080, Chromium, RTX 5060 Laptop GPU, eight-second samples:

| Metric | Before | After |
| --- | ---: | ---: |
| Moving frames sampled | 1,320 | 1,321 |
| Stalled moving frames | 242 (18.3%) | 0 (0%) |
| Average FPS | 165.00 | 164.99 |
| p95 frame time | 6.2 ms | 6.2 ms |

A four-player follow-up sampled all three opponents by stable visual identity:
3,674 moving-opponent observations, zero stalled observations, 164.99 average FPS
and 6.2 ms p95 frame time under the same injected-delay pattern.

The unchanged render rate distinguishes a remote-motion discontinuity from GPU
frame loss in this reproduction. These short, controlled samples are not a claim
that all devices or real networks will have zero hitches.

Deterministic constant-speed tests separately inject 0–35 ms jitter and ordered
three-packet bursts at 60/144 Hz. In the original 60 Hz jitter test, the five-second
measurement had 84 stationary frames and a maximum arrival-driven jump of 0.333
world units. Buffered playback has zero stationary frames and zero arrival-driven
jumps in all four controlled scenarios after the one-second warmup. Additional
tests cover starvation, suspension, old packets, recovery and rotation wrapping.

## Reproduction and diagnosis

```powershell
npx playwright test tests/online-interpolation.spec.ts tests/online-prediction.spec.ts
$env:ONLINE_SMOOTHNESS = '1'
$env:SMOOTHNESS_LABEL = 'current'
npx playwright test -c playwright.online.config.ts tests/online/smoothness.spec.ts --project=desktop-chrome
```

The real-browser measurement writes frame samples to
`artifacts/online-smoothness-current-1.json` and `-3.json` for one/three opponents.
It is opt-in because it runs a timed
rendering measurement, and is separate from the deterministic regression tests.

`window.__AQUA_ONLINE__.interpolation` exposes target buffer delay, current buffered
time, estimated arrival jitter, snapshot age and cumulative buffer-starved time.
Compare these with browser frame timings and the existing RTT/correction values:
growing snapshot age or starvation points to delivery gaps; slow frame timings
point to rendering/main-thread pressure. These diagnostics are not added to the
player-facing interface.
