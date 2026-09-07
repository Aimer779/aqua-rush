# Multiplayer validation

Validated on Windows with Node 24.20.0, the committed npm lockfile, Wrangler
4.129.0 and Playwright Chromium 148.0.7778.96. The upstream comparison uses
unmodified commit `94b3e11d32d234eeba4fd4c0316af0d2993732f9`.

## Passed checks

| Check | Result |
| --- | --- |
| `npm run build` | Frontend TypeScript and Vite production build passed |
| `npm run cf:check` | Generated runtime bindings and Worker TypeScript passed |
| `wrangler deploy --dry-run` | Bindings, SQLite migration and assets packaged; Worker gzip 132.39 KiB |
| Room and prediction contracts | 13 tests passed, including controlled 50/100/200 ms RTT and jitter |
| Local Cloudflare integration | 7 passed across desktop/mobile; one viewport-duplicate protocol case intentionally skipped |
| Four real WebSocket racers | Both courses naturally completed three laps, all clients agreed on standings/times, then returned to lobby |
| Existing race flow and wave handling | 6 tests passed |
| Updated mode-menu screenshot | Passed after updating only the new Online Race menu baseline |
| 1920×1080 production performance | Passed on RTX 5060 Laptop GPU: 165.19 average FPS, p95 6.2 ms, no frames over 25 ms |
| Public Cloudflare deployment | HTTPS page/health and all four room/browser checks passed, including WSS reconnect and same-origin rejection |

Public verification URL: <https://aqua-rush-online.chim33472.workers.dev>.
Application commit: `bd41276`. Cloudflare deployment version:
`4eea8580-eaa1-446f-b9b2-fe27b459e79b`.
The origin test sends a complete WebSocket handshake so it exercises the Worker
guard rather than the edge's malformed-request rejection.

The real-time four-client tests took approximately 1.2 minutes for Sunset Circuit
and 1.9 minutes for Storm Reef. They use ordinary input messages, not teleports,
server debug hooks, or forced finish messages. This verifies race correctness,
not public service capacity or latency from every geographic region.

## Existing screenshot failures

The complete regression run initially reported 65 passed, 40 skipped and 9 failed.
One failure was the intentionally changed mode-selection screen; its reviewed
baseline was updated and its test passed separately. The other eight failures
also occur on the unmodified upstream commit in the same environment:

- Four desktop course/mode driving screenshots.
- Desktop and mobile `active-play` screenshots.
- Mobile portrait Storm Reef driving screenshot.
- Mobile landscape Sunset Time Trial driving screenshot.

All eight had the same baseline-difference pixel counts on upstream and this
branch. Seven of the received PNGs were byte-identical across the two checkouts.
The existing unrelated baselines were preserved. The upstream-only visual run
reported 8 failed, 8 intentionally skipped and 6 passed.

The original suite skips desktop-only contracts in its mobile project and skips
the performance gate unless its production-preview environment is enabled; that
performance gate was run separately and passed. Full four-client races are opt-in
and were run explicitly on both courses.

## Reproduce

See [online multiplayer](online-multiplayer.md#verify) for the local room runtime,
full-race and browser commands. See the README for the production-preview
performance environment. Generated screenshots, traces and local comparison data
are written under ignored `artifacts/` or Playwright output directories.

## Opponent departure notice regression

The original client updated a disconnected opponent's roster state without a
prominent departure message. A new two-browser regression failed on that client
and now passes with persistent named notices, a short HUD announcement, host
transfer feedback and explicit solo-continuation guidance.

The targeted local suite passed 13 tests across desktop/mobile with one existing
viewport-duplicate case skipped. It covers intentional race exit, closing a tab,
the 15-second reconnect deadline, lobby exit and refresh reconnection. Final
desktop/mobile notice layout checks also passed. Frontend build and the separate
Worker TypeScript check passed; full-race physics/performance and unrelated
screenshot baselines were not rerun for this presentation-only change.

The same four departure/reconnection browser cases passed against the public
Cloudflare deployment, including assertions that the notices are visible.
Deployed application commit: `04c4bf2`; Worker version:
`d8a7d9ce-ee1d-4743-805e-10bf3e390eb7`.

## Start-menu entry regression

The HTML now shows the title menu before the JavaScript bundle loads, with the
start button disabled until initialization finishes and the race/touch HUD hidden.
Opening or refreshing a page never automatically joins a saved room. Choosing
Online Race prefills the previous room; joining remains an explicit action.

Both regressions were reproduced before the fix. Delayed-script and saved-seat
tests plus room/rejoin integration passed on desktop/mobile (11 passed, one
existing duplicate-platform case skipped). The loaded title/mode/course screenshot
test also passed without changing its baselines. Frontend build and Worker type
checking passed. Full-race/performance and unrelated driving screenshot tests were
not rerun for this startup-only change.
