# Continents++ Test Matrix

Automated in-game tests for every mod setting, driven through the FireTuner
MCP (`execute_js`). Shared methodology lives in
`research/testing-workflow.md`; MCP/UI mechanics in FiretunerTerminal
`tests/`; the assertion payload is `scripts/mapgen-test-suite.js`.

## The settings under test

| Setting | Values |
|---|---|
| Continent Count (`ContinentsPPContinentCount`) | 0 = Few (2-4), 1 = Many (5+), 2 = Random (size-based) |
| Multiplayer Human Spawns (`ContinentsPPPlayerDistribution`) | 0 = Clustered, 1 = Spread, 2 = Random (single human always forces 2) |
| Map Size (base game) | Tiny → Huge (scales counts, distant landmasses, capacity) |

## Matrix

| Test | Size | Count mode | Spawns | Humans | Focus | Status |
|------|------|-----------|--------|--------|-------|--------|
| [T01](T01-single-player-many.md) | Standard | Many | Clustered | 1 | Smoke + single-human override + cross-homelands | **PASSING** (runs 2-4) |
| [T02](T02-standard-few.md) | Standard | Few | Clustered | 1 | Few continents (2-4); distant lands still exist | **PASSING** |
| [T03](T03-standard-random-count.md) | Standard | Random | Clustered | 1 | Default mode; size-based count range | **PASSING** |
| [T04](T04-tiny-random.md) | Tiny | Random | Clustered | 1 | Min-size stress; small-map thresholds | **PASSING** |
| [T05](T05-huge-many.md) | Huge | Many | Clustered | 1 | Max continents (5-8); generation time | **PASSING** |
| [T06](T06-spread-override-sp.md) | Standard | Random | **Spread** | 1 | Spread must force-override to Random in SP | **PASSING** |
| [T07](T07-multiplayer-distribution.md) | Standard | Many | Clustered & Spread | 2+ | Multi-human semantics reference (superseded by T08-T10) | reference |
| [T08](T08-hotseat-clustered.md) | Standard | Many | Clustered | 2 | Hotseat: humans share ONE group | **PASSING** (via CDP 9444) |
| [T09](T09-hotseat-spread.md) | Standard | Many | Spread | 2 | Hotseat: humans in DIFFERENT groups, mutually distant | **PASSING** (bug found + fixed) |
| [T10](T10-hotseat-spread-3h.md) | Standard | Many | Spread | 3 | 3 humans → 3 groups, all pairs mutually distant | **PASSING** |
| [T11](T11-sp-age-transition.md) | Standard | Many | Clustered | 1 | SP Antiquity→Exploration transition; treasure resources | **PASSING — release gate** |
| [T12](T12-hotseat-age-transition.md) | Standard | Many | Spread | 2 | Hotseat age transition; per-human perspectives survive | **PASSING — MP release gate** |
| [T13](T13-size-sweep-water-distribution.md) | **all 5** | Random | Clustered | 1 | Water % / distant-share drift vs size; 3 seeds/size; gates the size-corrected land budget | SPEC |
| [T14](T14-distant-lands-floor.md) | **all 5** | Few | Clustered | 1 | Distant landmass viability floor (size, count, resources, settleable); gates the distant-budget floor | SPEC |
| [T15](T15-composition-quality.md) | **all 5** | Random | Clustered | 1 | Composition metrics: debris, runts, variance ratio, spatial spread, separation gaps, biome banding | SPEC |
| [T16](T16-hotseat-config-sweep.md) | Standard | **all 3** | **all 3** | 2-3 | Hotseat sweep: every Count × Spawns combo + min-continent Spread stress; Spread combos ×2 seeds | **PASSING (9/9 runs)** |
| [T17](T17-modern-transition.md) | Standard | Many | — | 1 | Double transition soak: Antiquity → Exploration → **Modern**; integrity + perspective survival | **PASSING** |
| [T18](T18-sp-new-logic-confirm.md) | Std+Small | Random+Few | — | 1 | SP confirms of channel fill, 3-continent floor, dominance cap | **PASSING (3 runs)** |
| [T19](T19-size-sweep-captures.md) | **all 5** | mixed | — | 1 | Size sweep with captures; dominance ≤33% everywhere | **PASSING (2 findings: Tiny loner, Huge region overshoot)** |
| [T20](T20-guardrails.md) | — | — | — | — | Regression guardrails: loner rebalance, hardened suite (+2 checks, 1 latent bug fixed), gate.ps1 + known-marginals baseline | **IN FORCE — gate.ps1 before every deploy** |

Hotseat tests run over the CDP debugger (port 9444) since the tuner port
closes in MP — full procedure and findings in [T08](T08-hotseat-clustered.md).

## Shared procedure (all tests)

Every test follows T01's steps; only **Step 2's configuration values** and
the **scenario-specific assertions** differ:

1. Preflight import check (main menu only)
2. Configure via `GameSetup` — values from the test's Config table
3. Drive UI: NEW GAME → Select → civ → Select → Continue → verify config
   again (flow entry resets it!) → Launch Game
4. Await load → press **Begin Game**
5. Run `scripts/mapgen-test-suite.js` + the test's extra assertions
6. **Capture full-map evidence (MANDATORY, every run):**
   a. Reveal the whole map (`mcp__civ7__reveal_map`), then **screenshot the
      full map** — zoom out / use the strategic view so ALL landmasses are
      in frame (`mcp__civ7__render_map` and/or `mcp__civ7__screenshot`)
   b. **Dump ALL map data**: full per-tile pass (terrain, biome, feature,
      resource, continent/region id, landmass/area id via flood-fill) plus
      the persisted `ContinentsPlusPlusStats` and captured logs
   c. **Review BOTH against each other**: the visual must match the data
      (landmass count, separation gaps, distant lands placement, water
      share) — a run is not PASS until screenshot and data agree
7. `engine.call("exitToMainMenu")`, log the result in the test's Run log

Scenario expectations are checked against the persisted
`ContinentsPlusPlusStats` (read via `Game.getProperty` /
`Configuration.getMap().getValue`), which contains the rolled `config`
(landmassCount, distantCount, landmassGroupCount, ...).

## v3 expected ranges (per map size)

| Size | Random count | Many count | Distant | Grid |
|------|--------------|-----------|---------|------|
| Tiny | 2-4 | 5-6 | 1-2 | 60×38 |
| Small | 2-5 | 5-7 | 1-2 | 74×46 |
| Standard | 3-5 | 5-7 | 1-2 | 84×54 |
| Large | 3-6 | 5-7 | 1-3 | 96×60 |
| Huge | 4-7 | 5-8 | 2-3 | 106×66 |

(Grid values are approximate; assert count ranges from stats, not the grid.)
Few mode is 2-4 on all sizes. Groups: 2-3 when ≥4 continents, else 1-3.
