# T09 — Hotseat, Spread (Standard / Many / Spread / 2 humans)

The headline multiplayer test: with 2 humans and **Spread**, the humans must
land in DIFFERENT homeland groups — each human's homeland is the other's
Distant Lands. This is the per-player homeland goal, human vs human.

Same entry procedure and blocker as [T08](T08-hotseat-clustered.md) — set
`ContinentsPPPlayerDistribution` to **1** in step 3.

## Expected

- No override line in Scripting.log (2 humans → Spread is honored)
- Config line shows `groups=2` (min(max(2,2), landmassCount, 4))
- The two `Player N (HUMAN)` report lines show DIFFERENT `region=` values
- `CONFIRMED: All human players spawn on player landmasses`

## Console verification (if tuner works in-game)

```js
(() => {
  const hs = Players.getAliveMajorIds().filter(id => Players.isHuman(id)).map(id => {
    const p = Players.get(id);
    const loc = p.Cities?.getCapital?.()?.location ?? p.Units?.getUnits?.()[0]?.location;
    return {id, region: GameplayMap.getLandmassRegionId(loc.x, loc.y), loc};
  });
  const differentGroups = new Set(hs.map(h => h.region)).size === hs.length;
  const mutuallyDistant = hs.length === 2
    && Players.get(hs[0].id).isDistantLands(hs[1].loc)
    && Players.get(hs[1].id).isDistantLands(hs[0].loc);
  return JSON.stringify({humans: hs, differentGroups, mutuallyDistant,
    passed: differentGroups && mutuallyDistant});
})()
```

Also rerun the standard areas (same as SP): AI placements (no loners, none
on distant lands, spacing), resources (density/variety/on-distant-lands),
terrain sanity — the shared suite payload works unchanged if the console
is alive.

**Spawn quality after the spread swap** — the relocated human inherits a
plot originally scored for an AI. The swap picks the highest-fertility
donor; assert the result isn't a dud:

```js
// NOTE: StartPositioner is MAP-GEN CONTEXT ONLY (ReferenceError in-game).
// In-game proxy: workable land (land, non-impassable) in radius 2, vs the
// mean across all players; the swap's own fertility comparison is in the
// persisted logs ("Spread: swapping ... fertility N ... best of M donor(s)").
(() => {
  const workable = (cx, cy) => {
    let n = 0;
    for (const idx of GameplayMap.getPlotIndicesInRadius(cx, cy, 2)) {
      const l = GameplayMap.getLocationFromIndex(idx);
      if (GameplayMap.getContinentType(l.x, l.y) !== -1 && !GameplayMap.isImpassable(l.x, l.y)) n++;
    }
    return n;
  };
  const all = Players.getAliveMajorIds().map(id => {
    const p = Players.get(id);
    const loc = p.Cities?.getCapital?.()?.location ?? p.Units?.getUnits?.()[0]?.location;
    return {id, isHuman: Players.isHuman(id), w: workable(loc.x, loc.y)};
  });
  const mean = all.reduce((s2, p) => s2 + p.w, 0) / all.length;
  const humans = all.filter(p => p.isHuman);
  return JSON.stringify({mean, humans, passed: humans.every(h => h.w >= mean * 0.5)});
})()
```

## Run log

| Date | Result | Notes |
|------|--------|-------|
| 2026-08-16 run 3 (fertility-aware swap) | **PASS — 0 failures + spawn quality PASS** | Swap now picks best-fertility donor: `best of 4 donor(s)`, human traded fertility 3 → 4. In-game: humans regions [2,1] mutually distant; spawn-quality proxy: swapped human 17 workable tiles vs 14.6 mean (best tier). Discovered: StartPositioner is map-gen-context only — in-game payload uses radius-2 workable-land proxy. |
| 2026-08-16 run 2 | **PASS — 0 failures** | Post-assignment spread swap worked: `Spread: swapping human 1 (region 2) with AI 2 (region 1)` → humans in regions [2,1]. In-game CDP verification: humans in different groups, mutually distant both directions, own spawns homeland, all 8 players valid (4/4 group split), swapped AI homeland-correct. |
| 2026-08-16 run 1 | **FAIL — real bug found** | Spread honored (groups=2, no override) but BOTH humans landed region 1. Root cause: engine `bHumansTogether` (assign-starting-plots.js): when the age has `HumanPlayersPrimaryHemisphere` (Antiquity), ALL humans are forced onto the largest landmass together. Fix: post-assignment human-spread swap added to map script (swap human with AI from unused group via StartPositioner). |
