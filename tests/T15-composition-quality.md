# T15 — Map Composition Quality ("does it look like a world?", all 5 sizes)

**Why this test exists.** The Tiny/Few map from T01 run 6 passed all 25
functional checks and was still visually bad: two player continents
huddled in one blobby cluster, the east half of the map empty ocean plus
16 scraps of island debris. "Earthlike" is partly aesthetic, but the
failure modes are quantifiable. This test turns the eyeball verdict into
numbers so tuning changes can be regression-tested.

## Metrics and pass bands

All from a single flood-fill + scan payload (no visual judgment needed;
render_map for the human record only):

### 1. Debris ratio
Tiles in sub-20-tile components ÷ total land. Observed: 7.6-10% on good
maps, 10% on the bad Tiny one (debris was not Tiny's core problem, but it
compounds). **Pass ≤12%, warn 12-15%, fail >15%.**

### 2. Runt landmasses
Every rolled landmass (player AND distant) must be a real continent:
smallest major component ≥ **4% of total land** (the 47-tile distant on
672 land tiles = 7% — passes here but fails T14's absolute floor; the two
tests overlap deliberately: this one catches runts on big maps where 4%
is a lot of tiles, T14 catches absolute-tiny islets).
**Fail if any major component < 4% of land.**

### 3. Size variance sanity
Largest ÷ smallest PLAYER landmass ≤ **2.5**. `maxSizeVariance` rolls
30-50, which should land ratios in ~1.3-2.1 (observed: 1.35, 2.04, 1.48).
A ratio above 2.5 means variance compounding with erosion produced a runt.
**Fail >2.5.**

