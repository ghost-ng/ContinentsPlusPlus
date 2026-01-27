/**
 * Continents++ Map Script - Enhanced Voronoi Plate Tectonics Edition
 *
 * Generates realistic, Earth-like continents using Voronoi plate tectonics simulation
 * with research-backed parameters for fantasy world map making.
 *
 * Key Features:
 * - 3-5 major continents (configurable via UnifiedContinentsBase)
 * - ~71% water coverage (Earth-like)
 * - Randomized parameters for unique maps each generation
 * - Map size scaling for appropriate detail levels
 *
 * Research basis:
 * - Fractal coastline theory (target dimension ~1.25-1.33)
 * - Power-law island size distribution
 * - Plate tectonics continental formation patterns
 *
 * @packageDocumentation
 */

console.log("Generating using script Continents++ (Voronoi Edition)");

// Voronoi plate tectonics system - using UnifiedContinentsBase for dynamic landmass count
import { UnifiedContinentsBase } from '/base-standard/scripts/voronoi_maps/unified-continents-base.js';
import { RuleAvoidEdge } from '/base-standard/scripts/voronoi_rules/avoid-edge.js';
import { RuleAvoidOtherRegions } from '/base-standard/scripts/voronoi_rules/avoid-other-regions.js';
import { kdTree, TerrainType, WrapType } from '/base-standard/scripts/kd-tree.js';
import { GeneratorType } from '/base-standard/scripts/voronoi_generators/map-generator.js';

// Starting position assignment - use tile-based approach for Voronoi maps
import { PlayerRegion, assignStartPositionsFromTiles } from '/base-standard/maps/assign-starting-plots.js';

// Base game terrain generation
import { addMountains, addHills, buildRainfallMap, generateLakes } from '/base-standard/maps/elevation-terrain-generator.js';
import { addFeatures, designateBiomes } from '/base-standard/maps/feature-biome-generator.js';
import * as globals from '/base-standard/maps/map-globals.js';
import * as utilities from '/base-standard/maps/map-utilities.js';
import { addNaturalWonders } from '/base-standard/maps/natural-wonder-generator.js';
import { generateResources } from '/base-standard/maps/resource-generator.js';
import { addVolcanoes, addTundraVolcanoes } from '/base-standard/maps/volcano-generator.js';
import { assignAdvancedStartRegions } from '/base-standard/maps/assign-advanced-start-region.js';
import { generateDiscoveries } from '/base-standard/maps/discovery-generator.js';
import { generateSnow, dumpPermanentSnow } from '/base-standard/maps/snow-generator.js';
import { dumpStartSectors, dumpContinents, dumpTerrain, dumpElevation, dumpRainfall, dumpBiomes, dumpFeatures, dumpResources, dumpNoisePredicate } from '/base-standard/maps/map-debug-helpers.js';

//──────────────────────────────────────────────────────────────────────────────
// RANDOM NUMBER UTILITIES
// Provides seeded random generation for reproducible but varied maps
//──────────────────────────────────────────────────────────────────────────────

/**
 * Simple seeded random number generator (mulberry32)
 * Produces deterministic results for the same seed
 */
