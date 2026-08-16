/**
 * Continents++ Map Script — v3 (new Voronoi API)
 *
 * Generates 2-8 randomized continents plus dedicated Distant Lands landmasses
 * using the base game's UnifiedContinentsBase (post-2026 patch Voronoi API).
 *
 * v3 is a full migration from the legacy pipeline (see git history for v2):
 * the old hand-rolled systems — terrain application, WEST/EAST region stamping,
 * distant-lands BFS, player distribution layers — are replaced by native
 * engine features: distantCount (distant landmasses with playerAreas=0),
 * landmassGroupCount (continent grouping), minPlayersPerLandmassGroup
 * (companion guarantee), and hex-map validation (bridging removal, forced
 * oceans between groups).
 *
 * Region ID semantics (new engine): landmass region id 0 = non-player land
 * (islands + distant landmasses, tagged PLOT_TAG_ISLAND), 1+ = player
 * landmass group id. player.isDistantLands() derives from these.
 */

const ContinentsPlusPlusVersion = "3.0.0-dev";
const ContinentsPlusPlusLogs = [];
var _cppOriginalLog = console.log;
console.log = function(...args) {
  _cppOriginalLog.apply(console, args);
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  if (msg.includes('[ContinentsPP]') || msg.includes('Continents++')) {
    ContinentsPlusPlusLogs.push(msg);
  }
};
/**
 * Persist a key/value readable from other JS contexts (UI/debug console).
 * The map-gen context's Configuration API varies by game version:
 * pre-patch had Configuration.editMap(); try every known channel.
 */
function persistMapValue(key, value) {
  try { Configuration.editMap().setValue(key, value); return 'editMap'; } catch (e) { /* next */ }
  try { Configuration.getMap().setValue(key, value); return 'getMap.setValue'; } catch (e) { /* next */ }
  try { Game.setProperty(key, value); return 'Game.setProperty'; } catch (e) { /* next */ }
  return null;
}

const _versionChannel = persistMapValue("ContinentsPlusPlusVersion", ContinentsPlusPlusVersion);
console.log(`Generating using script Continents++ v${ContinentsPlusPlusVersion}` +
  (_versionChannel ? ` (persist channel: ${_versionChannel})` : ' (no persistence channel available!)'));

import { UnifiedContinentsBase } from '/base-standard/scripts/voronoi_maps/unified-continents-base.js';
import { voronoiMapSchema } from '/base-standard/scripts/voronoi_maps/map-common.js';
import { HexValidationSettings, RemoveBridgingLandmassOptions, VoronoiValidationSettings, SeparationFilterOptions } from '/base-standard/scripts/hex-map.js';
import { RegionType } from '/base-standard/scripts/voronoi-types.js';
import { VoronoiUtils } from '/base-standard/scripts/voronoi-utils.js';
import fractalSettings from '/base-standard/scripts/voronoi_data/fractal.mapconfig.js';
import { generateMapFeatures } from '/base-standard/scripts/common-generation.js';
import { profileScope } from '/base-standard/scripts/profiling.js';
import { assignStartPositionsFromHexMap } from '/base-standard/maps/assign-starting-plots.js';
import { generateDiscoveries } from '/base-standard/maps/discovery-generator.js';
import { assignAdvancedStartRegions } from '/base-standard/maps/assign-advanced-start-region.js';
import { g_PolarWaterRows } from '/base-standard/maps/map-globals.js';

//──────────────────────────────────────────────────────────────────────────────
// MAP SIZE CONFIGURATION
// landmassCount is player continents only; distant landmasses are separate
// (distantCount). Ranges align with the Continent Count UI option text.
//──────────────────────────────────────────────────────────────────────────────

const MAP_SIZE_CONFIGS = {
  0: { name: 'TINY',     random: { min: 2, max: 4 }, many: { min: 5, max: 6 }, distant: { min: 1, max: 2 } },
  1: { name: 'SMALL',    random: { min: 2, max: 5 }, many: { min: 5, max: 7 }, distant: { min: 1, max: 2 } },
  2: { name: 'STANDARD', random: { min: 3, max: 5 }, many: { min: 5, max: 7 }, distant: { min: 1, max: 2 } },
  3: { name: 'LARGE',    random: { min: 3, max: 6 }, many: { min: 5, max: 7 }, distant: { min: 1, max: 3 } },
  4: { name: 'HUGE',     random: { min: 4, max: 7 }, many: { min: 5, max: 8 }, distant: { min: 2, max: 3 } }
};

