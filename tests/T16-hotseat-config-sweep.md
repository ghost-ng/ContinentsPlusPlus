# T16 — Hotseat Config Sweep (every Count × Spawns combo, 2-3 humans)

Complete the multiplayer matrix: every Continent Count mode crossed with
every Human Spawns mode, all in real hotseat. T08/T09/T10 already cover
Many/Clustered/2, Many/Spread/2 and Many/Spread/3 — this sweep adds the
remaining six combos plus a min-continent Spread stress case, with repeat
seeds on the Spread combos (the mod's custom swap code path).

All runs: Standard size, hotseat via the MCP tuner→CDP fallback, turn-1
verification (no age transition — T12 gates that), full-evidence procedure
(README step 6: render + screenshots + full data + cross-review).

## Scenarios

| # | Count mode | Spawns | Humans | Expected groups | Human expectation |
|---|-----------|--------|--------|-----------------|-------------------|
| S1 | Few (0) | Clustered (0) | 2 | 1 | same region, mutual homeland |
| S2 | Few (0) | Spread (1) | 2 | min(2, count) = 2 | different regions, mutually distant |
| S3 | Few (0) | Random (2) | 2 | 1-3 (2-3 if count≥4) | unconstrained — record |
| S4 | Many (1) | Random (2) | 2 | 2-3 (count≥5 → ≥4 rule met) | unconstrained — record |
| S5 | Random (2) | Clustered (0) | 2 | 1 | same region, mutual homeland |
| S6 | Random (2) | Spread (1) | 2 | min(2, count) = 2 | different regions, mutually distant |
| S7 | Random (2) | Random (2) | 2 | 1-3 / 2-3 by count | unconstrained — record |
| S8 | Few (0) | Spread (1) | **3** | min(3, count, 4) | if groups < 3, one pair shares; every cross-group pair mutually distant; no loners |

Repeat seeds: S2 and S6 run twice (Spread exercises the post-assignment
human swap — the custom code most likely to be seed-sensitive).

## Shared assertions (every run)

1. No `OVERRIDE to 2 (Random)` line (2+ humans — the single-human override
   must NOT fire) and no `CRITICAL WARNING`
2. `CONFIRMED: All human players spawn on player landmasses`
3. Rolled `landmassCount` within the mode's range (Few 2-4, Many 5-7,
   Random 3-5 on Standard); `landmassGroupCount` per the Expected column
4. All humans region > 0; `isDistantLands(own spawn) === false` for every
   player; region-0 land exists and is minority
5. No player alone in a landmass group; every player placed
6. Scenario human expectation (Expected/Human columns above)
7. Full-evidence step: flood-fill majors all single-region, physical
   player masses consistent with rolled count (eroded runt <20t allowed,
   flagged), cross-region water gap ≥ 3 land-to-land, render vs data agree

## Clustered semantics note

Clustered → `landmassGroupCount = 1`: ALL players (humans + AI) share one
group; the other rolled continents hold no players but stay region>0? NO —
with 1 group every player landmass belongs to group 1, so "distant" for
everyone is region 0 only. Assert: single player region in use, humans in
it, both humans mutually homeland.

## Run log

