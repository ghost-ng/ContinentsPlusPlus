# T05 — Huge Map, Max Continents (Huge / Many / Clustered / 1 human)

Verifies the top end: 5-8 continents + 2-3 distant landmasses on the largest
grid, and that generation time stays sane.

## Config (Step 2 values)

```js
setP('Map', '{ContinentsPlusPlus}modules/maps/continents-plus-plus.js');
setP('MapSize', 'MAPSIZE_HUGE');            // ← player count auto-adjusts up
setP('ContinentsPPContinentCount', 1);      // ← Many
setP('ContinentsPPPlayerDistribution', 0);
```

## Scenario assertions

```js
(() => {
  const readPersisted = (key) => {
    try { const v = Configuration.getMap().getValue(key); if (v != null) return v; } catch (e) {}
    try { const v = Game.getProperty(key); if (v != null) return v; } catch (e) {}
    return null;
  };
  const s = JSON.parse(readPersisted('ContinentsPlusPlusStats') || 'null');
  const logs = JSON.parse(readPersisted('ContinentsPlusPlusLogs') || '[]');
  const logHas = (t) => logs.some(l => l.includes(t));
  const cfg = s?.config ?? {};
  const checks = [
    { name: 'Many mode logged', pass: logHas('Continent Count Mode: 1 (Many') },
    { name: 'landmassCount in 5-8 (Huge many range)', pass: cfg.landmassCount >= 5 && cfg.landmassCount <= 8, detail: cfg.landmassCount },
    { name: 'distantCount in 2-3', pass: cfg.distantCount >= 2 && cfg.distantCount <= 3, detail: cfg.distantCount },
    { name: '2+ groups (>=4 continents forces it)', pass: cfg.landmassGroupCount >= 2, detail: cfg.landmassGroupCount },
  ];
  return JSON.stringify({ passed: checks.every(c => c.pass), checks, cfg });
})()
```

## Expected

- Shared suite green including the cross-homeland block (2+ groups
  guaranteed here).
- **Generation time**: check `Scripting.log` for
  `Scope end: Continents++ Generation, N ms` — flag if > 15000 ms
  (Standard runs ~3000 ms).
- Full-map scans in the suite take noticeably longer on ~7k tiles — still
  fine in one payload.

## Run log

| Date | Result | Notes |
|------|--------|-------|
| 2026-08-16 (tuned) | **PASS** | Land-budget + ocean-separation validated: water 62.0% (target center), distant 22.2%, rolled 7+2 = 9 physical landmasses (flood-fill verified, sizes 404-181), gen 4341 ms. |
| 2026-08-16 | **PASS — 0 failures** | Huge 106×66, 10 players auto. 5 continents + 2 distant, 2 groups, players 4/6, min dist 12, water 61.5%, generation 4256 ms (budget 15000). 6 cross-homeland AIs verified. |
