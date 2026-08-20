# T14 — Distant-Lands Viability Floor (all 5 sizes, worst on Tiny)

**Why this test exists.** T01 run 6's Tiny/Few map rolled
`totalDistantSize` 3 (after the ×0.75 small-map multiplier) and produced a
**47-tile** dedicated distant landmass — an islet, not a landmass. The
mod's headline mechanic (Exploration-age treasure gameplay on Distant
Lands, T11) needs region-0 land big enough to host treasure resources,
landing sites, and settleable territory. A distant "continent" under ~60
tiles is cosmetically and mechanically dead weight.

## What "viable" means (the assertions)

Per dedicated distant landmass (flood-fill component whose majority region
is 0, size ≥20 — smaller comps are islands, not dedicated landmasses):

1. **Size floor**: every dedicated distant landmass ≥ **60 tiles**
   (Tiny/Small) / ≥ **80 tiles** (Standard+). Calibration: T11's passing
   Standard run had 388 distant tiles and 40 treasure tiles on them; the
   good Huge run's three distant masses were 201/182/139.
2. **Count integrity**: number of such components == rolled `distantCount`
   (no distant landmass eroded below the island threshold).
3. **Resource capacity**: ≥5 resource tiles on each dedicated distant
   landmass at Antiquity generation (proxy for Exploration treasure slots —
   `MapIslandBehavior` replaces resources in place, so zero Antiquity
   resources predicts zero treasure).
4. **Settleable land**: ≥40% of each distant landmass's tiles are flat or
   hill (not mountain/navigable-river) — a treasure island you cannot
   plant a city near is dead.
5. **Distant share** (whole map): 15-25% of land (shared band with T13).

## Setup

All 5 sizes, Count mode **Few (0)**, Clustered, 1 human, 2 seeds each
(10 launches). Few mode is the stress case: it minimizes total continents,
which minimizes `totalLandmassSize`'s +0.5/continent term while the
distant budget stays on its own scaling — the Tiny/Few combination is
exactly what produced the 47-tile failure.

## Candidate changes (apply only on confirmed failure)

Ordered — try 1 first, escalate to 2 only if 1 is insufficient:

1. **Floor the budget**: `totalDistantSize = max(4, rolled)` after size
   scaling. Cheap, targeted at Tiny/Small.
2. **Flatten the small-map penalty**: change the size multiplier curve
   from ×0.75 (Tiny) → ×1.0, keeping ×1.25 (Huge). Rationale: small maps
   need proportionally MORE distant budget, not less — the Voronoi cell
   floor means a small budget fragments instead of shrinking gracefully.
3. If a distant landmass still erodes below floor with a healthy budget,
   lower `erosionPercent` for distant landmasses specifically (needs a
   per-landmass-type erosion knob — check whether `m_settings` exposes
   one before inventing it).

Water % must stay inside T13's bands after any change here — run at least
one T13 spot-check per size after applying.

## Measurement payload sketch

Flood fill (hex, odd-row offset, X-wrap — pattern in FiretunerTerminal
`test-harness/game-api-testing.md`), keep comps with majority region 0 and
size ≥20; per comp count resource tiles (`getResourceType != -1`) and
flat/hill tiles; compare comp count to `stats.config.distantCount`.

## Run log

| Date | Size | Seed # | Rolled distant | Comps found (sizes) | Min size | Resources/comp | Settleable % | Verdict |
|------|------|--------|----------------|--------------------|----------|----------------|--------------|---------|
| 2026-08-17 | Tiny | 1 (Random mode, not Few) | 1 (budget 3.75) | [58] | **58 < 60 floor** | — | — | **FAIL (2 tiles under)** — floor fix still needed |
| 2026-08-17 | Standard | 1 (Random mode) | 2 (budget 5) | [103, **65**, 20, 20] | 65 < 80 floor; 2 extra 20t comps | — | — | **FAIL** — budget split thin |
| 2026-08-17 | Huge | 1 (Random mode) | 2 (budget 8.75) | [308, 170] | 170 ✓ | — | — | PASS |
