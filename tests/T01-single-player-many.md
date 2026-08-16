# T01 — Single-Player Smoke Test (Standard / Many / Clustered)

Runnable test spec. Each step has the exact MCP `execute_js` payload and the
expected result. Run top to bottom; stop at the first FAIL and follow the
failure path. Methodology: `research/testing-workflow.md`; MCP/UI mechanics:
FiretunerTerminal `tests/`.

**Preconditions**: Civ VII running at the main menu, mod deployed
(`.\scripts\deploy.ps1`), MCP connected.

---

## Step 1 — Preflight: module import check

```js
globalThis.__t = 'pending';
import('fs://game/ContinentsPlusPlus/modules/maps/continents-plus-plus.js?v=' + Date.now())
  .then(m => { globalThis.__t = 'OK'; })
  .catch(e => { globalThis.__t = 'ERR: ' + e.message; });
'kicked'
```
Then: `globalThis.__t`

**Expect**: `OK`. `ERR: ...does not provide an export named...` = base-game
patch moved exports; fix imports before continuing.

## Step 2 — Configure

```js
(() => {
  const setP = (id, v) => { const p = GameSetup.findGameParameter(id);
    if (p) GameSetup.setGameParameterValue(p.ID, v); return !!p; };
  setP('Map', '{ContinentsPlusPlus}modules/maps/continents-plus-plus.js');
  setP('MapSize', 'MAPSIZE_STANDARD');
  setP('ContinentsPPContinentCount', 1);      // Many
  setP('ContinentsPPPlayerDistribution', 0);  // Clustered (tests 1-human override)
  return JSON.stringify({
    map: GameSetup.findGameParameter('Map')?.value?.value,
    size: GameSetup.findGameParameter('MapSize')?.value?.value,
    count: Configuration.getMap().getValue('ContinentsPPContinentCount'),
    players: Configuration.getGame().getParticipatingPlayerCount()
  });
})()
```

**Expect**: map = our script path, size = `MAPSIZE_STANDARD`, count = `1`,
players = `8`.

Note: `ContinentsPP*` parameters only exist while the create-game flow is
open with our map selected; if `count` is null, open the flow (Step 3) and
re-run.

## Step 3 — Drive the UI to Launch

```js
(() => {
  const press = (el) => { const mk = (s) => new CustomEvent('engine-input',
    {bubbles: true, cancelable: true, detail: {name: 'mousebutton-left',
     status: s, x: -1, y: -1, isTouch: false, isMouse: true}});
    el.dispatchEvent(mk(InputActionStatuses.START));
    el.dispatchEvent(mk(InputActionStatuses.FINISH)); };
  const heroes = () => Array.from(document.querySelectorAll('div.hero-button-2'))
    .map(el => ({el, t: (el.textContent||'').trim()}));
  const log = [];
  // From main menu: open create-game flow if needed
  if (!document.querySelector('create-game-sp')) {
    const ng = Array.from(document.querySelectorAll('fxs-text-button'))
      .find(el => (el.getAttribute('caption')||'').toUpperCase() === 'NEW GAME');
    if (ng) { press(ng); log.push('NEW GAME'); }
  }
  // Step through: pick a civ if on civ-select, then hero buttons to Launch
  for (let i = 0; i < 10; i++) {
    const bs = heroes();
    if (bs.find(b => b.t === 'Launch Game')) { log.push('AT LAUNCH'); break; }
    if (!bs.length) {
      const civ = Array.from(document.querySelectorAll('[data-activatable="true"]'))
        .find(el => (el.textContent||'').trim() === 'Egypt');
      if (civ) { press(civ); log.push('civ: Egypt'); }
      continue;
    }
    const next = bs.find(b => ['Select','Continue','Next'].includes(b.t)) ?? bs[0];
    press(next.el); log.push(next.t);
  }
  return JSON.stringify({log, buttons: heroes().map(b => b.t)});
})()
```

**Expect**: log ends `AT LAUNCH`, buttons = `["Launch Game"]`.
**Re-run Step 2 now — MANDATORY**: entering the create-game flow resets all
setup parameters to defaults (verified live: map reverted to
continents-voronoi/Small/6 players). Then press Launch:

```js
(() => {
  const btn = Array.from(document.querySelectorAll('div.hero-button-2'))
    .find(el => (el.textContent||'').trim() === 'Launch Game');
  if (!btn) return 'not found';
  const mk = (s) => new CustomEvent('engine-input', {bubbles: true, cancelable: true,
    detail: {name: 'mousebutton-left', status: s, x: -1, y: -1, isTouch: false, isMouse: true}});
  btn.dispatchEvent(mk(InputActionStatuses.START));
  btn.dispatchEvent(mk(InputActionStatuses.FINISH));
  return 'Launch pressed';
})()
```

## Step 3b — Begin Game (after loading completes)