const rollInt = (min, max, label) => Math.round(VoronoiUtils.getRandomMinMax(min, max, label));

/**
 * Build the randomized generation config from map size + UI options.
 * Uses the engine's seeded RandomImpl (via VoronoiUtils) so results are
 * reproducible per map seed.
 */
function buildCppConfig(mapSizeIndex, continentCountMode, distributionMode, humanCount) {
  const base = MAP_SIZE_CONFIGS[mapSizeIndex] || MAP_SIZE_CONFIGS[2];

  let landmassCount;
  if (continentCountMode === 0) {
    landmassCount = rollInt(2, 4, 'CPP Landmass Count Few');
  } else if (continentCountMode === 1) {
    landmassCount = rollInt(base.many.min, base.many.max, 'CPP Landmass Count Many');
  } else {
    landmassCount = rollInt(base.random.min, base.random.max, 'CPP Landmass Count Random');
  }

  const distantCount = rollInt(base.distant.min, base.distant.max, 'CPP Distant Count');

  // Land budget (percent of map area before erosion). Schema range is 20-50.
  // Tuned 2026-08-16: 30-36 base measured 67-72% water in test runs; raised
  // to 34-40 to hit the mod's Earth-like 60-65% target (erosion + hex
  // validation eat more of the budget than the raw percent suggests).
  const totalLandmassSize = VoronoiUtils.getRandomMinMax(34, 40, 'CPP Total Land Size') + landmassCount * 0.5;
  // Distant budget scales with map size: a flat budget measured 32% of all
  // land on Tiny vs 23% on Standard+. Multiplier: Tiny 0.75x → Huge 1.25x.
  const distantScale = 0.75 + mapSizeIndex * 0.125;
  const totalDistantSize = (VoronoiUtils.getRandomMinMax(3, 5, 'CPP Total Distant Size') + distantCount) * distantScale;

  // Asymmetric continent sizes (was the seeded 0.5x-1.5x multiplier system)
  const maxSizeVariance = rollInt(30, 50, 'CPP Size Variance');

  // Player distribution mode → native landmass grouping.
  //   Clustered (0): one group — players' continents cluster together
  //   Spread    (1): one group per human (bounded) — humans end up apart
  //   Random    (2): random 1-3 groups
  let landmassGroupCount;
  if (distributionMode === 0) {
    landmassGroupCount = 1;
  } else if (distributionMode === 1) {
    landmassGroupCount = Math.max(2, Math.min(humanCount, landmassCount, 4));
  } else {
    // Prefer 2+ groups when there are enough continents. Multiple homeland
    // groups give each player a PERSONAL homeland perspective: a player in
    // group 2 sees group 1 as Distant Lands and vice versa (isDistantLands
    // compares the tile's region to the player's spawn region). With one
    // group, everyone shares a single homeland and only the dedicated
    // distant landmasses (region 0) are Distant Lands.
    const minGroups = landmassCount >= 4 ? 2 : 1;
    landmassGroupCount = rollInt(minGroups, Math.min(3, landmassCount), 'CPP Group Count');
  }

  return {
    landmassCount,
    distantCount,
    totalLandmassSize,
    totalDistantSize,
    maxSizeVariance,
    landmassGroupCount,
    erosionPercent: rollInt(6, 12, 'CPP Erosion'),
    coastalIslands: rollInt(4, 8, 'CPP Coastal Islands'),
    islandTotalSize: VoronoiUtils.getRandomMinMax(2, 5, 'CPP Ocean Islands')
  };
}

//──────────────────────────────────────────────────────────────────────────────
// MAP CLASS
//──────────────────────────────────────────────────────────────────────────────

class ContinentsPlusPlusMap extends UnifiedContinentsBase {
  m_cppConfig;

  constructor() {
    super({ ...voronoiMapSchema }, fractalSettings);
  }

  static getName() {
    return "Continents++";
  }

  getFilename() {
    return "fractal.mapconfig.js";
  }

  init(hexDims) {
    this.initInternal(hexDims);
  }

  configure(cppConfig) {
    this.m_cppConfig = cppConfig;
  }

