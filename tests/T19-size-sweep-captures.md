# T19 — Five-size SP sweep with map captures (2026-08-19)

One run per size with varied count modes, post channel-fill + dominance
rule. Every run captured (`artifacts/T19-r*.png`).

## Run log

| Run | Size / Mode | Rolled | Majors (player + distant) | Largest share | Water | Spread lon / lat | Groups | Result |
|-----|-------------|--------|---------------------------|---------------|-------|------------------|--------|--------|
| r1 | Tiny / Random | 3+1 | 226/220/176 + 76 | 32.4% | 66.2% | 32/34/33, 27/34/38 | 2 (3/1) | PASS w/ **LONER: human alone in r2** |
| r2 | Small / Many | 5+2 | 231/194/173/156/146 + 97/77 | 21.5% | 65.5% | 30/36/34, 42/24/34 | 3 (2/2/2) | **PASS** |
| r3 | Standard / Few | 4+1 | 351/325/279/217 + 208 | 25.4% | 67.1% | 33/30/37, 26/37/36 | 2 (4/4) | **PASS** |
| r4 | Large / Random | 3+1 | 583/476/424 + 263 | 32.9% | 66.8% | 33/35/32, 40/35/26 | 1 (10) | **PASS** |
| r5 | Huge / Many | 6+2 | 333/294/279/260/249/234 + 182/166 | 15.9% | 66.4% | 33/32/35, 35/33/31 | **4 regions (cfg said 3!)** 3/2/2/3 | PASS w/ observation |

All 5: physical == rolled, largest mass ≤33% (dominance rule holding),
channel fill no-op on all seeds (no ≥4-tile cuts rolled — short notches
kept as intended), no critical warnings, all own-spawns homeland.

## Findings

1. **LONER (r1, Tiny)**: 4 players, groups=2, engine split 3/1 — the HUMAN
   alone in their group. First loner in ~25 monitored runs; confirms
   `minPlayersPerLandmassGroup` being dead is a real (low-frequency) risk.
   Proposed fix: post-assignment no-loner rebalance — relocate the
   lowest-fertility AI from a ≥3 group to a validated plot in the loner's
   group (reuse the Spread-swap fertility machinery). NOT yet implemented.
2. **Region overshoot (r5, Huge)**: engine produced 4 player regions with
   `landmassGroupCount=3` requested (6 continents). No gameplay harm (no
   loners, perspectives valid) but breaks the assumed `0..groupCount`
   invariant used by the test suite — suite check needs loosening to
   "regions form a contiguous 0..N set with N >= groupCount" or the engine
   behavior needs understanding (possibly group splitting when a group
   would exceed some landmass count).
3. Water settled 65.5-67.1%% across all five sizes — consistent, upper-target
   band (the -1 fill compensation may deserve reverting by 1 if 62-65 is
   preferred over 65-67).
