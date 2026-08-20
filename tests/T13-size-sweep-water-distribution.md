# T13 — Size-Sweep: Water % and Distant-Share Drift (all 5 sizes)

**Why this test exists.** The 2026-08-16 re-validation batch (T01 run 6)
found that water % drifts with map size while every gameplay rule stays
green: Huge/Random landed at **58.4%** (below the 62-68 design band),
Standard at 63.9% (dead-on), Tiny at **70.5%** (above). Distant share
drifted the opposite way (24.3% Huge, 19.0% Standard, 13.7% Tiny). One
seed per size is not evidence — this test collects the samples that either
justify or reject a size-dependent budget correction.

## Hypothesis under test

The flat `totalLandmassSize` roll (34-40 + 0.5/continent) does not scale
linearly with grid area. Land budget appears to be worth proportionally
more on big grids and less on small ones. If the sweep confirms the trend,
apply the candidate change below and re-run the same sweep to verify.

## Setup

One scenario per size, 3 seeds each (15 launches). Fixed settings isolate
the size variable:

| Run | MapSize | Count mode | Spawns | Humans |
|-----|---------|-----------|--------|--------|
| S1  | MAPSIZE_TINY     | Random (2) | Clustered | 1 |
| S2  | MAPSIZE_SMALL    | Random (2) | Clustered | 1 |
| S3  | MAPSIZE_STANDARD | Random (2) | Clustered | 1 |
| S4  | MAPSIZE_LARGE    | Random (2) | Clustered | 1 |
| S5  | MAPSIZE_HUGE     | Random (2) | Clustered | 1 |

Random count mode (the default) is deliberate: it is what most players run,
and it exercises each size's own count range. Standard SP loop; suite +
flood-fill payload after each launch; `exitToMainMenu`; repeat.

## Metrics per run (record ALL, even on pass)

From `ContinentsPlusPlusStats` + the flood-fill payload:

1. `waterPct` (engine-measured, land/(land+water))
2. Distant share: region-0 land / total land
3. Rolled config: `landmassCount`, `distantCount`, `totalLandmassSize`,
   `totalDistantSize`, `landmassGroupCount`
4. Physical landmass count (flood fill, comps ≥20 tiles) vs rolled
   `landmassCount + distantCount`
5. Land tiles per unit of `totalLandmassSize` budget (land ÷ budget) — the
   normalization that should expose WHERE the non-linearity lives

## Pass bands (per size, per seed)

| Metric | Pass | Warn (record, don't fail) | Fail |
|--------|------|---------------------------|------|
| Water % | 62-68 | 60-62 or 68-70 | <60 or >70 |
| Distant share | 15-25% | 12-15% or 25-28% | <12% or >28% |
| Physical == rolled majors | exact | +1 fragment ≤40 tiles | anything else |

Sweep-level pass: ≥12 of 15 seeds in the Pass band for water AND no size
whose 3 seeds all sit on the same side outside it. Three same-side misses
on one size = confirmed drift for that size → apply the correction.

## Candidate change (apply ONLY if the sweep confirms drift)

In `buildCppConfig()`, add a size-indexed additive correction to
`totalLandmassSize` — first guess, to be fitted against metric 5:

```
Tiny +3, Small +1, Standard 0, Large -1, Huge -3
```

Then re-run the full 15-seed sweep. Success = every size's 3-seed mean
inside 62-68 and no per-size same-side triple. Keep `MAP_SIZE_CONFIGS`
count ranges untouched — this test tunes water only; count rules are
covered by T01-T05.

## Interactions to watch

- Distant share moves when land budget moves (same denominator). Record
  both; if fixing water pushes Tiny distant share below 12%, that is T14's
  problem to solve (distant floor), not more land budget.
- Huge's 24.3% distant share may self-correct when Huge land budget drops
  (distant budget unchanged, land shrinks → share RISES — verify sign).
  If Huge distant share exceeds 28% after correction, reduce the Huge
  distant multiplier (×1.25) a step instead.

## Run log

| Date | Size | Seed # | Water % | Distant % | Rolled | Physical | Verdict |
|------|------|--------|---------|-----------|--------|----------|---------|
| 2026-08-17 | Tiny | 1 | **69.2** (warn-high) | ~12 (warn-low) | 3+1 | 4 ✓ | drift reconfirmed |
| 2026-08-17 | Standard | 1 | 65.1 ✓ | 17.5 ✓ | 5+2 | majors ✓ + 23t fragment | pass |
| 2026-08-17 | Standard | 2 | 64.1 ✓ | 17.8 ✓ | 5+1 | 6 ✓ | pass |
| 2026-08-17 | Huge | 1 | **60.7** (warn-low) | 21.7 ✓ | 6+2 | 8 ✓ | drift reconfirmed |