  simulateInternal() {
    const settings = this.m_settings;
    const cfg = this.m_cppConfig;

    settings.landmassCount = cfg.landmassCount;
    settings.distantCount = cfg.distantCount;
    settings.totalLandmassSize = cfg.totalLandmassSize;
    settings.totalDistantSize = cfg.totalDistantSize;
    settings.maxSizeVariance = cfg.maxSizeVariance;
    settings.maxDistantSizeVariance = 50;
    settings.landmassGroupCount = cfg.landmassGroupCount;
    settings.minPlayersPerLandmassGroup = 2;   // companion guarantee
    settings.enforceGroupConstraints = 1;

    // Per-landmass template — applySettings() clones landmass[0] for all
    const gen = this.getGenerator().getSettings();
    gen.landmass[0].erosionPercent = cfg.erosionPercent;
    gen.landmass[0].coastalIslands = cfg.coastalIslands;
    if (gen.island) {
      gen.island.totalSize = cfg.islandTotalSize;
    }

    console.log(`[ContinentsPP] Simulating: ${cfg.landmassCount} continents + ${cfg.distantCount} distant, ` +
      `land=${cfg.totalLandmassSize.toFixed(1)}% + distant=${cfg.totalDistantSize.toFixed(1)}%, ` +
      `sizeVariance=${cfg.maxSizeVariance}%, groups=${cfg.landmassGroupCount}, erosion=${cfg.erosionPercent}%`);

    const hexValidationSettings = new HexValidationSettings();
    hexValidationSettings.removeBridgingPlayerLandmasses = RemoveBridgingLandmassOptions.FORCE_OCEANS;
    hexValidationSettings.polarMargin = 1;
    this.getHexTiles().setValidationSettings(hexValidationSettings);

    super.simulateInternal();
  }

  getVoronoiValidationSettings() {
    const voronoiValidationSettings = new VoronoiValidationSettings();
    // Ocean (not just coast) required between ALL distinct landmasses, groups,
    // and land types. Coast-only separation (the archipelago default) let
    // same-group landmasses fuse after erosion: a "Many (7)" roll stamped as
    // only 4 game continents. Ocean separation keeps the advertised continent
    // count visible on the final map.
    voronoiValidationSettings.forceOceans = SeparationFilterOptions.DIFFERENT_TYPES
      | SeparationFilterOptions.DIFFERENT_LANDMASS_GROUPS
      | SeparationFilterOptions.DIFFERENT_LANDMASSES;
    voronoiValidationSettings.forceCoasts = SeparationFilterOptions.OFF;
    return voronoiValidationSettings;
  }

  // Distant landmasses (playerAreas=0) and islands → 0 (non-player land =
  // Distant Lands). Player landmasses → their group id.
  getPlayerLandmassFromCell(cell) {
    if (cell.landmassId > 0) {
      const landmass = this.m_generator.getLandmasses()[cell.landmassId];
      if (landmass.type === RegionType.Island || landmass.playerAreas === 0) {
        return 0;
      }
      return landmass.groupId;
    }
    return -1;
  }
}

//──────────────────────────────────────────────────────────────────────────────
// GENERATION ENTRY POINTS
//──────────────────────────────────────────────────────────────────────────────

function requestMapData(initParams) {
  console.log(`[ContinentsPP] Map init: ${initParams.width}x${initParams.height}, wrapX=${initParams.wrapX}`);
  engine.call("SetMapInitData", initParams);
}

function readMapOption(key, min, max, fallback) {
  try {
    const v = parseInt(Configuration.getMapValue(key), 10);
    if (!isNaN(v) && v >= min && v <= max) return v;
  } catch (e) { /* fall through */ }
  return fallback;
}

