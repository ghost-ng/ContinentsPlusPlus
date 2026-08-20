# T18 — SP confirmation runs for the 2026-08-18 map-logic changes

In-game validation of: the selective inland-channel fill, the 3-continent
global floor, the low-count variance cap (30), and the largest-mass
dominance rule (no landmass near 50% of land).

## Run log

| Date | Run | Config | Result | Notes |
|------|-----|--------|--------|-------|
| 2026-08-18 | 1 | Standard / Random / 1h | **PASS** | First in-game fill: `Channel fill: filled 63 inland channel tiles`, residual in-game channels = 1 (baseline 93). Physical == rolled 3+2 (597/471/385 + 159/120), 3 groups 3/2/3, no loners. Water 59.1%% (wet outlier, watch). Spread 35/35/30 lon, 35/30/35 lat. Render `T18-sp1-standard-render.png` — visibly cleaner continents. |
| 2026-08-18 | 2 | Small / Few / 1h | **PASS** | Selective fill (user feedback: keep character): this seed had NO ≥4-tile channel runs → fill correctly no-op; **30 short notch tiles kept** as bays/fjords. Physical == rolled 3+2 (361/290/211 + 92/55), water 66.7%%. Render `T18-sp2-small-render.png`. Prompted the dominance rule: largest mass held 42%% of land. |
| 2026-08-18 | 3 | Small / Few / 1h | **PASS** | Post dominance-rule (3-continent floor + variance cap 30 + harness ≤45%% gate): rolled 3+2, **largest mass 32.3%% of land** (was 42%%), balanced trio 391/319/313, water 62.4%%. Render `T18-sp3-small-dominance-fix-render.png`. |

## Rule changes validated here

- `fillInlandChannels`: only fills channel runs of ≥4 connected candidate
  tiles; shorter cuts (bays/fjords/notches) are kept as coastline character.
- Global 3-continent floor: 2-continent rolls removed from ALL modes/sizes
  (a 2-continent map puts ~45-50%% of land in one mass).
- `maxSizeVariance` capped at 30 when ≤3 continents.
- Harness: `largest mass <= 45%` hard gate + channel metric counts only
  ≥4-tile runs. Full gate after changes: Few 30/30, Random 30/30,
  Many 26/30 (known marginals only).
