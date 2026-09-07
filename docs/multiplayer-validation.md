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
