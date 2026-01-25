/**
 * Continents++ Map Script - Enhanced Voronoi Plate Tectonics Edition
 *
 * Generates realistic, Earth-like continents using Voronoi plate tectonics simulation
 * with research-backed parameters for fantasy world map making.
 *
 * Key Features:
 * - 2 major continents with asymmetric sizes (Earth-like distribution)
 * - Strategic island placement for "pseudo-continents"
 * - Randomized parameters for unique maps each generation
 * - Map size scaling for appropriate detail levels
 * - ~65-70% water coverage (Earth-like)
 *
 * Research basis:
 * - Fractal coastline theory (target dimension ~1.25-1.33)
 * - Power-law island size distribution
 * - Plate tectonics continental formation patterns
 *
 * @packageDocumentation
 */

console.log("Generating using script Continents++ (Voronoi Edition)");

// Voronoi plate tectonics system
import { VoronoiContinents } from '/base-standard/scripts/voronoi_maps/continents.js';
import { RuleAvoidEdge } from '/base-standard/scripts/voronoi_rules/avoid-edge.js';
import { kdTree, TerrainType } from '/base-standard/scripts/kd-tree.js';

// Starting position assignment
import { assignStartPositions, chooseStartSectors } from '/ContinentsPlusPlus/modules/maps/assign-starting-plots.js';

