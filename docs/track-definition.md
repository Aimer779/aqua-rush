# Aqua Rush V3 TrackDefinition

`src/game/ContentCatalog.ts` is the authored content source. `TRACK_CATALOG` contains `sunset-circuit`, `storm-reef`, `neon-leviathan`, `caldera-throat`, and `storm-needle`. `ONLINE_TRACK_IDS` permits Sunset Circuit, Storm Reef, and the revised Neon Leviathan. Caldera Throat and Storm Needle remain local experimental courses. Unknown IDs are rejected.

## Stable fields

| Field | Purpose |
| --- | --- |
| `id`, `name`, `displayName`, `subtitle`, `description`, `difficulty` | Menu and diagnostics identity |
| `seed` | Deterministic procedural placement |
| `halfWidth`, `width`, `buoySpacing` | Advisory guide/marker placement; never a solid race corridor |
| `lapCount`, `spawnGrid` | Session length and the four authored start slots |
| `markerPreset` | Course-specific standard/tall/hazard marker language |
| `environmentKit`, `landmarks` | Course-specific landmark family and authored progress/lateral placements |
| `timeTrialTargets` | Gold/silver/bronze authored total-time references |
| `controlPoints` | Closed Catmull-Rom route used by AI, guide, recovery, and authored placements |
| `checkpoints` | Ordered directional plane definitions |
| `interactions` | Optional Boost Gate / Drift Gate placement and rewards |
| `rocks` | Visible physical circular collision proxies |
| `environment`, `environmentPreset` | Sky, fog, water, exposure, ambience preset, and storm art direction (compatibility + explicit preset handle) |
| `waves`, `wavePreset` | Exactly four Gerstner layers shared by CPU and GPU (compatibility + explicit preset handle) |
| `ai` | Per-course look-ahead, speed, and preferred-line values |

## Directional checkpoints

Each course has 12 validation sectors: six visible gates (including finish) and six hidden anti-shortcut sectors. `RaceTrack` converts each definition into an oriented plane with center, forward normal, lateral vector, half-width, and vertical limit.

A crossing is legal only when all conditions hold:

1. It is the racer's expected next sector.
2. The swept previous→current segment crosses from the back side to the front side.
3. Velocity has a positive forward component above the minimum.
4. The intersection lies within the plane height and the authored half-width plus a 2.4-unit lateral arcade-forgiveness margin.
5. The frame step is not an implausible teleport.

Reverse, side, vertical, low-speed, repeated overlap, skipped, and out-of-order attempts cannot advance the lap. The finish plane counts a lap only after all previous sectors.

## Open water and recovery

`halfWidth` is advisory. It is used for AI line choice, marker placement, guide presentation, and off-route feedback only. `CollisionSystem` resolves boats, catalogued visible rocks and shared landmark footprints, and the extreme ±400-unit world safety bound. It never pushes a boat back into a track corridor.

Recovery moves the player to the last valid sector without changing lap, expected checkpoint, gate claims, or remaining boost. It is an explicit `X`/Pause action; off-route and stationary states only change its presentation and eligibility diagnostics.

## Content extension rule

The approved Map Pack expansion adds three P0 courses via `ExperimentalMapPack.ts`. Each definition is validated at registration. `landmarks.kind` selects cargo, volcano or turbine modules; positions use arc-length progress plus lateral offset. `LandmarkFootprints.ts` shares visible foundations with collision proxies. Neon Leviathan revision 2 adds optional `routes` and bounded `currents` shared by boat control, server and prediction. The full Tidal Roulette, moving-ship and flight designs remain unregistered. See [implementation evidence](map-expansion-review.zh-CN.md).
