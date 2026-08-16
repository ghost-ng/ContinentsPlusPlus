# T06 — Spread Override in Single Player (Standard / Random / Spread / 1 human)

Verifies the **Multiplayer Human Spawns = Spread** option in single player:
it must force-override to Random (mode 2), exactly like Clustered does
(T01 covers the Clustered override).

## Config (Step 2 values)

```js
setP('Map', '{ContinentsPlusPlus}modules/maps/continents-plus-plus.js');
setP('MapSize', 'MAPSIZE_STANDARD');
setP('ContinentsPPContinentCount', 2);
setP('ContinentsPPPlayerDistribution', 1);  // ← Spread
```

## Scenario assertions

```js
(() => {
  const readPersisted = (key) => {
    try { const v = Configuration.getMap().getValue(key); if (v != null) return v; } catch (e) {}
    try { const v = Game.getProperty(key); if (v != null) return v; } catch (e) {}
    return null;
  };
  const logs = JSON.parse(readPersisted('ContinentsPlusPlusLogs') || '[]');
  const logHas = (t) => logs.some(l => l.includes(t));
  const checks = [
    { name: 'Spread selected then overridden',
      pass: logHas('Player Distribution Mode: 1 (Spread) → OVERRIDE to 2 (Random)') },
    { name: 'override reason logged',
      pass: logHas('Single human player — Clustered/Spread only apply to multiplayer') },
  ];
  return JSON.stringify({ passed: checks.every(c => c.pass), checks });
})()
```

## Expected

- Shared suite green; behavior identical to mode 2 (Random) — the setting
  must have NO effect on the generated map beyond the log lines.

## Run log

| Date | Result | Notes |
|------|--------|-------|
| 2026-08-16 | **PASS — 0 failures** | Log shows exactly: Player Distribution Mode: 1 (Spread) → OVERRIDE to 2 (Random) + reason line. Map behaved as Random (regions 1:3/2:5, no loners, all homeland-correct). |
