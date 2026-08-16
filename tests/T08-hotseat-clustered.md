# T08 — Hotseat, Clustered (Standard / Many / Clustered / 2 humans)

First real multiplayer distribution test: with 2 humans and Clustered, both
humans must share ONE homeland group (landmassGroupCount = 1).

## Status: PASSING — fully automated via CDP port 9444 (2026-08-16)

The game closes the FireTuner port (4318) in MP contexts (reopens on exit
to main menu), but the Cohtml CDP debugger on **port 9444** stays up
everywhere, lobby included. Full automated procedure (all steps verified):

1. Entry + config + Host Lobby (below) — works over tuner OR CDP
2. Lobby via CDP: `Configuration.editPlayer(1).setSlotStatus(SlotStatus.SS_TAKEN)`
   (direct property assignment is ignored — use the setter), then press
   `screen-mp-lobby fxs-activatable.ready-button`
3. After load: press **"Start Turn"** on the hotseat turn-transition screen
   (`.fxs-button` div, next to Save Game)
4. Run verification payloads over CDP (`Runtime.evaluate`)

Full flow reference: FiretunerTerminal `test-harness/ui-automation.md`.

## Verified entry procedure (works up to the lobby)

All from the main menu, via MCP:

```js
// 1. MULTIPLAYER (fxs-text-button — engine-input press)
// 2. Hotseat button on the landing screen (old framework — action-activate works):
document.querySelector('.mp-landing-new__hotseat-button')
  .dispatchEvent(new CustomEvent('action-activate', {bubbles: true, cancelable: true}));
// → SCREEN-MP-CREATE-GAME opens

// 3. Configure — GameSetup works in this MP context too (verified):
//    Map / MapSize / ContinentsPPContinentCount / ContinentsPPPlayerDistribution
//    (the MP flow uses the SupportsSinglePlayer="0" Map parameter; values verified
//    to land in Configuration.getMap())

// 4. Host Lobby (fxs-hero-button caption LOC_UI_MP_HOST_LOBBY — action-activate):
Array.from(document.querySelectorAll('fxs-hero-button'))
  .find(el => el.getAttribute('caption') === 'LOC_UI_MP_HOST_LOBBY')
  .dispatchEvent(new CustomEvent('action-activate', {bubbles: true, cancelable: true}));
// → lobby opens; DEBUG PORT GOES SILENT HERE
```

## Manual completion (until the blocker is resolved)

1. In the lobby: set a second slot to a local human player, fill the rest
   with AI, launch.
2. **Open question A**: does the tuner revive once the hotseat GAME is
   loaded (vs. just the lobby)? Try any MCP command at player 1's turn.
3. If yes → run the verification below. If no → hotseat verification must
   use Scripting.log only (the mod's generation report prints everything
   needed: per-player regions + CONFIRMED/CRITICAL lines).

## Verification (from logs even if the console stays dead)

`Scripting.log` generation report lines give the pass/fail directly:

- `Player Distribution Mode: 0 (Clustered)` and NO override line (2 humans!)
- Config line shows `groups=1`
- Every `Player N (HUMAN)` line shows the SAME `region=` value
- `CONFIRMED: All human players spawn on player landmasses`

If the console works in-game, additionally run the shared suite +:

```js
// Both humans same region; isDistantLands symmetric within the group
(() => {
  const hs = Players.getAliveMajorIds().filter(id => Players.isHuman(id)).map(id => {
    const p = Players.get(id);
    const loc = p.Cities?.getCapital?.()?.location ?? p.Units?.getUnits?.()[0]?.location;
    return {id, region: GameplayMap.getLandmassRegionId(loc.x, loc.y), loc};
  });
  const sameGroup = new Set(hs.map(h => h.region)).size === 1;
  const mutualHomeland = hs.length === 2
    && !Players.get(hs[0].id).isDistantLands(hs[1].loc)
    && !Players.get(hs[1].id).isDistantLands(hs[0].loc);
  return JSON.stringify({humans: hs, sameGroup, mutualHomeland,
    passed: sameGroup && mutualHomeland});
})()
```

## Run log

| Date | Result | Notes |
|------|--------|-------|
| 2026-08-16 | **PASS — 0 failures (UNBLOCKED via CDP 9444)** | Full cycle automated end-to-end: entry → GameSetup config (survived into lobby this time) → `Configuration.editPlayer(1).setSlotStatus(SlotStatus.SS_TAKEN)` → Ready button → generation → Start Turn → in-game suite via CDP. Clustered honored (no override, groups=1), both humans region 1, mutual homeland verified both ways, water 65.3%, 41 distant-lands resources, all 8 players correct. Note: Clustered is partly guaranteed by the engine's own `bHumansTogether` behavior. |
| 2026-08-16 | BLOCKED | Entry automated to lobby (map/size/options verified applied); tuner unresponsive from lobby onward. Needs manual lobby completion + open question A answered. |
