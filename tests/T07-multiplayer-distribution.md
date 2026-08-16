# T07 — Multiplayer Distribution Modes (Standard / Many / 2+ humans) — MANUAL

Verifies the real (non-overridden) behavior of **Clustered** and **Spread**
with 2+ human players. Cannot be fully automated from the SP create-game
flow — needs a hotseat or LAN lobby with a second human slot.

## v3 semantics under test

| Mode | landmassGroupCount | Expected placement |
|------|--------------------|--------------------|
| Clustered (0) | 1 | All players share one homeland group; only region-0 landmasses are Distant Lands for everyone |
| Spread (1) | min(max(2, humans), landmassCount, 4) | Humans should end up in different groups — each human's homeland is distant to the other |
| Random (2) | 1-3 (2-3 when ≥4 continents) | No human-specific handling |

## Procedure (manual setup, automated verification)

1. Create a hotseat game: Continents++, Standard, Many, 2 human slots,
   fill rest with AI. Set `ContinentsPPPlayerDistribution` to the mode under
   test (the (C++) option in Advanced Settings, or via `GameSetup` if the
   shell flow allows before entering the lobby).
2. Launch; at the first player's turn, run the shared suite via MCP.
3. Mode-specific verification payloads:

```js
// Both modes: which regions did the HUMANS land in?
(() => {
  const humans = Players.getAliveMajorIds().filter(id => Players.isHuman(id));
  const out = humans.map(id => {
    const p = Players.get(id);
    const loc = p.Cities?.getCapital?.()?.location ?? p.Units?.getUnits?.()[0]?.location;
    return { id, region: loc ? GameplayMap.getLandmassRegionId(loc.x, loc.y) : null, loc };
  });
  const regions = new Set(out.map(h => h.region));
  return JSON.stringify({ humans: out,
    clusteredExpectation: regions.size === 1,   // all humans same group
    spreadExpectation: regions.size === out.length,  // all humans different groups
  });
})()
```

4. For Spread additionally cross-verify with `isDistantLands` (see
   T01 run 4 / suite section 5b): each human should see the other human's
   spawn as Distant Lands.

## Known open questions (record findings here)

- Does the Spread group-count heuristic hold when humanCount > 4? (capped
  at 4 groups)
- Clustered with many AIs: does proportional allocation keep all humans in
  the single group with acceptable spacing?

## Run log

| Date | Mode | Humans | Result | Notes |
|------|------|--------|--------|-------|