### 4. Spatial spread (the "empty half" detector)
Split the map into longitudinal thirds (x-bands, wrap-aware: anchor band 0
at the largest landmass's centroid). Each third must hold ≥ **15%** of
total land. The bad Tiny map concentrates ~80% of land in one half —
this is the check that would have flagged it. **Pass ≥15% per third,
fail <10% in any third.**

### 5. Landmass separation
For each pair of major components, minimum tile-to-tile hex distance.
Ocean separation (`forceOceans`) guarantees ≥2 water tiles between
distinct landmasses — verify **min pairwise gap ≥ 3** (a 1-2 tile strait
reads as one continent from orbit and lets Antiquity ships trivially
cross). Record the full gap matrix; **warn at 3-4, comfortable ≥5.**

### 6. Latitude banding (earthlike biome check)
Row-wise biome distribution: tundra fraction in the polar quarters (top +
bottom 25% of rows) must exceed tundra fraction in the equatorial half by
≥2:1, and tropical the reverse. Confirms the engine's banding survived the
mod's landmass placement. **Fail only on inversion (tundra at equator).**

## Setup

One run per size, Count mode Random, Clustered, 1 human, 2 seeds each
(10 launches). Reveal + `render_map` each run and file the PNG with the
run log — the numbers gate, the picture documents.

## What to change if it fails

- **#4 spatial spread**: the Voronoi seed points cluster. Look at whether
  `m_settings` exposes seed-relaxation or placement-spread knobs
  (`relaxation` existed in the v2-era API; find its v3 equivalent in
  `UnifiedContinentsBase` before inventing anything). More continents on
  the roll also spreads mass — consider raising Tiny's Few floor from 2
  to 3 (config change in `MAP_SIZE_CONFIGS`).
- **#1 debris**: lower `coastalIslands` (rolled 3-5) and/or
  `islandTotalSize` (2.5) for Tiny/Small only.
- **#3 variance**: cap effective `maxSizeVariance` at 40 when
  `landmassCount <= 3` (few big continents + high variance = one runt).
- **#5 separation**: widen `forceOceans` margin — check
  `getVoronoiValidationSettings()` for the gap parameter.

Any change here re-gates T13 (water) and T14 (distant floor) — the three
tests share a budget pool and must be re-run together after tuning.

## Run log

| Date | Size | Seed # | Debris % | Runt? | Variance ratio | Thirds % | Min gap | Banding | Verdict | Render |
|------|------|--------|----------|-------|----------------|----------|---------|---------|---------|--------|
| 2026-08-17 | Tiny | 1 | 3.7 ✓ | no | 1.34 ✓ | 30/35/34 ✓ | 6 ✓ | ✓ | **PASS on all 6 composition metrics** — the coastalIslands/islandTotalSize + groupBalancedMode update visibly fixed Tiny (compare 2026-08-16 debris map) | run1-tiny-random-updated.png |
| 2026-08-17 | Standard | 1 | 9.5 ✓ | 20t r0 comps | **13.3 FAIL** (23t r3 fragment counted as player mass) | 33/35/32 ✓ | **2 FAIL** (306r2↔204r3) | ✓ | fragments + strait | run2-standard-random-updated.png |
| 2026-08-17 | Standard | 2 | — | no | — | — | **2 FAIL** (394r1↔281r1) | — | strait between same-group masses | — |
| 2026-08-17 | Huge | 1 | 5.5 ✓ | no | 1.83 ✓ | 25/42/33 ✓ | **2 FAIL** (418r1↔378r1) | ✓ | strait only | run4-huge-random-updated.png |

**2026-08-17 fix round 2** (widenStraits pass + size corrections [5,2,0,-1,-3] +
Tiny distant fixed at 1 + loner cap ≤ floor(players/2)):

| Size | Water % | Coast/water | Distant | Min gap | Loners | Thirds | Verdict |
|------|---------|------------|---------|---------|--------|--------|---------|
| Tiny | **69.0** (budget-insensitive, see below) | 42.3 | 74t ✓ | **3 ✓** (9 converted) | none ✓ | 37/45/18 ✓ | strait+distant+loner fixed; water open |
| Standard | 67.7 ✓ | 39.1 | 163t ✓ | **3 ✓** (16 converted) | none ✓ | 31/37/32 ✓ | ALL GREEN |
| Huge | 62.5 ✓ | 37.5 ✓ | 191/136 ✓, 20.0% | **3 ✓** (6 converted) | none ✓ | 29/42/30 ✓ | ALL GREEN |

KEY FINDING (Tiny water): `totalLandmassSize` 38 → 41.5 → 45 all produce
69.0-69.2% water on Tiny — the land budget SATURATES on small grids
(suspect fixed overheads: polar margins + per-cell minimums + separation
consume proportionally more of a 60×38 grid). Raising the budget further is
pointless; the lever must be something structural (polarMargin, cell count,
or accepting ~69% as Tiny's floor). Best explored offline via a headless
harness, not 90-second in-game cycles.

**2026-08-17 fix round 3 — HEADLESS HARNESS + DEEP OCEAN (see `harness/`)**:
built a Node harness (`node --import ./harness/register.mjs harness/run.mjs`)
that runs buildCppConfig + the real Voronoi simulate + widenStraits headless
(~2 s/seed vs ~90 s in-game; base scripts are pure JS, RandomImpl has a PCG
fallback, map-globals ships its own GameInfo dummy). Iterated 4 tuning rounds
over 40-seed sweeps (5 sizes × 8):
- `widenStraits` → full separation pass: 1-hex pinch widening (all majors),
  2-hex channel widening between DIFFERENT regions (gap ≥ 4), then
  orphan-coast trim (coast with no land neighbor → OCEAN) → **true deep
  ocean between all regions** (Antiquity ships can't cross), coast share
  40% → 24-36%.
- Final knobs: sizeCorrection [5,2,0,-2,-4]; distant budget
  max(5, (idx≥3 ? 3.0 : 3.5)×distantCount); maxDistantSizeVariance 30;
  erosion 6-10; Tiny Random count max 3.
- Sweep result: **36/40 PASS**; 4 marginal single-metric fails (one 70.5%
  Tiny water, two erosion-split fragments, one 12.1% debris). Split-continent
  fragments (~7% of seeds) remain an open erosion artifact.
- In-game validation (Standard): matches harness — water 63.5, coast 28.8,
  gaps 3/9, ocean in every corridor, 4+2 == rolled, distant 133/86,
  40 resources on distant lands, 8/8 placed 4/4, no loners, all homeland ✓.

**2026-08-17 fix round 4 — split-fragment root cause + articulation guard**:
The "erosion split" fragments were actually caused by `widenStraits` itself —
eroding channel tiles at a neck cut peninsulas off (a 404-tile continent lost
a 98-tile piece; verified via `getRegionCellForHex().landmassId`, which shows
the true rolled-landmass identity per tile). Fixes:
- **Articulation guard** in the separation pass: a tile is only eroded if its
  land neighbors stay connected within the 1-ring (no disconnection).
- **Two-sided pinch erosion**: try the smaller major's tiles first, fall back
  to the larger's; only leave a strait when both sides are necks (rare).
- `repairSplitLandmasses(voronoiMap)` (exported, runs before widenStraits)
  bridges genuine same-landmassId splits — currently a no-op safety net since
  the guard prevents the cause.
Final sweep: **37/40 PASS** — residuals: one Tiny 70.5% water (saturation),
one both-sides-neck gap-2 strait, one 2.66 variance. In-game Huge validation:
7+3 == rolled, water 60.1, coast 35.3, distant 195/158/140 (22.1%) with 89
resource tiles, gaps 3/8 + ocean in all corridors, 10/10 placed 5/5, no
loners, all homeland ✓.

**2026-08-17 batch findings** (post groupBalancedMode/spawn-distance/island update):
1. **Composition goals achieved**: spread (thirds) passes everywhere — no more
   empty-half maps; debris down to 3.7-9.5% (from ~10%); Tiny visually fixed.
2. **NEW REGRESSION — 1-hex straits**: min gap 2 in 3 of 4 seeds (was 6 on
   the one pre-update measurement). Suspect `minLandmassSpawnCenterDistance:
   0.25` lets Voronoi spawn centers sit close enough that erosion leaves a
   single-hex channel. Candidate fix: raise 0.25 → 0.35-0.4, keep max 0.85.
3. **INTERMITTENT — regions exceed rolled groups**: Standard seed 1 rolled
   `landmassGroupCount=2` but engine produced regions [0,1,2,3] (+ a loner
   in r1). 1 of 4 seeds. Suspect `groupBalancedMode=1` re-partitions groups.
   Needs a suite check (`regions ⊆ 0..groupCount` was in the original suite —
   keep it) and more seeds to characterize.
4. **Loner risk on Tiny confirmed**: 4 players + rolled groups=3 → two loners
   (seed 1). `minPlayersPerLandmassGroup` is dead in engine — mod must cap
   `landmassGroupCount ≤ floor(playerCount/2)` in `buildCppConfig()`.
5. Coast share of water: Tiny 33% ✓ but Standard 40-41% / Huge 41% still
   above the ~25-35% target — the island reduction only fixed small maps.
6. T13 water drift reconfirmed: Tiny 69.2 / Standard 64-65 / Huge 60.7.