Loading ends at a "Begin Game" screen; the game is not interactive (and turn 1
hasn't started) until it's pressed:

```js
(() => {
  const begin = Array.from(document.querySelectorAll('div.hero-button-2, [data-activatable="true"]'))
    .find(el => (el.textContent||'').trim() === 'Begin Game');
  if (!begin) return 'not found (still loading, or already in game)';
  const mk = (s) => new CustomEvent('engine-input', {bubbles: true, cancelable: true,
    detail: {name: 'mousebutton-left', status: s, x: -1, y: -1, isTouch: false, isMouse: true}});
  begin.dispatchEvent(mk(InputActionStatuses.START));
  begin.dispatchEvent(mk(InputActionStatuses.FINISH));
  return 'Begin Game pressed';
})()
```

Note: the suite's map/region checks work even BEFORE Begin Game is pressed
(`UI.isInGame()` is already true at that screen), but pressing it first gives
the fully-started state.

## Step 7 — Exit to main menu (loop / teardown)

```js
engine.call("exitToMainMenu")
```

Works from anywhere in-game; lands on a clean MAIN-MENU (no dialogs).

## Step 4 — Await outcome (poll)

```js
JSON.stringify({
  inGame: UI.isInGame(),
  dialog: (document.querySelector('screen-dialog-box')?.textContent || '').trim().slice(0, 60),
  screens: Array.from(document.querySelectorAll('.fullscreen > *')).map(e => e.tagName).slice(0, 4)
})
```

**Expect (pass path)**: `inGame: true` → go to Step 5.
**Fail path**: dialog contains `Map generation script had a fatal error` →
go to Step 6.

## Step 5 — Assert (pass path)

Run the whole of `scripts/mapgen-test-suite.js` as one payload.
**Expect**: `passed: true`; keep `stats` as the regression baseline.

## Step 6 — Failure evaluation (fail path)

1. Read the tail of
   `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Logs\Scripting.log`
   — the last `[ContinentsPP]` line before `Destroying Context - MapGeneration`
   is where generation died.
2. Dismiss the dialog:
```js
(() => {
  const ok = Array.from(document.querySelectorAll('[data-activatable="true"], div.hero-button-2, fxs-button'))
    .find(el => (el.textContent||'').trim() === 'OK');
  if (!ok) return 'no OK';
  const mk = (s) => new CustomEvent('engine-input', {bubbles: true, cancelable: true,
    detail: {name: 'mousebutton-left', status: s, x: -1, y: -1, isTouch: false, isMouse: true}});
  ok.dispatchEvent(mk(InputActionStatuses.START));
  ok.dispatchEvent(mk(InputActionStatuses.FINISH));
  return 'OK pressed';
})()
```
   Verify dismissal in a SEPARATE call (the close animates; checking in the
   same payload reads stale DOM):
```js
JSON.stringify({dialogGone: !document.querySelector('screen-dialog-box')})
```
3. Fix → `.\scripts\deploy.ps1` → rerun from Step 1 (map scripts need no
   game restart; config was reset by the failure).

---

## Run log

| Date | Step reached | Result | Notes |
|------|-------------|--------|-------|
| 2026-08-16 (v3 run 5, distribution tuning) | Step 5 | **PASS** | Three tunings validated: land budget 34-40 → water 66.2% (was 67-72.6% band); size-scaled distant budget → distant share 19.9%; ocean separation between ALL landmasses → rolled 5+1 = 6 physical landmasses (flood-fill verified, ~200-240 tiles each). KEY FINDING: `stampContinents` names nearby landmasses+islands as one continent (6 physical → 4 stamped) — cosmetic engine behavior, not fusion; gameplay uses region IDs. Assert physical counts via connected-component flood fill, not stamped IDs. |
| 2026-08-16 (v3 run 4, cross-homeland) | Step 5 | **PASS — 0 failures** | Mod updated to prefer 2+ landmass groups (Random mode, ≥4 continents). Rolled 7 continents in 2 groups + 1 distant. Human in region 2 (with 2 AI); **5 AIs in region 1 = a different homeland than the human's**. Cross-verified per-player perspectives: all 5 foreign AIs see the human's tile as Distant Lands AND the human sees each of theirs as Distant Lands (symmetric). 50 resource tiles on dedicated distant lands (region 0). Water 70.7%, min spawn distance OK, no loners (5/3 split). **Conclusion: per-player AI homelands are natively feasible via landmass groups.** |
| 2026-08-16 (v3 run 3, expanded suite) | Step 5 | **PASS — all 23 substantive checks** | Suite expanded per feedback: homelands + AI placement (every player placed, none on distant lands, no loners per group, spawns min 13 tiles apart) + resources (346 tiles, 25 types, 35 on distant lands) + terrain (4 continents, 137 mountains, 1403 coast tiles). Rolled 1 landmass group this seed (regions [0,1], all 8 players region 1). One suite bug found & fixed: `GameplayMap.isCoastalWater` doesn't exist — count `TERRAIN_COAST` rows instead; corrected check verified green against the same live map. Full cycle automated including Begin Game and exitToMainMenu. |
| 2026-08-16 (v3 run 2) | Step 5 | **PASS — 14/14 checks** | v3 (new Voronoi API): grid 84×54, water 67.0%, 1495 land tiles (399 distant/island), regions [0,1,2,3], human region 1 with companions, all 8 players isDistantLands-correct. Persistence via `Game.setProperty` (new map-gen context lacks `Configuration.editMap`). Full loop was automated: configure → Launch → **Begin Game press** (required after load) → suite → `engine.call("exitToMainMenu")`. |
| 2026-08-16 (v3 run 1) | Step 5 | 9/14 — gameplay all green | First v3 map generated (2.9s, water 69.8%, regions [0,1,2,3], all spawns correct). 5 failures = one root cause: `Configuration.editMap is not a function` in new map-gen context → version/logs/stats not persisted. Fixed with multi-channel `persistMapValue()` helper. |
| 2026-08-16 | Step 4 (fail path) | FAIL — known blocker | Steps 1–3 all behaved as specced: preflight OK, config verified 4/4, UI stepper reached Launch in one payload (`NEW GAME → Select → civ: Egypt → Select → Continue → AT LAUNCH`). Mid-run catch: flow entry reset params (spec's re-run of Step 2 recovered it). Launch → fatal-error dialog; Scripting.log died at `Using UnifiedContinentsBase for 7 continents` = the pending Voronoi API migration (`initInternal` signature change, see research/testing-workflow.md postmortem). Dialog dismissed via Step 6; clean MAIN-MENU end state. |
