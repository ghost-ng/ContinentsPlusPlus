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
6. `engine.call("exitToMainMenu")`, log the result in the test's Run log

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