function createSeededRandom(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Returns a random number between min and max (inclusive)
 */
function randomRange(random, min, max) {
  return min + random() * (max - min);
}

/**
 * Returns a random integer between min and max (inclusive)
 */
function randomInt(random, min, max) {
  return Math.floor(randomRange(random, min, max + 1));
}

/**
 * Returns a random element from an array
 */
function randomChoice(random, array) {
  return array[Math.floor(random() * array.length)];
}

//──────────────────────────────────────────────────────────────────────────────
// MAP CONFIGURATION SYSTEM
// Research-backed parameters scaled by map size
//──────────────────────────────────────────────────────────────────────────────

/**
 * Map size configuration with research-backed values
 *
 * Key principles:
 * - Land-to-water ratio: 30-35% land (65-70% water) - Earth-like
 * - Continent size asymmetry: Largest ~1.5-2x smallest (natural feel)
 * - Erosion: Scales with map size (more detail on larger maps)
 * - Islands: Power-law distribution (many small, few large)
 */
const MAP_SIZE_CONFIGS = {
  // Index 0: TINY (2-4 players)
  // Target: ~71% water (Earth-like), multiple continents
  0: {
    name: 'TINY',
    landmassCount: { min: 3, max: 4 },            // 3-4 continents
    totalLandmassSize: { min: 20, max: 26 },      // ~29% land (71% water)
    erosionPercent: { min: 6, max: 10 },
    // Coastal islands (near continents) - increased ~25%
    coastalIslands: { min: 5, max: 10 },
    coastalIslandSize: { min: 1.0, max: 1.6 },
    // Ocean islands - increased ~30%
    islandTotalSize: { min: 3, max: 5 },
    islandVariance: { min: 1, max: 2 },
    // Island spacing (randomized for variety)
    islandDistance: { min: 1, max: 3 },           // Min distance between islands (low = chains)
    landmassDistance: { min: 3, max: 5 },         // Min distance from continents (low = archipelagos)
    islandMaxSize: { min: 1.2, max: 2.0 },        // Max individual island size
    // Terrain
    mountainPercent: { min: 10, max: 14 },
    mountainRandomize: { min: 25, max: 45 },
    // Continent separation (ocean distance between landmasses)
    continentSeparation: { min: 4, max: 6 },      // minDistance for RuleAvoidOtherRegions
    separationFalloff: { min: 3, max: 5 },        // distanceFalloff soft buffer
  },

  // Index 1: SMALL (4-6 players)
  1: {
    name: 'SMALL',
    landmassCount: { min: 3, max: 5 },
    totalLandmassSize: { min: 22, max: 28 },
    erosionPercent: { min: 8, max: 12 },
    coastalIslands: { min: 10, max: 14 },          // Increased min for more islands
    coastalIslandSize: { min: 1.2, max: 1.8 },
    islandTotalSize: { min: 5, max: 8 },           // Increased min/max for more mid-ocean islands
    islandVariance: { min: 1.5, max: 3 },
    islandDistance: { min: 1, max: 3 },
    landmassDistance: { min: 3, max: 6 },
    islandMaxSize: { min: 1.4, max: 2.2 },
    mountainPercent: { min: 10, max: 15 },
    mountainRandomize: { min: 25, max: 45 },
    continentSeparation: { min: 4, max: 7 },
    separationFalloff: { min: 3, max: 5 },
  },

  // Index 2: STANDARD (6-8 players)
  2: {
    name: 'STANDARD',
    landmassCount: { min: 4, max: 5 },
    totalLandmassSize: { min: 24, max: 30 },
    erosionPercent: { min: 10, max: 14 },
    coastalIslands: { min: 10, max: 18 },
    coastalIslandSize: { min: 1.4, max: 2.0 },
    islandTotalSize: { min: 5, max: 9 },
    islandVariance: { min: 2, max: 4 },
    islandDistance: { min: 1, max: 4 },
    landmassDistance: { min: 3, max: 6 },
    islandMaxSize: { min: 1.5, max: 2.5 },
    mountainPercent: { min: 11, max: 15 },
    mountainRandomize: { min: 30, max: 50 },
    continentSeparation: { min: 5, max: 7 },
    separationFalloff: { min: 3, max: 6 },
  },

  // Index 3: LARGE (8-10 players)
  3: {
    name: 'LARGE',
    landmassCount: { min: 4, max: 6 },
    totalLandmassSize: { min: 26, max: 34 },
    erosionPercent: { min: 12, max: 16 },
    coastalIslands: { min: 13, max: 23 },
    coastalIslandSize: { min: 1.6, max: 2.2 },
    islandTotalSize: { min: 7, max: 12 },
    islandVariance: { min: 2.5, max: 5 },
    islandDistance: { min: 1, max: 4 },
    landmassDistance: { min: 4, max: 7 },
    islandMaxSize: { min: 1.8, max: 3.0 },
    mountainPercent: { min: 11, max: 16 },
    mountainRandomize: { min: 30, max: 50 },
    continentSeparation: { min: 5, max: 8 },
    separationFalloff: { min: 4, max: 6 },
  },

  // Index 4: HUGE (10-12 players)
  4: {
    name: 'HUGE',
    landmassCount: { min: 5, max: 7 },
    totalLandmassSize: { min: 28, max: 38 },
    erosionPercent: { min: 14, max: 18 },
    coastalIslands: { min: 18, max: 28 },
    coastalIslandSize: { min: 1.8, max: 2.6 },
    islandTotalSize: { min: 8, max: 16 },
    islandVariance: { min: 3, max: 6 },
    islandDistance: { min: 1, max: 4 },
    landmassDistance: { min: 4, max: 7 },
    islandMaxSize: { min: 2.0, max: 3.5 },
    mountainPercent: { min: 12, max: 17 },
    mountainRandomize: { min: 30, max: 55 },
    continentSeparation: { min: 6, max: 8 },
    separationFalloff: { min: 4, max: 7 },
  }
};

/**
 * Generates randomized configuration for this map generation
 * Each call produces different (but balanced) parameters
 */
function generateRandomizedConfig(mapSizeIndex, randomSeed) {
  const random = createSeededRandom(randomSeed);
  const baseConfig = MAP_SIZE_CONFIGS[mapSizeIndex] || MAP_SIZE_CONFIGS[2];

  console.log(`[ContinentsPP] Generating randomized config for ${baseConfig.name} map (seed: ${randomSeed})`);

  // Randomize number of continents
  const landmassCount = randomInt(random,
    baseConfig.landmassCount.min,
    baseConfig.landmassCount.max
  );

  // Randomize total landmass size (controls water percentage)
  const totalLandmassSize = randomInt(random,
    baseConfig.totalLandmassSize.min,
    baseConfig.totalLandmassSize.max
  );

  // Randomize coastal island size
  const coastalIslandSize = randomRange(random,
    baseConfig.coastalIslandSize.min,
    baseConfig.coastalIslandSize.max
  );

  // Randomize mid-ocean islands
  const islandTotalSize = randomRange(random,
    baseConfig.islandTotalSize.min,
    baseConfig.islandTotalSize.max
  );
  const islandVariance = randomRange(random,
    baseConfig.islandVariance.min,
    baseConfig.islandVariance.max
  );

  // Randomize mountain generation
  const mountainPercent = randomInt(random,
    baseConfig.mountainPercent.min,
    baseConfig.mountainPercent.max
  );
  const mountainRandomize = randomInt(random,
    baseConfig.mountainRandomize.min,
    baseConfig.mountainRandomize.max
  );

  // Randomize continent separation (ocean distance between landmasses)
  const continentSeparation = randomInt(random,
    baseConfig.continentSeparation.min,
    baseConfig.continentSeparation.max
  );
  const separationFalloff = randomInt(random,
    baseConfig.separationFalloff.min,
    baseConfig.separationFalloff.max
  );

  // Randomize island spacing (controls chains vs scattered)
  const islandDistance = randomInt(random,
    baseConfig.islandDistance.min,
    baseConfig.islandDistance.max
  );
  const landmassDistance = randomInt(random,
    baseConfig.landmassDistance.min,
    baseConfig.landmassDistance.max
  );
  const islandMaxSize = randomRange(random,
    baseConfig.islandMaxSize.min,
    baseConfig.islandMaxSize.max
  );

  // Generate landmass configurations for each continent
  const landmassConfigs = [];
  for (let i = 0; i < landmassCount; i++) {
    const erosion = randomInt(random, baseConfig.erosionPercent.min, baseConfig.erosionPercent.max);
    const coastalIslands = randomInt(random, baseConfig.coastalIslands.min, baseConfig.coastalIslands.max);

    landmassConfigs.push({
      erosionPercent: erosion,
      coastalIslands: coastalIslands,
      coastalIslandsSize: coastalIslandSize * (0.8 + random() * 0.4),  // Slight variation
      coastalIslandsSizeVariance: 0.5,
      coastalIslandsMinDistance: 2,
      coastalIslandsMaxDistance: 3 + mapSizeIndex,
    });
  }

  const config = {
    mapSize: baseConfig.name,

    // Number of continents (dynamic!)
    landmassCount: landmassCount,

    // Total landmass size (controls overall land vs water ratio)
    totalLandmassSize: totalLandmassSize,

    // Landmass configurations (one per continent)
    landmass: landmassConfigs,

    // Island configuration (mid-ocean) - randomized for variety
    island: {
      totalSize: islandTotalSize,
      variance: islandVariance,
      meridianDistance: 2 + mapSizeIndex,
      landmassDistance: landmassDistance,       // Randomized: low = closer to continents
      islandDistance: islandDistance,           // Randomized: low = chains, high = scattered
      erosionPercent: Math.min(15, 10 + mapSizeIndex * 2),
      minSize: 0.3,
      maxSize: islandMaxSize,                   // Randomized: varies island sizes
    },

    // Mountain configuration
    mountain: {
      percent: mountainPercent,
      randomize: mountainRandomize,
      variance: 2 + mapSizeIndex,
    },

    // Volcano configuration (scales with map size)
    // Lower percent to compensate for more continent boundaries spawning extra volcanoes
    volcano: {
      percent: 8 + mapSizeIndex,
      variance: 3 + mapSizeIndex,
      randomize: 8 + mapSizeIndex * 2,
    },

    // Continent separation (ocean distance between landmasses)
    continentSeparation: continentSeparation,
    separationFalloff: separationFalloff,
  };

  // Log the randomized configuration
  console.log(`[ContinentsPP] Landmass count: ${config.landmassCount}`);
  console.log(`[ContinentsPP] Total landmass size: ${config.totalLandmassSize}`);
  console.log(`[ContinentsPP] Erosion per continent: ${config.landmass.map(l => l.erosionPercent + '%').join(', ')}`);
  console.log(`[ContinentsPP] Coastal islands per continent: ${config.landmass.map(l => l.coastalIslands).join(', ')}`);
  console.log(`[ContinentsPP] Mid-ocean islands: size=${config.island.totalSize.toFixed(1)}, variance=${config.island.variance.toFixed(1)}`);
  console.log(`[ContinentsPP] Island spacing: islandDist=${config.island.islandDistance}, landmassDist=${config.island.landmassDistance}, maxSize=${config.island.maxSize.toFixed(1)}`);
  console.log(`[ContinentsPP] Mountains: ${config.mountain.percent}% (randomize: ${config.mountain.randomize})`);
  console.log(`[ContinentsPP] Continent separation: minDistance=${config.continentSeparation}, falloff=${config.separationFalloff}`);

  return config;
}

//──────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
//──────────────────────────────────────────────────────────────────────────────

/**
 * Applies randomized configuration to generator settings
 * Called AFTER init() - modifies individual landmass properties but NOT array length
 * (landmassCount and totalLandmassSize must be set in m_settings BEFORE init())
 */
function applyRandomizedConfig(generatorSettings, config) {
  // Modify individual landmass properties (array was created by applySettings in init)
  // DO NOT replace the array - applySettings() calculated proper sizes we need to keep
  const landmassCount = generatorSettings.landmass.length;
  console.log(`[ContinentsPP] Configuring ${landmassCount} landmasses`);

  for (let i = 0; i < landmassCount; i++) {
    const landmassConfig = config.landmass[i] || config.landmass[0];  // Fallback to first if fewer configs
    generatorSettings.landmass[i].erosionPercent = landmassConfig.erosionPercent;
    generatorSettings.landmass[i].coastalIslands = landmassConfig.coastalIslands;
    generatorSettings.landmass[i].coastalIslandsSize = landmassConfig.coastalIslandsSize;
    generatorSettings.landmass[i].coastalIslandsSizeVariance = landmassConfig.coastalIslandsSizeVariance;
    generatorSettings.landmass[i].coastalIslandsMinDistance = landmassConfig.coastalIslandsMinDistance;
    generatorSettings.landmass[i].coastalIslandsMaxDistance = landmassConfig.coastalIslandsMaxDistance;
    // Note: size, variance, spawnCenterDistance are calculated by applySettings() - don't override!
    console.log(`[ContinentsPP] Landmass ${i+1}: erosion=${landmassConfig.erosionPercent}%, islands=${landmassConfig.coastalIslands}`);
  }

  // Apply island configuration
  if (generatorSettings.island) {
    generatorSettings.island.totalSize = config.island.totalSize;
    generatorSettings.island.variance = config.island.variance;
    generatorSettings.island.meridianDistance = config.island.meridianDistance;
    generatorSettings.island.landmassDistance = config.island.landmassDistance;
    generatorSettings.island.islandDistance = config.island.islandDistance;
    generatorSettings.island.erosionPercent = config.island.erosionPercent;
    generatorSettings.island.minSize = config.island.minSize;
    generatorSettings.island.maxSize = config.island.maxSize;
  }

  // Apply mountain configuration
  if (generatorSettings.mountain) {
    generatorSettings.mountain.percent = config.mountain.percent;
    generatorSettings.mountain.randomize = config.mountain.randomize;
    generatorSettings.mountain.variance = config.mountain.variance;
  }

  // Apply volcano configuration
  if (generatorSettings.volcano) {
    generatorSettings.volcano.percent = config.volcano.percent;
    generatorSettings.volcano.variance = config.volcano.variance;
    generatorSettings.volcano.randomize = config.volcano.randomize;
  }

  console.log("[ContinentsPP] Applied randomized configuration to generator settings");
}

//──────────────────────────────────────────────────────────────────────────────
// MAP GENERATION ENTRY POINTS
//──────────────────────────────────────────────────────────────────────────────

function requestMapData(initParams) {
  console.log(`[ContinentsPP] Map dimensions: ${initParams.width}x${initParams.height}`);
  console.log(`[ContinentsPP] Map size index: ${initParams.mapSize}`);
  engine.call("SetMapInitData", initParams);
}

async function generateMap() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  CONTINENTS++ - Enhanced Voronoi Plate Tectonics Generation");
  console.log("═══════════════════════════════════════════════════════════════");

  // Check for natural wonder event
  let naturalWonderEvent = false;
  const liveEventDBRow = GameInfo.GlobalParameters.lookup("REGISTERED_RACE_TO_WONDERS_EVENT");
  if (liveEventDBRow && liveEventDBRow.Value != "0") {
    naturalWonderEvent = true;
  }

  console.log(`[ContinentsPP] Age: ${GameInfo.Ages.lookup(Game.age).AgeType}`);

  // Get map parameters
  const iWidth = GameplayMap.getGridWidth();
  const iHeight = GameplayMap.getGridHeight();
  const uiMapSize = GameplayMap.getMapSize();
  let startPositions = [];
  const mapInfo = GameInfo.Maps.lookup(uiMapSize);
  if (mapInfo == null) {
    console.log("[ContinentsPP] ERROR: Could not lookup map info!");
    return;
  }

  // Retrieve base map parameters
  const iTotalPlayers = Players.getAliveMajorIds().length;
  const iNumNaturalWonders = mapInfo.NumNaturalWonders;
  const iTilesPerLake = mapInfo.LakeGenerationFrequency;
  const mapSizeIndex = mapInfo.$index;

  console.log(`[ContinentsPP] Map size: ${MAP_SIZE_CONFIGS[mapSizeIndex]?.name || 'UNKNOWN'} (index: ${mapSizeIndex})`);
  console.log(`[ContinentsPP] Dimensions: ${iWidth}x${iHeight}`);
  console.log(`[ContinentsPP] Total players: ${iTotalPlayers}`);

  // Get map seed for reproducible randomization
  const mapSeed = GameplayMap.getRandomSeed();
  console.log(`[ContinentsPP] Map seed: ${mapSeed}`);

  // Generate randomized configuration based on map size and seed
  const randomConfig = generateRandomizedConfig(mapSizeIndex, mapSeed);

  //────────────────────────────────────────────────────────────────────────────
  // VORONOI PLATE TECTONICS GENERATION
  //────────────────────────────────────────────────────────────────────────────

  console.log("[ContinentsPP] Initializing Voronoi plate tectonics simulation...");
  console.log(`[ContinentsPP] Using UnifiedContinentsBase for ${randomConfig.landmassCount} continents`);

  // Create default generator settings (similar to continentSettings in base game)
  // These get merged with UnifiedContinentsBase's applySettings() calculations
  const defaultGeneratorSettings = {
    generatorKey: 0,
    mapConfig: {},
    generatorConfig: {
      plate: {
        plateRotationMultiple: 5
      },
      landmass: [
        // Template - will be replaced by applySettings based on landmassCount
        { variance: 2, erosionPercent: 4, coastalIslands: 12 }
      ],
      island: {
        totalSize: randomConfig.island.totalSize,
        variance: randomConfig.island.variance,
        meridianDistance: randomConfig.island.meridianDistance,
        landmassDistance: randomConfig.island.landmassDistance,
        erosionPercent: randomConfig.island.erosionPercent
      },
      mountain: {
        percent: randomConfig.mountain.percent,
        randomize: randomConfig.mountain.randomize
      },
      volcano: {
        percent: randomConfig.volcano.percent,
        variance: randomConfig.volcano.variance,
        randomize: randomConfig.volcano.randomize
      }
    },
    rulesConfig: {}
  };

  const voronoiMap = new UnifiedContinentsBase();

  // Set m_settings BEFORE initInternal() - applySettings() reads these during init
  try {
    const voronoiSettings = voronoiMap.getSettings();
    console.log(`[ContinentsPP] Default settings: landmassCount=${voronoiSettings.landmassCount}, totalLandmassSize=${voronoiSettings.totalLandmassSize}`);

    voronoiSettings.landmassCount = randomConfig.landmassCount;
    voronoiSettings.totalLandmassSize = randomConfig.totalLandmassSize;
    console.log(`[ContinentsPP] Modified settings: landmassCount=${voronoiSettings.landmassCount}, totalLandmassSize=${voronoiSettings.totalLandmassSize}`);
  } catch (e) {
    console.log(`[ContinentsPP] Warning: Could not modify pre-init settings: ${e.message}`);
  }

  // Initialize with map size using initInternal (UnifiedContinentsBase doesn't have init())
  try {
    const cellCountMultiple = 1;  // Standard density
    const relaxationSteps = 3;    // Standard relaxation
    const wrapType = WrapType.WrapX;  // Wrap around meridian (cylindrical map)

    voronoiMap.initInternal(
      mapSizeIndex,
      GeneratorType.Continent,
      defaultGeneratorSettings,
      cellCountMultiple,
      relaxationSteps,
      wrapType
    );
    console.log("[ContinentsPP] Voronoi generator initialized successfully");
  } catch (e) {
    console.log(`[ContinentsPP] ERROR during initInternal: ${e.message}`);
    console.log(`[ContinentsPP] Stack: ${e.stack}`);
    throw e;
  }

  // Get generator settings and apply our randomized configuration (erosion, islands, etc.)
  const generatorSettings = voronoiMap.getGenerator().getSettings();
  console.log(`[ContinentsPP] Post-init landmass count: ${generatorSettings.landmass.length}`);
  applyRandomizedConfig(generatorSettings, randomConfig);

  // Configure Voronoi rules for continent generation
  const rules = voronoiMap.getGenerator().getRules();
  for (const value of Object.values(rules)) {
    for (const rule of value) {
      // Configure pole/edge avoidance - allow land to extend closer to poles for tundra
      if (rule.name == RuleAvoidEdge.getName()) {
        rule.configValues.poleDistance = globals.g_PolarWaterRows;  // Hard cutoff (2 tiles)
        rule.configValues.poleDistanceFalloff = 3;  // Reduced from 6 to allow land closer to poles
        console.log(`[ContinentsPP] Set pole avoidance: poleDistance=${rule.configValues.poleDistance}, falloff=${rule.configValues.poleDistanceFalloff}`);
      }
      // Randomized ocean distance between continents (varies per map for unpredictability)
      // minDistance: minimum guaranteed ocean tiles between landmasses
      // distanceFalloff: soft buffer that discourages growth toward other continents
      if (rule.name == RuleAvoidOtherRegions.getName()) {
        rule.configValues.minDistance = randomConfig.continentSeparation;
        rule.configValues.distanceFalloff = randomConfig.separationFalloff;
        console.log(`[ContinentsPP] Set continent separation: minDistance=${rule.configValues.minDistance}, falloff=${rule.configValues.distanceFalloff}`);
      }
    }
  }

  // Spread continents further apart by increasing spawn distance from center
  // Default is 0.5-0.75, we use 0.65-0.85 for more ocean between continents
  for (let i = 0; i < generatorSettings.landmass.length; i++) {
    const baseDistance = 0.65 + (i * 0.05);  // Stagger distances slightly
    generatorSettings.landmass[i].spawnCenterDistance = Math.min(0.85, baseDistance);
  }
  console.log(`[ContinentsPP] Continent spawn distances: ${generatorSettings.landmass.map((l, i) => l.spawnCenterDistance.toFixed(2)).join(', ')}`);

  // Distribute players across continents evenly
  const landmassCount = generatorSettings.landmass.length;
  const playersPerContinent = Math.floor(iTotalPlayers / landmassCount);
  let remainingPlayers = iTotalPlayers % landmassCount;

  for (let i = 0; i < landmassCount; i++) {
    // Distribute remaining players to first continents
    const extraPlayer = remainingPlayers > 0 ? 1 : 0;
    if (remainingPlayers > 0) remainingPlayers--;

    generatorSettings.landmass[i].playerAreas = playersPerContinent + extraPlayer;
  }

  const playerDistribution = generatorSettings.landmass.map((l, i) => `C${i+1}: ${l.playerAreas}`).join(', ');
  console.log(`[ContinentsPP] Player distribution: ${playerDistribution}`);

  console.log("[ContinentsPP] Running Voronoi simulation...");

  voronoiMap.simulate();
  console.log("[ContinentsPP] Voronoi simulation complete");

  //────────────────────────────────────────────────────────────────────────────
  // TERRAIN APPLICATION
  //────────────────────────────────────────────────────────────────────────────

  console.log("[ContinentsPP] Applying terrain to map grid...");
  const tiles = voronoiMap.getHexTiles().getTiles();
  let landTiles = 0;
  let waterTiles = 0;

  // Track tiles per landmass for island analysis
  const landmassTileCounts = new Map();  // landmassId -> tile count

  // Build a kd-tree of landmass tiles for coast region assignment (like base game voronoi)
  const landmassKdTree = new kdTree((tile) => tile.pos);
  landmassKdTree.build(tiles.flatMap((row) => row.filter((tile) => tile.landmassId > 0)));

  for (let y = 0; y < tiles.length; ++y) {
    for (let x = 0; x < tiles[y].length; ++x) {
      const tile = tiles[y][x];
      if (tile.isLand()) {
        const type = tile.terrainType === TerrainType.Flat
          ? globals.g_FlatTerrain
          : tile.terrainType === TerrainType.Mountainous || tile.terrainType === TerrainType.Volcano
          ? globals.g_MountainTerrain
          : tile.terrainType === TerrainType.Rough
          ? globals.g_HillTerrain
          : globals.g_FlatTerrain;
        TerrainBuilder.setTerrainType(x, y, type);
        landTiles++;

        // Track tile count per landmass for island analysis
        const currentCount = landmassTileCounts.get(tile.landmassId) || 0;
        landmassTileCounts.set(tile.landmassId, currentCount + 1);

        // Set landmass region ID (critical for distant lands mechanic!)
        // landmassId 1 = WEST (primary hemisphere / homelands)
        // landmassId 2+ = EAST (secondary hemisphere / distant lands)
        // This ensures REQUIREMENT_CITY_IS_DISTANT_LANDS works correctly
        // and Exploration Age resource bonuses apply to all non-primary continents
        if (tile.landmassId === 1) {
          TerrainBuilder.setLandmassRegionId(x, y, LandmassRegion.LANDMASS_REGION_WEST);
        } else if (tile.landmassId >= 2) {
          // All other continents are "distant lands" (EAST hemisphere)
          TerrainBuilder.setLandmassRegionId(x, y, LandmassRegion.LANDMASS_REGION_EAST);
          // Also tag continents 3+ as islands for additional resource variety
          if (tile.landmassId > 2) {
            TerrainBuilder.addPlotTag(x, y, PlotTags.PLOT_TAG_ISLAND);
          }
        }
      } else {
        // Water tiles - Ocean is deep water, everything else is shallow/coastal
        // Base game logic: Ocean → OceanTerrain, else → CoastTerrain
        const type = tile.terrainType === TerrainType.Ocean ? globals.g_OceanTerrain : globals.g_CoastTerrain;
        TerrainBuilder.setTerrainType(x, y, type);
        waterTiles++;

        // Set landmass region for coast tiles (helps resource distribution near coasts)
        // Check if NOT deep ocean (shallow water near land)
        if (tile.terrainType !== TerrainType.Ocean) {
          const landmassTile = landmassKdTree.search(tile.pos);
          const nearbyLandmassId = landmassTile?.data?.landmassId ?? -1;
          if (nearbyLandmassId === 1) {
            TerrainBuilder.setLandmassRegionId(x, y, LandmassRegion.LANDMASS_REGION_WEST);
          } else if (nearbyLandmassId >= 2) {
            // Coasts near continents 2+ are all "distant lands"
            TerrainBuilder.setLandmassRegionId(x, y, LandmassRegion.LANDMASS_REGION_EAST);
            if (nearbyLandmassId > 2) {
              TerrainBuilder.addPlotTag(x, y, PlotTags.PLOT_TAG_ISLAND);
            }
          }
        }
      }
    }
  }

  const totalTiles = landTiles + waterTiles;
  const landPercent = (landTiles / totalTiles * 100).toFixed(1);
  const waterPercent = (waterTiles / totalTiles * 100).toFixed(1);
  console.log(`[ContinentsPP] Land/Water: ${landPercent}% land / ${waterPercent}% water`);

  // Island Analysis: Categorize landmasses by size
  // Major continents are the first N landmasses (where N = configured landmassCount)
  // Smaller landmasses are islands (coastal or mid-ocean)
  const sortedLandmasses = Array.from(landmassTileCounts.entries())
    .sort((a, b) => b[1] - a[1]);  // Sort by tile count descending

  const configuredContinents = randomConfig.landmassCount;
  let continentTiles = 0;
  let islandTiles = 0;
  let islandCount = 0;

  console.log(`[ContinentsPP] === LANDMASS ANALYSIS ===`);
  for (let i = 0; i < sortedLandmasses.length; i++) {
    const [landmassId, tileCount] = sortedLandmasses[i];
    const percentOfLand = (tileCount / landTiles * 100).toFixed(1);

    if (i < configuredContinents) {
      // Major continent
      continentTiles += tileCount;
      console.log(`[ContinentsPP]   Continent ${i + 1} (ID ${landmassId}): ${tileCount} tiles (${percentOfLand}% of land)`);
    } else {
      // Island
      islandTiles += tileCount;
      islandCount++;
      if (islandCount <= 10) {  // Log first 10 islands individually
        console.log(`[ContinentsPP]   Island ${islandCount} (ID ${landmassId}): ${tileCount} tiles (${percentOfLand}% of land)`);
      }
    }
  }

  if (islandCount > 10) {
    console.log(`[ContinentsPP]   ... and ${islandCount - 10} more small islands`);
  }

  const islandPercentOfLand = landTiles > 0 ? (islandTiles / landTiles * 100).toFixed(1) : 0;
  const continentPercentOfLand = landTiles > 0 ? (continentTiles / landTiles * 100).toFixed(1) : 0;
  console.log(`[ContinentsPP] === SUMMARY ===`);
  console.log(`[ContinentsPP]   Continents: ${configuredContinents} (${continentTiles} tiles, ${continentPercentOfLand}% of land)`);
  console.log(`[ContinentsPP]   Islands: ${islandCount} (${islandTiles} tiles, ${islandPercentOfLand}% of land)`);
  console.log(`[ContinentsPP]   Island ratio: ${islandCount > 0 ? (islandTiles / continentTiles * 100).toFixed(1) : 0}% of continent size`);

  //────────────────────────────────────────────────────────────────────────────
  // TERRAIN PROCESSING
  //────────────────────────────────────────────────────────────────────────────

  TerrainBuilder.validateAndFixTerrain();
  AreaBuilder.recalculateAreas();
  TerrainBuilder.stampContinents();

  console.log("[ContinentsPP] Adding mountains and volcanoes...");
  addMountains(iWidth, iHeight);
  addVolcanoes(iWidth, iHeight);

  console.log("[ContinentsPP] Generating lakes and rivers...");
  generateLakes(iWidth, iHeight, iTilesPerLake);
  AreaBuilder.recalculateAreas();
  TerrainBuilder.buildElevation();
  addHills(iWidth, iHeight);
  buildRainfallMap(iWidth, iHeight);
  TerrainBuilder.modelRivers(5, 15, globals.g_NavigableRiverTerrain);
  TerrainBuilder.validateAndFixTerrain();
  TerrainBuilder.defineNamedRivers();

  console.log("[ContinentsPP] Designating biomes and features...");
  designateBiomes(iWidth, iHeight);
  addTundraVolcanoes(iWidth, iHeight);  // Randomly adds volcanoes to tundra mountains
  addNaturalWonders(iWidth, iHeight, iNumNaturalWonders, naturalWonderEvent);
  TerrainBuilder.addFloodplains(4, 10);
  addFeatures(iWidth, iHeight);
  TerrainBuilder.validateAndFixTerrain();

  // Recalculate areas and store water data (matching base game flow)
  AreaBuilder.recalculateAreas();
  TerrainBuilder.storeWaterData();

  console.log("[ContinentsPP] Generating polar regions...");
  generateSnow(iWidth, iHeight);

  //────────────────────────────────────────────────────────────────────────────
  // START POSITIONS AND RESOURCES
  //────────────────────────────────────────────────────────────────────────────

  // Debug output
  dumpContinents(iWidth, iHeight);
  dumpTerrain(iWidth, iHeight);
  dumpElevation(iWidth, iHeight);
  dumpRainfall(iWidth, iHeight);
  dumpBiomes(iWidth, iHeight);
  dumpFeatures(iWidth, iHeight);
  dumpPermanentSnow(iWidth, iHeight);

  console.log("[ContinentsPP] Generating resources...");
  // generateResources signature: (iWidth, iHeight, minMarineResourceTypesOverride = 3)
  // Resource distribution uses LandmassRegionId set during terrain application
  generateResources(iWidth, iHeight);

  //────────────────────────────────────────────────────────────────────────────
  // TILE-BASED START POSITION ASSIGNMENT (Voronoi-aware)
  // This approach works correctly for all ages (Antiquity, Exploration, Modern)
  // because it uses actual tile locations instead of geographic hemisphere bounds
  //────────────────────────────────────────────────────────────────────────────

  console.log("[ContinentsPP] Assigning start positions (tile-based for Voronoi maps)...");

  // Create player areas using Voronoi's built-in fertility-based region creation
  const fertilityGetter = (tile) => StartPositioner.getPlotFertilityForCoord(tile.coord.x, tile.coord.y);
  voronoiMap.createMajorPlayerAreas(fertilityGetter);

  // Build PlayerRegion objects from Voronoi tiles
  const playerRegions = Array.from({ length: iTotalPlayers }, () => new PlayerRegion());
  playerRegions.forEach((region, index) => {
    region.regionId = index;
  });

  console.log(`[ContinentsPP] Creating ${iTotalPlayers} player regions from Voronoi tiles...`);

  // Calculate offsets for each landmass (to map majorPlayerRegionId to global region index)
  let offset = 0;
  const offsets = [0].concat([
    ...generatorSettings.landmass.map((n) => {
      offset += n.playerAreas;
      return offset;
    })
  ]);

  // Assign tiles to player regions based on Voronoi's majorPlayerRegionId
  for (const row of tiles) {
    for (const tile of row) {
      if (tile.majorPlayerRegionId >= 0 && tile.landmassId > 0) {
        const regionId = tile.majorPlayerRegionId + offsets[tile.landmassId - 1];
        if (regionId < playerRegions.length) {
          const playerRegion = playerRegions[regionId];
          playerRegion.landmassId = tile.landmassId - 1;
          playerRegion.tiles.push({ x: tile.coord.x, y: tile.coord.y });
        }
      }
    }
  }

  // Log region info
  playerRegions.forEach((region, i) => {
    console.log(`[ContinentsPP] Region ${i}: landmass=${region.landmassId}, tiles=${region.tiles.length}`);
  });

  // Use tile-based start position assignment (works correctly for all ages)
  startPositions = assignStartPositionsFromTiles(playerRegions);

  console.log("[ContinentsPP] Generating discoveries...");
  generateDiscoveries(iWidth, iHeight, startPositions, globals.g_PolarWaterRows);
  dumpResources(iWidth, iHeight);

  FertilityBuilder.recalculate();
  let seed = GameplayMap.getRandomSeed();
  let avgDistanceBetweenPoints = 3;
  let normalizedRangeSmoothing = 2;
  let poisson = TerrainBuilder.generatePoissonMap(seed, avgDistanceBetweenPoints, normalizedRangeSmoothing);
  let poissonPred = (val) => {
    return val >= 1 ? "*" : " ";
  };
  dumpNoisePredicate(iWidth, iHeight, poisson, poissonPred);

  assignAdvancedStartRegions();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  CONTINENTS++ MAP GENERATION COMPLETE");
  console.log(`  Land: ${landPercent}% | Water: ${waterPercent}%`);
  console.log(`  Continents: ${landmassCount} | Players: ${iTotalPlayers}`);
  console.log(`  Distribution: ${playerDistribution}`);
  console.log("═══════════════════════════════════════════════════════════════");
}

engine.on('RequestMapInitData', requestMapData);
engine.on('GenerateMap', generateMap);
console.log("Loaded Continents++ (Voronoi Edition)");
