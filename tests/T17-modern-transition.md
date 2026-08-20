# T17 — Double Age Transition (Antiquity → Exploration → Modern)

The last untested engine boundary: T11/T12 gate only the first transition.
This soak runs one game through BOTH transitions under automation and
verifies map/region/perspective integrity in AGE_MODERN.

## Setup

SP Standard / Many / 1 human / `AgeLength: AGE_LENGTH_ABBREVIATED` (120
progression points per age at 8 players). After launch: `Autoplay.setAsAI(0)`
(async, no `setActive`) → all-AI free-run (~1 turn/5s). Total soak ≈ 35 min.

## Assertions (Phase B, in Modern)

1. Age is AGE_MODERN, game playable, no fatal errors
2. Region IDs intact (0..groupCount); distant (region-0) land intact
3. All 8 players alive, all with cities
4. Player 0's perspective survived BOTH transitions: spawn region
   unchanged, own capital homeland, region-0 sampled distant
5. Note: treasure-class resources are expected to be ZERO in Modern —
   `MapIslandBehavior` is `AGE_EXPLORATION`-scoped and the Modern
   transition re-replaces resources; 0 is correct, not a failure

## Run log

| Date | Result | Notes |
|------|--------|-------|
| 2026-08-18 | **PASS — 8/8 checks. Both transitions green.** | Rolled 7+2 (variance capped 30 by the new rule), 2 groups. Antiquity ended turn ~120, Exploration ended turn ~120, landed AGE_MODERN. At Modern turn 12: 8/8 players alive with 5-12 cities each, regions [0,1,2] intact, distant 358 tiles, water 65.6%, player 0 still region 1 / capital homeland / region-0 distant (10 sampled). Treasure tiles 0 as expected (Exploration-scoped mechanic). Mid-soak the same game also served the inland-channel analysis (93 channel tiles found → fill pass built) and the Delphos stamped-name investigation. Render: `artifacts/T17-soak-exploration-render.png` (Exploration-era). |