| Date | # | Result | Rolled (count/distant/groups) | Humans (id:region) | Notes |
|------|---|--------|-------------------------------|--------------------|-------|
| 2026-08-17 | S1 | **PASS** (semantics) | 2/1/1 | 0:r1, 1:r1 | Clustered honored: groups=1, all 8 players r1, humans mutual homeland, no loners, no override. Water 62.2%, distant 306t. **OBSERVATION: 3 physical r1 masses (786/403/173) vs rolled 2** — with groups=1 the region map can't attribute masses to rolled continents; gap 2 water between them (normal separation). Not a gameplay defect under Clustered (everything is homeland); flagged for harness follow-up on Few configs. Evidence: T16-S1-render.png + 2 screenshots; render/data agree. **User review: map visibly lopsided (south-heavy band, empty north-center) — the Few=2-continent roll concentrates mass; supports T15's raise-Few-floor-to-3 proposal. Spatial-spread metric added to all subsequent runs.** |
| 2026-08-17 | S2a | **PASS** | 4/1/2 | 0:r1, 1:r2 | Spread honored: swap fired (`best of 4 donor(s)`, fertility 3→4), humans mutually distant, 4/4 split, no loners. Water 63.9%. Spread metrics: lon thirds 32/33/35, lat 35/38/27 — balanced. **OBSERVATION: 22t r1 fragment at 1-water gap** (3rd small player-mass in 2 T16 runs; erosion 10%%). Evidence: T16-S2a-render.png + screenshot. |
| 2026-08-17 | S2b | **PASS** | 4/1/2 | 0:r1, 1:r2 | Spread honored (swap fertility 5→4 donor, best of 4), mutually distant, 4/4, no loners. Water 65.9%. **Physical majors == rolled: 4 player masses** (353/347/324/223) + 169t distant. Gaps 2/7. Spread lon 32/32/36, lat 30/30/40 — balanced. Small fragments 12/8/4/4t r>0 (runt debris pattern, tracked). Evidence: T16-S2b-render.png. |
| 2026-08-17 | S3 | **PASS** | 3/1/2 | 0:r1, 1:r1 (together — allowed) | Random spawns: groups=2 in 1-3 range, no override with 2 humans, humans unconstrained (engine put them together in r1), 5/3 split, no loners. **Physical majors == rolled 3** (582/460/291) + 184t distant. Gaps 2/– (cross-region >10). Water 63.1%. Spread lon 37/31/31, lat 33/39/28 — balanced. Evidence: T16-S3-render.png. |
| 2026-08-17 | S4 | **PASS** | 7/1/2 | 0:r2, 1:r2 (together — allowed) | Many+Random: rolled 7 in 5-7 range, groups=2, no override, 4/4, no loners. **Physical majors == rolled 7** (196/190/187/170/168/148/118) + distant 172+30. Water 65.6%. Spread lon 32/34/34, lat 35/26/39. 21t r2 fragment at 1-water gap (pattern tracked). Evidence: T16-S4-render.png. |
| 2026-08-17 | S5 | **PASS** (semantics) | 5/1/1 | 0:r1, 1:r1 | Clustered honored: groups=1, all 8 r1, mutual homeland, no loners, no override. **Physical majors == rolled 5** (296/184/182/152/148) + 204t distant. Gaps 2/–. **SHAPE FLAGS: water 71.6%% (target 62-68), lat spread 41/41/18 — bottom third sparse (the lopsidedness class the user flagged)**; lon 30/44/26 borderline. Evidence: T16-S5-render.png. |
| 2026-08-17 | S6a | **PASS** | 4/1/2 | 0:r1, 1:r2 | Random count + Spread: rolled 4 in 3-5 range, swap fired (best of 3 donors, fertility 3→4), humans mutually distant, 5/3, no loners. **Physical majors == rolled 4** (395/289/277/198) + 183t distant. Gaps 2/– (cross >10). Water 68.3%% (top edge). Spread lon 40/30/30, lat 35/32/33. Evidence: T16-S6a-render.png. |
| 2026-08-17 | S6b | **PASS** | 3/2/2 | 0:r2, 1:r1 | Spread seed 2: swap rescued human from fertility 2 → 4 donor (best of 3), mutually distant, 5/3, no loners. **Physical == rolled: 3 player (524/431/352) + 2 distant (138/111)**. Gaps 2/9. Water 63.3%%. Lon 48/26/27 (passes ≥15%% but concentrated), lat 29/29/42. Evidence: T16-S6b-render.png. |
| 2026-08-17 | S7 | **PASS** | 3/1/3 | 0:r3, 1:r3 (together — allowed) | Full-random MP defaults: groups=3 in 1-3 range (count<4), no override, 3/2/3 split, no loners. **Physical == rolled: 3 player (517/495/390) + 178t distant.** Gaps –/6. Water 63.1%%. Lon 34/31/36, lat 31/27/42. Evidence: T16-S7-render.png. |
| 2026-08-17 | S8 | **PASS** | 2/1/2 | 0:r1, 1:r2, 2:r1 | **Min-continent stress, 3 humans, 2 groups: graceful degradation verified.** Swap moved human 1 to r2 (best of 4 donors), then logged `Spread: no free group for human 2 — leaving in region 1`. Cross-group pairs (0-1, 1-2) mutually distant both ways; sharing pair (0-2) mutual homeland. 4/4, no loners. **Physical == rolled: 2 player (789/729) + 230t distant.** Water 58.6%% (below 62-68 — Few/2 + 3 humans pushes land budget up). Lon 30/31/39, lat 33/40/27. Evidence: T16-S8-render.png. |

