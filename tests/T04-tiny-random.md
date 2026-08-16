# T04 — Tiny Map Stress (Tiny / Random / Clustered / 1 human)

Verifies generation on the smallest map: count floors, dense placement,
distant landmasses still fitting.

## Config (Step 2 values)

```js
setP('Map', '{ContinentsPlusPlus}modules/maps/continents-plus-plus.js');
setP('MapSize', 'MAPSIZE_TINY');            // ← player count auto-adjusts down
setP('ContinentsPPContinentCount', 2);
setP('ContinentsPPPlayerDistribution', 0);
```

After setting, note the auto player count:
`Configuration.getGame().getParticipatingPlayerCount()` (Tiny default is 4).

## Scenario assertions

```js
(() => {
  const readPersisted = (key) => {
    try { const v = Configuration.getMap().getValue(key); if (v != null) return v; } catch (e) {}
    try { const v = Game.getProperty(key); if (v != null) return v; } catch (e) {}
    return null;
  };
  const s = JSON.parse(readPersisted('ContinentsPlusPlusStats') || 'null');
  const cfg = s?.config ?? {};
  const checks = [
    { name: 'landmassCount in 2-4 (Tiny random range)', pass: cfg.landmassCount >= 2 && cfg.landmassCount <= 4, detail: cfg.landmassCount },
    { name: 'distantCount in 1-2', pass: cfg.distantCount >= 1 && cfg.distantCount <= 2, detail: cfg.distantCount },
    { name: 'water still Earth-like', pass: s.waterPct >= 50 && s.waterPct <= 78, detail: s.waterPct },
  ];
  return JSON.stringify({ passed: checks.every(c => c.pass), checks, cfg });
})()
```

## Expected / threshold adjustments

- Shared suite mostly green, with Tiny-specific tolerances:
  - **Resources ≥ 20** may be tight on ~2.3k tiles — if it fails marginally,
    record the count; ≥ 10 is acceptable for Tiny (note it, don't silently
    lower the shared threshold).
  - **Min spawn distance ≥ 6** is the check most likely to be stressed with
    4 players on 2-4 small continents.
- Cross-homeland check may report single-group (2-3 continents → 1-3 groups).

## Run log

| Date | Result | Notes |
|------|--------|-------|
| 2026-08-16 (tuned) | **PASS** | Distant-budget scaling validated: distant share 19.5% (was 32.5%), water 67.7% (was 72.6%). 4 continents + 1 distant, 4 players all homeland-correct. |
| 2026-08-16 | **PASS — 0 failures** | Tiny 60×38, 4 players auto. 4 continents + 2 distant, 2 groups, players 2/2, min dist 13, water 72.6%, 169 resource tiles (Tiny threshold not needed), 2 cross-homeland AIs verified. |