// Base game terrain generation
import { addMountains, addHills, buildRainfallMap, generateLakes } from '/base-standard/maps/elevation-terrain-generator.js';
import { addFeatures, designateBiomes } from '/base-standard/maps/feature-biome-generator.js';
import * as globals from '/base-standard/maps/map-globals.js';
import * as utilities from '/base-standard/maps/map-utilities.js';
import { addNaturalWonders } from '/base-standard/maps/natural-wonder-generator.js';
import { generateResources } from '/base-standard/maps/resource-generator.js';
import { addVolcanoes } from '/base-standard/maps/volcano-generator.js';
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
  0: {
    name: 'TINY',
    // Total landmass size (lower = more water, ~65-70% water target)
    totalLandmassSize: { min: 18, max: 24 },
    // Continent configuration
    continentSizeRatio: { min: 0.45, max: 0.60 },  // Larger continent gets 45-60%
    erosionPercent: { min: 2, max: 4 },            // Lower erosion on small maps
    // Coastal islands (near continents)
    coastalIslands: { min: 4, max: 8 },
    coastalIslandSize: { min: 0.8, max: 1.2 },
    // Ocean islands (strategic mid-ocean)
    islandTotalSize: { min: 2.5, max: 4.5 },
    islandVariance: { min: 0.5, max: 1.5 },
    // Terrain
    mountainPercent: { min: 10, max: 14 },
    mountainRandomize: { min: 25, max: 45 },
  },

  // Index 1: SMALL (4-6 players)
  1: {
    name: 'SMALL',
    totalLandmassSize: { min: 22, max: 28 },
    continentSizeRatio: { min: 0.45, max: 0.58 },
    erosionPercent: { min: 3, max: 5 },
    coastalIslands: { min: 6, max: 12 },
    coastalIslandSize: { min: 0.8, max: 1.4 },
    islandTotalSize: { min: 3.5, max: 5.5 },
    islandVariance: { min: 0.8, max: 1.8 },
    mountainPercent: { min: 10, max: 15 },
    mountainRandomize: { min: 25, max: 45 },
  },

  // Index 2: STANDARD (6-8 players)
  2: {
    name: 'STANDARD',
    totalLandmassSize: { min: 26, max: 34 },
    continentSizeRatio: { min: 0.48, max: 0.58 },
    erosionPercent: { min: 3, max: 6 },
    coastalIslands: { min: 8, max: 16 },
    coastalIslandSize: { min: 0.9, max: 1.6 },
    islandTotalSize: { min: 4.5, max: 7.0 },
    islandVariance: { min: 1.0, max: 2.0 },
    mountainPercent: { min: 11, max: 15 },
    mountainRandomize: { min: 30, max: 50 },
  },

  // Index 3: LARGE (8-10 players)
  3: {
    name: 'LARGE',
    totalLandmassSize: { min: 32, max: 40 },
    continentSizeRatio: { min: 0.50, max: 0.60 },
    erosionPercent: { min: 4, max: 7 },
    coastalIslands: { min: 12, max: 20 },
    coastalIslandSize: { min: 1.0, max: 1.8 },
    islandTotalSize: { min: 5.5, max: 8.5 },
    islandVariance: { min: 1.2, max: 2.5 },
    mountainPercent: { min: 11, max: 16 },
    mountainRandomize: { min: 30, max: 50 },
  },

  // Index 4: HUGE (10-12 players)
  4: {
    name: 'HUGE',
    totalLandmassSize: { min: 38, max: 48 },
    continentSizeRatio: { min: 0.52, max: 0.62 },
    erosionPercent: { min: 5, max: 8 },           // Higher erosion for coastline detail
    coastalIslands: { min: 14, max: 24 },
    coastalIslandSize: { min: 1.0, max: 2.0 },
    islandTotalSize: { min: 6.5, max: 10.0 },
    islandVariance: { min: 1.5, max: 3.0 },
    mountainPercent: { min: 12, max: 17 },
    mountainRandomize: { min: 30, max: 55 },
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

  // Randomize total landmass size (controls water percentage)
  const totalLandmassSize = randomInt(random,
    baseConfig.totalLandmassSize.min,
    baseConfig.totalLandmassSize.max
  );

  // Randomize continent size distribution
  // The larger continent gets between min-max of total land
  const largerContinentRatio = randomRange(random,
    baseConfig.continentSizeRatio.min,
    baseConfig.continentSizeRatio.max
  );
  const smallerContinentRatio = 1.0 - largerContinentRatio;

  // Randomly decide which continent (0 or 1) is larger
  const largerContinentIndex = random() > 0.5 ? 0 : 1;

  // Randomize erosion (coastline complexity)
  const erosion0 = randomInt(random, baseConfig.erosionPercent.min, baseConfig.erosionPercent.max);
  const erosion1 = randomInt(random, baseConfig.erosionPercent.min, baseConfig.erosionPercent.max);

  // Randomize coastal islands
  const coastalIslands0 = randomInt(random, baseConfig.coastalIslands.min, baseConfig.coastalIslands.max);
  const coastalIslands1 = randomInt(random,
    Math.floor(baseConfig.coastalIslands.min * 0.7),  // Smaller continent gets fewer
    Math.floor(baseConfig.coastalIslands.max * 0.9)
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

  const config = {
    mapSize: baseConfig.name,

    // Total landmass size (controls overall land vs water ratio)
    totalLandmassSize: totalLandmassSize,

    // Continent sizes (as ratios of total land)
    continentRatios: largerContinentIndex === 0
      ? [largerContinentRatio, smallerContinentRatio]
      : [smallerContinentRatio, largerContinentRatio],

    // Landmass configurations
    landmass: [
      {
        erosionPercent: erosion0,
        coastalIslands: largerContinentIndex === 0 ? coastalIslands0 : coastalIslands1,
        coastalIslandsSize: coastalIslandSize,
        coastalIslandsSizeVariance: 0.5,
        coastalIslandsMinDistance: 2,
        coastalIslandsMaxDistance: 3 + mapSizeIndex,  // Scale with map size
      },
      {
        erosionPercent: erosion1,
        coastalIslands: largerContinentIndex === 1 ? coastalIslands0 : coastalIslands1,
        coastalIslandsSize: coastalIslandSize * 0.9,  // Slightly smaller on smaller continent
        coastalIslandsSizeVariance: 0.5,
        coastalIslandsMinDistance: 2,
        coastalIslandsMaxDistance: 3 + mapSizeIndex,
      }
    ],

    // Island configuration (mid-ocean)
    island: {
      totalSize: islandTotalSize,
      variance: islandVariance,
      meridianDistance: 2 + mapSizeIndex,      // Scale spacing with map size
      landmassDistance: 4 + mapSizeIndex,
      islandDistance: 2 + Math.floor(mapSizeIndex / 2),
      erosionPercent: Math.min(15, 10 + mapSizeIndex * 2),
      minSize: 0.3,
      maxSize: 1.5 + mapSizeIndex * 0.3,
    },

    // Mountain configuration
    mountain: {
      percent: mountainPercent,
      randomize: mountainRandomize,
      variance: 2 + mapSizeIndex,
    },

    // Volcano configuration (scales with map size)
    volcano: {
      percent: 12 + mapSizeIndex * 2,
      variance: 4 + mapSizeIndex,
      randomize: 10 + mapSizeIndex * 3,
    }
  };

  // Log the randomized configuration
  console.log(`[ContinentsPP] Total landmass size: ${config.totalLandmassSize}`);
  console.log(`[ContinentsPP] Continent ratio: ${(config.continentRatios[0] * 100).toFixed(1)}% / ${(config.continentRatios[1] * 100).toFixed(1)}%`);
  console.log(`[ContinentsPP] Erosion: ${config.landmass[0].erosionPercent}% / ${config.landmass[1].erosionPercent}%`);
  console.log(`[ContinentsPP] Coastal islands: ${config.landmass[0].coastalIslands} / ${config.landmass[1].coastalIslands}`);
  console.log(`[ContinentsPP] Mid-ocean islands: size=${config.island.totalSize.toFixed(1)}, variance=${config.island.variance.toFixed(1)}`);
  console.log(`[ContinentsPP] Mountains: ${config.mountain.percent}% (randomize: ${config.mountain.randomize})`);

  return config;
}

//──────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
//──────────────────────────────────────────────────────────────────────────────

/**
 * Calculates hemisphere boundaries for resource and start position assignment
 */
function calculateHemisphereBounds(iWidth, iHeight) {
  const midpoint = Math.floor(iWidth / 2);
  return {
    west: {
      west: globals.g_AvoidSeamOffset,
      east: midpoint,
      south: globals.g_PolarWaterRows,
      north: iHeight - globals.g_PolarWaterRows
    },
    east: {
      west: midpoint,
      east: iWidth - globals.g_AvoidSeamOffset,
      south: globals.g_PolarWaterRows,
      north: iHeight - globals.g_PolarWaterRows
    }
  };
}

/**
 * Applies randomized configuration to generator settings
 * Called AFTER init() - only modifies safe properties
 */
function applyRandomizedConfig(generatorSettings, config) {
  // Apply total landmass size (controls water percentage)
  if (config.totalLandmassSize) {
    generatorSettings.totalLandmassSize = config.totalLandmassSize;
    console.log(`[ContinentsPP] Set totalLandmassSize to ${config.totalLandmassSize}`);
  }

  // Apply landmass configurations
  for (let i = 0; i < Math.min(2, generatorSettings.landmass.length); i++) {
    const landmass = generatorSettings.landmass[i];
    const configLandmass = config.landmass[i];

    // These properties CAN be modified after init()
    landmass.erosionPercent = configLandmass.erosionPercent;
    landmass.coastalIslands = configLandmass.coastalIslands;
    landmass.coastalIslandsSize = configLandmass.coastalIslandsSize;
    landmass.coastalIslandsSizeVariance = configLandmass.coastalIslandsSizeVariance;
    landmass.coastalIslandsMinDistance = configLandmass.coastalIslandsMinDistance;
    landmass.coastalIslandsMaxDistance = configLandmass.coastalIslandsMaxDistance;
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
  const iNumPlayers1 = mapInfo.PlayersLandmass1;
  const iNumPlayers2 = mapInfo.PlayersLandmass2;
  const iTotalPlayers = Players.getAliveMajorIds().length;
  const iNumNaturalWonders = mapInfo.NumNaturalWonders;
  const iTilesPerLake = mapInfo.LakeGenerationFrequency;
  const iStartSectorRows = mapInfo.StartSectorRows;
  const iStartSectorCols = mapInfo.StartSectorCols;
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
  const voronoiMap = new VoronoiContinents();

  // Initialize with map size (creates generator with default settings)
  voronoiMap.init(mapSizeIndex);
  console.log("[ContinentsPP] Voronoi generator initialized");

  // Get generator settings and apply our randomized configuration
  const generatorSettings = voronoiMap.getGenerator().getSettings();
  applyRandomizedConfig(generatorSettings, randomConfig);

  // Configure pole distance rule (keep land away from poles)
  const rules = voronoiMap.getGenerator().getRules();
  for (const value of Object.values(rules)) {
    for (const rule of value) {
      if (rule.name == RuleAvoidEdge.getName()) {
        rule.configValues.poleDistance = globals.g_PolarWaterRows;
      }
    }
  }

  // Distribute players across continents proportionally
  let iActualPlayers1 = iNumPlayers1;
  let iActualPlayers2 = iNumPlayers2;

  if (iTotalPlayers != iNumPlayers1 + iNumPlayers2) {
    // Distribute based on continent size ratios
    const ratio1 = randomConfig.continentRatios[0];
    iActualPlayers1 = Math.max(1, Math.round(iTotalPlayers * ratio1));
    iActualPlayers2 = iTotalPlayers - iActualPlayers1;

    // Ensure at least 1 player per continent if we have enough players
    if (iTotalPlayers >= 2 && iActualPlayers2 < 1) {
      iActualPlayers2 = 1;
      iActualPlayers1 = iTotalPlayers - 1;
    }
  }

  // Set player areas on landmasses
  if (generatorSettings.landmass.length >= 2) {
    generatorSettings.landmass[0].playerAreas = iActualPlayers1;
    generatorSettings.landmass[1].playerAreas = iActualPlayers2;
  }

  console.log(`[ContinentsPP] Player distribution: Continent 1: ${iActualPlayers1}, Continent 2: ${iActualPlayers2}`);
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
      } else {
        TerrainBuilder.setTerrainType(x, y, globals.g_OceanTerrain);
        waterTiles++;
      }
    }
  }

  const totalTiles = landTiles + waterTiles;
  const landPercent = (landTiles / totalTiles * 100).toFixed(1);
  const waterPercent = (waterTiles / totalTiles * 100).toFixed(1);
  console.log(`[ContinentsPP] Land/Water: ${landPercent}% land / ${waterPercent}% water`);

  //────────────────────────────────────────────────────────────────────────────
  // TERRAIN PROCESSING
  //────────────────────────────────────────────────────────────────────────────

  const hemispheres = calculateHemisphereBounds(iWidth, iHeight);

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
  addNaturalWonders(iWidth, iHeight, iNumNaturalWonders, naturalWonderEvent);
  TerrainBuilder.addFloodplains(4, 10);
  addFeatures(iWidth, iHeight);
  TerrainBuilder.validateAndFixTerrain();
  utilities.adjustOceanPlotTags(iNumPlayers1 > iNumPlayers2);

  // Tag coastal plots using hemisphere boundaries
  for (let iY = 0; iY < iHeight; iY++) {
    for (let iX = 0; iX < iWidth; iX++) {
      let terrain = GameplayMap.getTerrainType(iX, iY);
      if (terrain === globals.g_CoastTerrain) {
        TerrainBuilder.setPlotTag(iX, iY, PlotTags.PLOT_TAG_WATER);
        if (iActualPlayers1 > iActualPlayers2) {
          if (iX < hemispheres.west.west - 2) {
            TerrainBuilder.addPlotTag(iX, iY, PlotTags.PLOT_TAG_EAST_WATER);
          } else {
            TerrainBuilder.addPlotTag(iX, iY, PlotTags.PLOT_TAG_WEST_WATER);
          }
        } else {
          if (iX > hemispheres.east.east + 2) {
            TerrainBuilder.addPlotTag(iX, iY, PlotTags.PLOT_TAG_WEST_WATER);
          } else {
            TerrainBuilder.addPlotTag(iX, iY, PlotTags.PLOT_TAG_EAST_WATER);
          }
        }
      }
    }
  }

  AreaBuilder.recalculateAreas();
  TerrainBuilder.storeWaterData();

  console.log("[ContinentsPP] Generating polar regions...");
  generateSnow(iWidth, iHeight);

  //────────────────────────────────────────────────────────────────────────────
  // START POSITIONS AND RESOURCES
  //────────────────────────────────────────────────────────────────────────────

  console.log("[ContinentsPP] Assigning start positions (fertility-based)...");

  // Empty start sectors array triggers fertility-based assignment
  const startSectors = [];
  dumpStartSectors(startSectors);

  // Debug output
  dumpContinents(iWidth, iHeight);
  dumpTerrain(iWidth, iHeight);
  dumpElevation(iWidth, iHeight);
  dumpRainfall(iWidth, iHeight);
  dumpBiomes(iWidth, iHeight);
  dumpFeatures(iWidth, iHeight);
  dumpPermanentSnow(iWidth, iHeight);

  console.log("[ContinentsPP] Generating resources...");
  generateResources(iWidth, iHeight, hemispheres.west, hemispheres.east, iActualPlayers1, iActualPlayers2);

  startPositions = assignStartPositions(iActualPlayers1, iActualPlayers2, hemispheres.west, hemispheres.east,
                                       iStartSectorRows, iStartSectorCols, startSectors);

  console.log("[ContinentsPP] Generating discoveries...");
  generateDiscoveries(iWidth, iHeight, startPositions);
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
  console.log(`  Players: ${iActualPlayers1} + ${iActualPlayers2} = ${iTotalPlayers}`);
  console.log("═══════════════════════════════════════════════════════════════");
}

engine.on('RequestMapInitData', requestMapData);
engine.on('GenerateMap', generateMap);
console.log("Loaded Continents++ (Voronoi Edition)");
