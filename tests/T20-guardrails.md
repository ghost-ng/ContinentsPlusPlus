# T20 — Regression guardrails (2026-08-19)

Added after T19's findings; everything below is now enforced automatically.

## The guardrails

1. **No-loner rebalance (mod)**: post-assignment pass in `generateMap` —
   when a group holds exactly 1 player and another holds ≥3, the
   lowest-fertility AI relocates to the best valid plot in the loner's
   group (min 8-plot spacing, relax 6; land, passable, fertility > 0).
   Bails gracefully (logged) when unfixable. Logs `Loner rebalance:` lines.
2. **In-game suite hardened** (`scripts/mapgen-test-suite.js`):
   - region invariant corrected: regions must be contiguous 0..N (engine
     may legally overshoot requested groups — reported, not failed)
   - NEW: dominance rule (largest landmass ≤45% of land)
   - NEW: long inland channels ≤8 tiles
   - FIXED latent suite bug: cross-perspective + spawn-distance checks
     read `p.x/p.y` which never existed — cross-perspective compared
     `undefined` and spawn-distance passed vacuously (Infinity). Both now
     use real coordinates, and Infinity fails loudly.
3. **One-command harness gate**: `.\scripts\gate.ps1` — all 3 count modes ×
   5 sizes × 6 seeds (90 runs), exit 1 on any NEW failure.
4. **Known-marginals baseline** (`harness/known-marginals.json`): the 5
   documented residuals are pinned by (mode, seed, check) and downgraded to
   `~ known:` warnings. The same seeds failing a DIFFERENT check, or any
   other seed failing anything, breaks the gate. Re-baseline deliberately.

## Rerun results (post-guardrail)

| What | Result |
|------|--------|
| Full harness gate (90 runs) | **GATE PASSED** — 85 clean, 5 known-marginal |
| Standard SP + full suite | **27/27 PASS** (incl. new dominance 23.9%, channels 0, real cross-perspective all-true, spawn dist 13) |
| Tiny ×2 (loner path) | 1-group and 2/2 rolls — no loner, rebalance correctly idle |
| Hotseat Standard/Many/Spread/2 | Swap fired, humans r1/r2 mutually distant, 5/3, no loners, rebalance idle — no interaction with Spread |

## T21 — 5-run post-guardrail capture sweep (2026-08-19)

| Run | Size / Mode | Rolled | Largest share | Water | Groups | Loners | Verdict |
|-----|-------------|--------|---------------|-------|--------|--------|---------|
| r1 | Tiny / Many | 5+1 g2 v35 | 22.2% | 66.4% | 2/2 | none | PASS |
| r2 | Small / Random | 3+2 g2 v30 | 33.3% | 61.8% | 2/4 | none | PASS |
| r3 | Standard / Many | 7+2 g3 v30 | 14.2% | 68.2% | 2/4/2 | none | PASS |
| r4 | Large / Few | 3+2 g2 v30 | 33.3% | 65.6% | 7/3 | none | PASS |
| r5 | Huge / Random | 5+2 g3 v35 | 18.4% | 65.0% | 2/4/4 | none | PASS |

All 5: physical == rolled, dominance ≤33.3%, no loners (rebalance idle —
engine splits were all ≥2), no fill needed (no long cuts rolled), no
critical warnings, all own-spawns homeland. Variance caps visible in every
config (v30/v35). Captures: `artifacts/T21-r*.png`.

## Workflow rule

**`.\scripts\gate.ps1` must pass before every deploy.** In-game suite runs
via `mcp__civ7__execute_js_file` on `scripts/mapgen-test-suite.js`.
