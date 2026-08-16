# T10 — Hotseat, Spread, 3 humans (Standard / Many / Spread / 3 humans)

Stresses the Spread group-count formula with 3 humans:
`landmassGroupCount = min(max(2, 3), landmassCount, 4) = 3` (Many rolls 5-7
continents, so the landmassCount bound never binds here).

Same entry procedure and blocker as [T08](T08-hotseat-clustered.md) — set
distribution to **1** and add TWO extra human slots in the lobby.

## Expected

- Config line: `groups=3`
- The three HUMAN report lines show three DIFFERENT `region=` values
  (1, 2, 3 in some order)
- Every pairwise human `isDistantLands` check is true both directions
  (3 pairs × 2 directions)
- AI players distribute across all 3 groups with no loners

## Console verification

```js
(() => {
  const hs = Players.getAliveMajorIds().filter(id => Players.isHuman(id)).map(id => {
    const p = Players.get(id);
    const loc = p.Cities?.getCapital?.()?.location ?? p.Units?.getUnits?.()[0]?.location;
    return {id, region: GameplayMap.getLandmassRegionId(loc.x, loc.y), loc};
  });
  const allDifferent = new Set(hs.map(h => h.region)).size === hs.length;
  const pairs = [];
  for (let i = 0; i < hs.length; i++) for (let j = 0; j < hs.length; j++) {
    if (i === j) continue;
    pairs.push({from: hs[i].id, to: hs[j].id,
      distant: Players.get(hs[i].id).isDistantLands(hs[j].loc)});
  }
  return JSON.stringify({humans: hs, allDifferent,
    allPairsDistant: pairs.every(p => p.distant), pairs,
    passed: allDifferent && pairs.every(p => p.distant)});
})()
```

## Run log

| Date | Result | Notes |
|------|--------|-------|
| 2026-08-16 | **PASS — 0 failures** | 3 humans → groups=3 → regions [2,3,1] all different; all 6 pairwise isDistantLands directions true; own spawns homeland; 8 players split 3/3/2, no loners. Fully automated including 2× setSlotStatus and Ready. |
