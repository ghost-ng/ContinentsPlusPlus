# T11 — Single-Player Age Transition (Antiquity → Exploration)

**The release gate.** v3 has never been played past Antiquity turn 1. The
mod's headline mechanic (Distant Lands treasure gameplay) activates at the
Exploration transition, and v2's worst bug class lived exactly there
(region-ID validation, `MapIslandBehavior` resource replacement). v3's
region scheme (0..groupCount, not binary WEST/EAST) has never been through
the transition code.

## Setup

Standard T01 config: Continents++ / Standard / Many / 1 human / 8 players.
Launch via the standard SP loop (tuner or CDP).

## Phase A — reach the transition

Preferred: a forced/accelerated path discovered via console probing
(candidates: `Game.AgeProgressManager` methods, `Autoplay` namespace from
the FireTuner autoplay panel, `Automation` parameters). Fallback: autoplay
N turns until age progress completes. Record which mechanism worked — this
is reusable knowledge for the harness docs.

Probe payloads:

```js
// What's available?
JSON.stringify({
  ageMgr: typeof Game.AgeProgressManager !== 'undefined'
    ? Object.getOwnPropertyNames(Object.getPrototypeOf(Game.AgeProgressManager)) : null,
  autoplay: typeof Autoplay !== 'undefined'
    ? Object.getOwnPropertyNames(Object.getPrototypeOf(Autoplay)) : 'undefined',
  automation: typeof Automation !== 'undefined'
})
```

## Phase B — assertions after the transition

1. `GameInfo.Ages.lookup(Game.age).AgeType === 'AGE_EXPLORATION'`
2. **No content-validation error dialog**; `Database.log` free of new
   mod-related errors; game playable (current player has units/cities)
3. **Treasure resources on Distant Lands**: scan region-0 land for
   resources whose `GameInfo.Resources` row (or class) is
   `RESOURCECLASS_TREASURE` — this is what `MapIslandBehavior`
   (`MapType="Continents++"`, `AGE_EXPLORATION`) exists to produce
4. Region integrity: region IDs still 0..groupCount; humans still region>0;
   `isDistantLands(own spawn) === false`, region-0 tiles distant to all
5. All 8 players still alive with valid positions

## Pass criteria

B1–B5 all true. B3 is the heart of it: zero treasure resources on distant
lands = the mechanic is dead = NO-GO for release.

## Run log

| Date | Result | Notes |
|------|--------|-------|
| 2026-08-16 (attempt 5, resumed save) | **PASS — 0 failures. RELEASE GATE GREEN.** | Antiquity→Exploration transition completed under automation (abbreviated age + autoplay; transition screens auto-resolved; Continue pressed via CDP). Phase B: age=EXPLORATION turn 1; all 8 players alive, positions valid; regions intact [0,1,2,3]; distant lands intact (388 tiles); **126 treasure-class resource tiles on map, 40 ON DISTANT LANDS** — MapIslandBehavior replacement fired, headline mechanic alive; all own-spawns homeland-correct; no DB validation errors. Also: game auto-resumes crashed sessions from autosave; Game.setProperty does NOT survive save/load (use Configuration Script value for map identity). |
| 2026-08-16 attempt 1 | Phase A finding — game CRASH | Probed age APIs: `AgeProgressManager` has cur/max points (0/140), `isAgeOver` is a property. **`updateAgeProgressionPoints(140)` hard-crashed the game** (process + both debug ports gone) — documented as dangerous in harness docs. Switching to `Autoplay` (setTurns/setReturnAsPlayer/setActive) for Phase A. |
