# T02 — Few Continents (Standard / Few / Clustered / 1 human)

Verifies the **Few (2-4)** continent count option: fewer, larger continents,
with dedicated Distant Lands still generated.

## Config (Step 2 values)

```js
setP('Map', '{ContinentsPlusPlus}modules/maps/continents-plus-plus.js');
setP('MapSize', 'MAPSIZE_STANDARD');
setP('ContinentsPPContinentCount', 0);      // ← Few
setP('ContinentsPPPlayerDistribution', 0);
```

## Scenario assertions (run after the shared suite)

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
    { name: 'Few mode logged', pass: logHas('Continent Count Mode: 0 (Few') },
    { name: 'landmassCount in 2-4', pass: cfg.landmassCount >= 2 && cfg.landmassCount <= 4, detail: cfg.landmassCount },
    { name: 'distantCount in 1-2', pass: cfg.distantCount >= 1 && cfg.distantCount <= 2, detail: cfg.distantCount },
    { name: 'groups <= landmassCount', pass: cfg.landmassGroupCount <= cfg.landmassCount, detail: cfg.landmassGroupCount },
  ];
  return JSON.stringify({ passed: checks.every(c => c.pass), checks, cfg });
})()
```

## Expected

- Shared suite: all green (with 2-3 continents a single group is likely —
  the cross-homeland check reports "single-group roll" informationally).
- Distant lands must still exist (dedicated landmasses guarantee it in Few
  mode — the old v2 risk of "no DL when few continents" is gone by design).
- 8 players on 2-4 continents stresses per-continent density; watch min
  spawn distance.

## Run log

| Date | Result | Notes |
|------|--------|-------|
| 2026-08-16 | **PASS — 0 failures** | 2 continents + 1 distant, 2 groups (each continent its own group!), players 5/3, min spawn dist 11, water 62.4%, 5 cross-homeland AIs verified. |