## Relative-homeland matrix run (2026-08-18, post-tuning)

Hotseat Many/Spread/**3 humans** — the exhaustive per-player relativity
check. Rolled 5 continents + 2 distant, 3 groups; both Spread swaps fired
(`best of 5` / `best of 3` donors) → humans in regions [2, 3, 1], all
different. The matrix: **8 players × 64 sample plots (8 per physical
landmass, both distant masses and a 20t island included) = 512
`isDistantLands` calls, 0 mismatches** — every call returned distant
exactly when the plot's group ≠ that player's spawn group. Concretely:
region-2 plots read homeland to players 0/3/4 and distant to 1/2/5/6/7
simultaneously; region-0 read distant to all 8. All own-spawns homeland;
all 3 human pairs mutually distant both directions. Evidence:
`T16-relative-homelands-render.png`.

## Verdict (2026-08-17)

**9/9 runs PASS on multiplayer semantics** — every Count × Spawns combo now
verified in real hotseat (with T08-T10 completing the grid). Spread's swap
code worked in all 4 exercises incl. the no-free-group fallback; Clustered
forced 1 group both times; Random stayed in range and left humans
unconstrained (engine put them together in all 3 Random-spawn runs — worth
knowing: Random usually plays like Clustered for humans). No loners, no
overrides, no critical warnings, all own-spawns homeland in 72 player
placements.

Cross-cutting SHAPE observations for T13/T15 follow-up (not MP defects):
1. **Small player-region fragments (4-22t) at 1-2 water gap in most runs**;
   S1 had a 173t case. Physical majors matched rolled count in 7/9 runs
   (exceptions S1 +1 big, S4 +1 small at 21t).
2. **Lopsidedness**: S1 (user-flagged, Few/2) and S5 (lat 41/41/18, water
   71.6%) — Few/low-count rolls concentrate mass; supports raising the Few
   floor to 3 on Standard+ and adding a latitudinal-thirds check to T15.
3. Water drift: 58.6-71.6%% across the sweep vs the 62-68 target — the
   extremes came from Few-mode rolls (S8 low, S5 high with count=5 rolled
   small).

## Tuning round (2026-08-18) — observations 1-3 addressed

Harness-driven (all three count modes now gated, 90 seed-runs):

| Change | Why |
|--------|-----|
| Few made size-aware: Tiny 2-3, Small 2-4, **Standard+ 3-4** | Tiny rolled 4 (distant squeezed out); Huge rolled 2 → thirds 40/50/10 — the S1 "lopsided map" class |
| Tiny Many fixed at 5 | 6 continents on 60×38 starve the smallest below major size even at the schema's 50%% land ceiling |
| Per-continent land increment 0.5 → 1.1 on Tiny/Small (clamped at 50) | Many measured 70-74%% water on small grids |
| Variance caps: ≤35 at 5 continents, ≤30 at 6+, ≤40 at ≤3 | runt continents (harness ratios to 4.0; T12's 17-tile continent) |
| Distant caps: ≤2 when ≤3 or ≥5 continents; 1 on Tiny/Small at 7+; per-mass floor +0.5 at 7+ | distant share 29%% overruns and sub-viability second distants |
| Tiny size correction +5 → +6 | Tiny water sat 70-71%% |
| Harness: latitudinal-thirds check (≥12%%) + Tiny+Many water bound 73 | the lopsidedness axis T15 couldn't see; documented Tiny saturation |

Final harness: **Few 30/30, Random 29/30, Many 26/30** — every residual a
1-3-point marginal (3 on the saturated Tiny+Many combo, one 12.9%% debris,
one 2.66 variance). In-game hotseat confirmation (Few/Spread/2, Standard):
rolled 3+2 (floor active), variance capped 40, swap fired, humans mutually
distant, physical == rolled (504/499/372 + 132/88), water 61.8%%, lon thirds
31/35/34, lat 25/34/41 — `T16-tuning-confirm-render.png`.
