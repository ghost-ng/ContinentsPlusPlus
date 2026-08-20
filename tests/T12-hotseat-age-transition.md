# T12 — Hotseat Age Transition (2 humans, Spread)

Same release gate as [T11](T11-sp-age-transition.md) but multiplayer: the
transition must complete with 2 humans in DIFFERENT homeland groups (the
Spread fix's post-swap positions), and each human's distant-lands
perspective must survive into Exploration.

## Setup

T09 config: Continents++ / Standard / Many / Spread / 2 humans (hotseat via
CDP 9444: entry → config → Host Lobby → `setSlotStatus(SS_TAKEN)` → Ready →
Start Turn).

## Phase A — reach the transition

Same mechanism as discovered in T11. Hotseat wrinkle: the transition
inserts per-player civ-select screens — enumerate and drive them via CDP
(discover buttons live; record selectors in the run log for the harness
docs).

## Phase B — assertions after the transition

All of T11's B1–B5, plus:

6. Humans still in different landmass groups (their capitals' regions
   differ) — the transition must not have re-homed anyone
7. Cross-perspective still holds: each human sees the other's capital as
   Distant Lands, own as homeland
8. Treasure resources reachable from BOTH humans' perspectives (region-0
   land is distant to everyone, so this follows from B3 + region integrity
   — verify explicitly anyway)

## Pass criteria

T11 criteria + 6–8. Any human losing their homeland identity through the
transition = NO-GO.

## Run log

| Date | Result | Notes |
|------|--------|-------|
| 2026-08-17 | **PASS — 10/10 checks. MP release gate green.** | Fully automated through the MCP's new tuner→CDP fallback (no manual CDP driving needed). Baseline: Spread honored, humans regions 1/2, mutually distant. Transition via abbreviated age + async `Autoplay.setAsAI(0/1)` WITHOUT `setActive` (setActive blocks on human turns in hotseat and reverts conversions when turned off — recipe details in artifact). Post-transition: age=EXPLORATION, regions [0,1,2] intact, humans STILL regions 1/2 with mutual distant-lands perspective, 132 treasure tiles (24 on distant, distant to BOTH humans), 8/8 alive. Full-map evidence (render + 3 pans + flood-fill + gap matrix) cross-reviewed consistent. Observation for T15: the rolled 6th continent eroded to 17 tiles (variance 49 + erosion 9). See `artifacts/T12-run-20260817-*`. |
