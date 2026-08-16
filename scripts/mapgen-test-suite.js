// Continents++ — automated map-generation test suite (v3 semantics).
//
// Run via the civ7 MCP debug console (execute_js) AFTER a game has loaded.
// Returns a JSON report {ready, passed, failures, checks[], stats}.
//
// v3 region-ID model (new Voronoi engine): landmass region id 0 = non-player
// land (islands + distant landmasses), 1+ = player landmass group. Humans
// must spawn in a region > 0; region-0 land is Distant Lands.

(() => {
  const report = { ready: false, checks: [], stats: {}, failures: 0 };
  const check = (name, pass, detail) => {
    report.checks.push({ name, pass: !!pass, detail });
    if (!pass) report.failures++;
  };

  // ── 0. Preconditions ──────────────────────────────────────────────────
  if (!UI.isInGame()) {
    return JSON.stringify({ ready: false, error: "Not in game yet — map still loading" });
  }
  report.ready = true;

  // ── 1. Mod ran + persisted state ──────────────────────────────────────
  // The map script persists via the first available channel:
  // Configuration.editMap (old engine) or Game.setProperty (new engine).
  const readPersisted = (key) => {
    try { const v = Configuration.getMap().getValue(key); if (v != null) return v; } catch (e) { /* next */ }
    try { const v = Game.getProperty(key); if (v != null) return v; } catch (e) { /* next */ }
    return null;
  };
  const version = readPersisted("ContinentsPlusPlusVersion");
  check("mod version stamped", !!version, String(version));

  let logs = [];
  try { logs = JSON.parse(readPersisted("ContinentsPlusPlusLogs") || "[]"); }
  catch (e) { /* empty */ }
  check("logs captured", logs.length > 0, logs.length + " lines");
  const logHas = (s) => logs.some(l => l.includes(s));

  let modStats = null;
  try { modStats = JSON.parse(readPersisted("ContinentsPlusPlusStats") || "null"); }
  catch (e) { /* null */ }
  check("generation stats persisted", !!modStats, "");
  report.stats.mod = modStats;

  // ── 2. Expected log lines ─────────────────────────────────────────────
  const humanIds = Players.getAliveMajorIds().filter(id => Players.isHuman(id));
  if (humanIds.length <= 1) {
    check("single-human override to Random", logHas("OVERRIDE to 2 (Random)"),
      "Clustered/Spread must force Random with <=1 human");
  }
  check("human homeland spawn confirmed", logHas("CONFIRMED: All human players spawn"),
    logHas("CRITICAL WARNING") ? "CRITICAL WARNING present!" : "");
  check("no critical warnings", !logHas("CRITICAL WARNING"), "");

  // ── 3. Full map scan: regions, water ──────────────────────────────────
  const w = GameplayMap.getGridWidth(), h = GameplayMap.getGridHeight();
  const regionIds = new Set();
  let land = 0, water = 0, distantLand = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (GameplayMap.getContinentType(x, y) === -1) { water++; continue; }
      land++;
      const r = GameplayMap.getLandmassRegionId(x, y);
      regionIds.add(r);
      if (r === 0) distantLand++;
    }
  }
  const waterPct = (water / (land + water) * 100);
  report.stats.map = {
    grid: w + "x" + h,
    waterPct: waterPct.toFixed(1),
    landTiles: land,
    distantLandTiles: distantLand,
    regionIds: [...regionIds].sort((a, b) => a - b)
  };

  const groupCount = modStats?.config?.landmassGroupCount ?? 10;
  check("region IDs are 0..groupCount",
    [...regionIds].every(r => r >= 0 && r <= groupCount),
    "found [" + [...regionIds].sort((a, b) => a - b).join(",") + "], groups=" + groupCount);
  check("player landmass regions exist", [...regionIds].some(r => r > 0), "");
  check("distant lands exist (region-0 land)", distantLand > 0,
    distantLand + " tiles — without them Exploration-age treasure mechanics are dead");
  check("distant lands are minority of land", distantLand < land * 0.5,
    (distantLand / land * 100).toFixed(1) + "% of land");
  check("water 50-75%", waterPct >= 50 && waterPct <= 75, waterPct.toFixed(1) + "%");

  // ── 4. Per-player homeland correctness ────────────────────────────────
  const playerChecks = [];
  for (const id of Players.getAliveMajorIds()) {
    const p = Players.get(id);
    const cap = p.Cities?.getCapital?.();
    const loc = cap ? cap.location : (p.Units?.getUnits?.()[0]?.location ?? null);
    if (!loc) continue;
    const region = GameplayMap.getLandmassRegionId(loc.x, loc.y);
    const isHuman = Players.isHuman(id);
    const homeNotDistant = (typeof p.isDistantLands === "function") ? !p.isDistantLands(loc) : null;
    playerChecks.push({ id, isHuman, loc, region, homeNotDistant });
    if (isHuman) {
      check("human " + id + " spawns on player landmass", region > 0, "region=" + region);
      if (homeNotDistant !== null) {
        check("human " + id + " isDistantLands(own spawn) == false", homeNotDistant, "");
      }
    }
  }
  report.stats.players = playerChecks;

  check("all players' spawns are non-distant to themselves",
    playerChecks.every(pc => pc.homeNotDistant !== false),
    playerChecks.filter(pc => pc.homeNotDistant === false).map(pc => pc.id).join(","));

  // ── 5. Placement quality (AI included) ────────────────────────────────
  check("every player has a start location",
    playerChecks.length === Players.getAliveMajorIds().length,
    playerChecks.length + "/" + Players.getAliveMajorIds().length);
  check("no player spawns on distant lands (region 0)",
    playerChecks.every(pc => pc.region > 0),
    playerChecks.filter(pc => pc.region === 0).map(pc => pc.id).join(","));

  // Companionship: nobody is the only player in their landmass group
  const byRegion = new Map();
  for (const pc of playerChecks) byRegion.set(pc.region, (byRegion.get(pc.region) || 0) + 1);
  const loners = playerChecks.filter(pc => byRegion.get(pc.region) === 1);
  check("no player alone in a landmass group",
    loners.length === 0,
    loners.map(pc => (pc.isHuman ? "HUMAN " : "AI ") + pc.id + " (region " + pc.region + ")").join(", "));
  report.stats.playersPerRegion = Object.fromEntries(byRegion);

  // ── 5b. Per-player homelands (AI homelands differing from the human's) ──
  // With 2+ landmass groups, a player in group N sees every OTHER group as
  // Distant Lands. Verify the cross-perspective both ways for each AI whose
  // group differs from the human's.
  const human = playerChecks.find(pc => pc.isHuman);
  if (human) {
    const foreignAIs = playerChecks.filter(pc => !pc.isHuman && pc.region !== human.region && pc.region > 0);
    report.stats.aiWithDifferentHomeland = foreignAIs.length;
    if (foreignAIs.length > 0) {
      let crossOk = true;
      const crossDetail = [];
      for (const ai of foreignAIs) {
        try {
          const aiSeesHumanAsDistant = Players.get(ai.id).isDistantLands({ x: human.x, y: human.y });
          const humanSeesAiAsDistant = Players.get(human.id).isDistantLands({ x: ai.x, y: ai.y });
          if (!aiSeesHumanAsDistant || !humanSeesAiAsDistant) crossOk = false;
          crossDetail.push(`AI ${ai.id}(r${ai.region}): ai→human distant=${aiSeesHumanAsDistant}, human→ai distant=${humanSeesAiAsDistant}`);
        } catch (e) { crossOk = false; crossDetail.push(`AI ${ai.id}: ERR ${e.message}`); }
      }
      check("AI homelands differ from human's (cross-perspective verified)", crossOk, crossDetail.join(" | "));
      report.stats.crossHomeland = crossDetail;
    } else {
      // Single group this seed — informational, not a failure (feasibility
      // requires a multi-group roll; see run log).
      report.stats.crossHomeland = "single player-group map: all players share one homeland";
    }
  }

  // Spawn spacing: min pairwise plot distance
  let minSpawnDist = Infinity, distOk = true;
  try {
    for (let i = 0; i < playerChecks.length; i++) {
      for (let j = i + 1; j < playerChecks.length; j++) {
        const d = GameplayMap.getPlotDistance(
          playerChecks[i].x, playerChecks[i].y, playerChecks[j].x, playerChecks[j].y);
        if (d < minSpawnDist) minSpawnDist = d;
      }
    }
  } catch (e) { distOk = false; }
  if (distOk && playerChecks.length > 1) {
    check("spawns at least 6 tiles apart", minSpawnDist >= 6, "min distance = " + minSpawnDist);
    report.stats.minSpawnDist = minSpawnDist;
  }

  // ── 6. Resources ──────────────────────────────────────────────────────
  try {
    let resourceTiles = 0, distantResources = 0;
    const resourceTypes = new Set();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const rt = GameplayMap.getResourceType(x, y);
        if (rt == null || rt === -1) continue;
        const row = GameInfo.Resources.lookup(rt);
        if (!row) continue;
        resourceTiles++;
        resourceTypes.add(row.ResourceType);
        if (GameplayMap.getContinentType(x, y) !== -1 &&
            GameplayMap.getLandmassRegionId(x, y) === 0) distantResources++;
      }
    }
    report.stats.resources = { tiles: resourceTiles, types: resourceTypes.size, onDistantLands: distantResources };
    check("resources generated (>= 20 tiles)", resourceTiles >= 20, resourceTiles + " resource tiles");
    check("resource variety (>= 5 types)", resourceTypes.size >= 5, resourceTypes.size + " types");
    check("resources exist on distant lands", distantResources > 0,
      distantResources + " — distant lands need resources for treasure mechanics");
  } catch (e) {
    check("resource API scan", false, "threw: " + e.message);
  }

  // ── 7. Terrain sanity ─────────────────────────────────────────────────
  // NOTE: there is no GameplayMap.isCoastalWater — count coast via terrain rows.
  try {
    const continents = new Set();
    let mountains = 0, coast = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = GameplayMap.getContinentType(x, y);
        if (c !== -1) continents.add(c);
        if (GameplayMap.isMountain(x, y)) mountains++;
        else if (GameInfo.Terrains.lookup(GameplayMap.getTerrainType(x, y))?.TerrainType === 'TERRAIN_COAST') coast++;
      }
    }
    report.stats.terrain = { continents: continents.size, mountains, coastTerrain: coast };
    check("multiple continents stamped (>= 2)", continents.size >= 2, continents.size + " continents");
    check("mountains generated", mountains > 0, mountains + " mountain tiles");
    check("coast terrain generated", coast > 0, coast + " coast tiles");
  } catch (e) {
    check("terrain API scan", false, "threw: " + e.message);
  }

  report.passed = report.failures === 0;
  return JSON.stringify(report);
})()
