# T03 — Random Continent Count (Standard / Random / Clustered / 1 human)

Verifies the **default** setting combination players get out of the box:
Continent Count = Random (mode 2) on Standard.

## Config (Step 2 values)

```js
setP('Map', '{ContinentsPlusPlus}modules/maps/continents-plus-plus.js');
setP('MapSize', 'MAPSIZE_STANDARD');
setP('ContinentsPPContinentCount', 2);      // ← Random (default)
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
    { name: 'Random mode logged', pass: logHas('Continent Count Mode: 2 (Random') },
    { name: 'landmassCount in 3-5 (Standard random range)', pass: cfg.landmassCount >= 3 && cfg.landmassCount <= 5, detail: cfg.landmassCount },
    { name: 'distantCount in 1-2', pass: cfg.distantCount >= 1 && cfg.distantCount <= 2, detail: cfg.distantCount },
  ];
  return JSON.stringify({ passed: checks.every(c => c.pass), checks, cfg });
})()
```

## Expected

- Shared suite green. With 3 continents, groups may be 1-3; with 4-5,
  groups are 2-3 (cross-homeland check should engage on most rolls).

## Run log

| Date | Result | Notes |
|------|--------|-------|
| 2026-08-16 | **PASS — 0 failures** | 5 continents + 1 distant, 2 groups, players 3/5, min dist 10, water 69.4%, 3 cross-homeland AIs verified. |
| 2026-08-17 | **PASS — 25/25 checks** | First run under the new full-evidence procedure (README step 6). 4 continents + 2 distant == rolled, 3 groups (4/2/2), water 63.1%, distant 16.9% of land, min spawn dist 13, 6 cross-homeland AIs verified, 389 resource tiles (35 on distant). Flood-fill: 6 majors all single-region (404/348/299/259 + 136/94), 0 fused/fragmented. Gaps: same-group 3, cross-region 7 (land-to-land). Screenshot pan series + engine render + full per-tile dump cross-reviewed and consistent — see `artifacts/T03-run-20260817-*`. |