async function generateMap() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  CONTINENTS++ v${ContinentsPlusPlusVersion} — Voronoi Generation`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`[ContinentsPP] Age: ${GameInfo.Ages.lookup(Game.age).AgeType}`);

  const generationScope = new profileScope("Continents++ Generation");

  const iWidth = GameplayMap.getGridWidth();
  const iHeight = GameplayMap.getGridHeight();
  const uiMapSize = GameplayMap.getMapSize();
  const mapInfo = GameInfo.Maps.lookup(uiMapSize);
  if (mapInfo == null) {
    console.log("[ContinentsPP] ERROR: Could not lookup map info!");
    return;
  }
  const mapSizeIndex = mapInfo.$index;

  const aliveMajorIds = Players.getAliveMajorIds();
  const iTotalPlayers = aliveMajorIds.length;
  const humanCount = aliveMajorIds.filter(id => Players.isHuman(id)).length;

  console.log(`[ContinentsPP] Map size: ${MAP_SIZE_CONFIGS[mapSizeIndex]?.name || 'UNKNOWN'} (${iWidth}x${iHeight})`);
  console.log(`[ContinentsPP] Players: ${iTotalPlayers} (${humanCount} human)`);

  // UI options
  const continentCountMode = readMapOption("ContinentsPPContinentCount", 0, 2, 2);
  let distributionMode = readMapOption("ContinentsPPPlayerDistribution", 0, 2, 0);
  const COUNT_NAMES = ['Few (2-4)', 'Many (5+)', 'Random'];
  const DIST_NAMES = ['Clustered', 'Spread', 'Random'];
  console.log(`[ContinentsPP] Continent Count Mode: ${continentCountMode} (${COUNT_NAMES[continentCountMode]})`);
  if (humanCount <= 1 && distributionMode !== 2) {
    console.log(`[ContinentsPP] Player Distribution Mode: ${distributionMode} (${DIST_NAMES[distributionMode]}) → OVERRIDE to 2 (Random)`);
    console.log(`[ContinentsPP]   Reason: ${humanCount === 0 ? 'No' : 'Single'} human player — Clustered/Spread only apply to multiplayer`);
    distributionMode = 2;
  } else {
    console.log(`[ContinentsPP] Player Distribution Mode: ${distributionMode} (${DIST_NAMES[distributionMode]})`);
  }

  const cfg = buildCppConfig(mapSizeIndex, continentCountMode, distributionMode, humanCount);
  console.log(`[ContinentsPP] Config: ${JSON.stringify(cfg)}`);

  // Voronoi generation
  const voronoiMap = new ContinentsPlusPlusMap();
  voronoiMap.init({ x: iWidth, y: iHeight });
  voronoiMap.setPrimaryMapSetting(["totalPlayers"], iTotalPlayers);
  voronoiMap.configure(cfg);
  voronoiMap.simulate();

  // Terrain, biomes, features, resources — engine common pipeline
  await generateMapFeatures(voronoiMap.getHexTiles());

  // Start positions from player landmasses (distant lands excluded natively)
  const fertilityGetter = (tile) => StartPositioner.getPlotFertilityForCoord(tile.coord.x, tile.coord.y);
  voronoiMap.createMajorPlayerAreas(fertilityGetter);
  const startPositions = assignStartPositionsFromHexMap(voronoiMap.getHexTiles());

  //────────────────────────────────────────────────────────────────────────────
  // SPREAD MODE: post-assignment human separation.
  // The engine's assignStartPositionsFromTiles has bHumansTogether — when the
  // age defines HumanPlayersPrimaryHemisphere (Antiquity does), ALL humans are
  // forced onto the largest landmass group, defeating Spread. Fix by swapping
  // humans that share a group with AIs from unused groups.
  //────────────────────────────────────────────────────────────────────────────
  if (distributionMode === 1 && humanCount >= 2) {
    const regionOfPlot = (plot) =>
      GameplayMap.getLandmassRegionId(plot % iWidth, Math.floor(plot / iWidth));
    const players = aliveMajorIds
      .filter(id => startPositions[id] != null && startPositions[id] >= 0)
      .map(id => ({ id, isHuman: Players.isHuman(id), plot: startPositions[id],
        region: regionOfPlot(startPositions[id]) }));
    const humans = players.filter(p => p.isHuman);
    const usedHumanRegions = new Set();
    for (const human of humans) {
      if (!usedHumanRegions.has(human.region)) {
        usedHumanRegions.add(human.region);
        continue;
      }
      // Human shares a group with an earlier human — swap with an AI in a
      // group no human occupies yet. Pick the donor with the BEST start-plot
      // fertility so the relocated human doesn't inherit a weak AI position.
      const fertilityOf = (plot) => {
        try { return StartPositioner.getPlotFertilityForCoord(plot % iWidth, Math.floor(plot / iWidth)); }
        catch (e) { return 0; }
      };
      const donors = players.filter(p => !p.isHuman && p.region > 0 && !usedHumanRegions.has(p.region));
      if (donors.length === 0) {
        console.log(`[ContinentsPP] Spread: no free group for human ${human.id} — leaving in region ${human.region}`);
        continue;
      }
      const donor = donors.reduce((best, p) => fertilityOf(p.plot) > fertilityOf(best.plot) ? p : best);
      console.log(`[ContinentsPP] Spread: swapping human ${human.id} (region ${human.region}, fertility ${fertilityOf(human.plot)}) ` +
        `with AI ${donor.id} (region ${donor.region}, fertility ${fertilityOf(donor.plot)}) — best of ${donors.length} donor(s)`);
      const humanPlot = human.plot, donorPlot = donor.plot;
      startPositions[human.id] = donorPlot;
      startPositions[donor.id] = humanPlot;
      StartPositioner.setStartPosition(donorPlot, human.id);
      StartPositioner.setStartPosition(humanPlot, donor.id);
      const tmpRegion = human.region;
      human.region = donor.region; human.plot = donorPlot;
      donor.region = tmpRegion; donor.plot = humanPlot;
      usedHumanRegions.add(human.region);
    }
    console.log(`[ContinentsPP] Spread: humans now in regions [${humans.map(hm => hm.region).join(', ')}]`);
  }

  generateDiscoveries(iWidth, iHeight, startPositions, g_PolarWaterRows);
  FertilityBuilder.recalculate();
  assignAdvancedStartRegions();

  //────────────────────────────────────────────────────────────────────────────
  // VERIFICATION REPORT — consumed by tests via persisted logs
  //────────────────────────────────────────────────────────────────────────────
  let landTiles = 0, waterTiles = 0, distantLandTiles = 0;
  const regionIds = new Set();
  for (let y = 0; y < iHeight; y++) {
    for (let x = 0; x < iWidth; x++) {
      if (GameplayMap.getContinentType(x, y) === -1) { waterTiles++; continue; }
      landTiles++;
      const r = GameplayMap.getLandmassRegionId(x, y);
      regionIds.add(r);
      if (r === 0) distantLandTiles++;
    }
  }
  const waterPct = (waterTiles / (landTiles + waterTiles) * 100).toFixed(1);
  console.log(`[ContinentsPP] === GENERATION REPORT ===`);
  console.log(`[ContinentsPP] Water: ${waterPct}% | Land: ${landTiles} tiles (${distantLandTiles} distant/island)`);
  console.log(`[ContinentsPP] Region IDs present: [${[...regionIds].sort((a, b) => a - b).join(', ')}]`);

  console.log(`[ContinentsPP] PLAYER POSITIONS:`);
  let humansOk = true;
  for (let i = 0; i < aliveMajorIds.length; i++) {
    const plot = startPositions[i];
    if (plot == null || plot < 0) { console.log(`[ContinentsPP]   Player ${i}: NO START POSITION`); continue; }
    const x = plot % iWidth, y = Math.floor(plot / iWidth);
    const region = GameplayMap.getLandmassRegionId(x, y);
    const isHuman = Players.isHuman(aliveMajorIds[i]);
    if (isHuman && region === 0) humansOk = false;
    console.log(`[ContinentsPP]   Player ${i} (${isHuman ? 'HUMAN' : 'AI'}): (${x}, ${y}) region=${region}${isHuman && region === 0 ? ' [BAD: distant lands spawn!]' : ''}`);
  }
  if (humansOk) {
    console.log(`[ContinentsPP] CONFIRMED: All human players spawn on player landmasses (homeland)`);
  } else {
    console.log(`[ContinentsPP] CRITICAL WARNING: A human spawned on non-player land`);
  }

  // Persist for tests / debug console
  const statsJson = JSON.stringify({
    version: ContinentsPlusPlusVersion,
    config: cfg,
    waterPct: Number(waterPct),
    landTiles, distantLandTiles,
    regionIds: [...regionIds].sort((a, b) => a - b)
  });
  const logChannel = persistMapValue("ContinentsPlusPlusLogs", JSON.stringify(ContinentsPlusPlusLogs));
  persistMapValue("ContinentsPlusPlusStats", statsJson);
  if (logChannel) {
    console.log(`[ContinentsPP] Persisted logs + stats via ${logChannel}`);
  } else {
    // Help the next debugging round: what does this context actually expose?
    try {
      console.log(`[ContinentsPP] No persistence channel. Configuration props: ` +
        Object.getOwnPropertyNames(Configuration).join(','));
      console.log(`[ContinentsPP] Game props: ` +
        Object.getOwnPropertyNames(Game).filter(n => /prop|value|set/i.test(n)).join(','));
    } catch (e) { /* best effort */ }
  }

  generationScope.end();
}

engine.on("RequestMapInitData", requestMapData);
engine.on("GenerateMap", generateMap);
console.log("Loaded continents-plus-plus.js (v3)");
