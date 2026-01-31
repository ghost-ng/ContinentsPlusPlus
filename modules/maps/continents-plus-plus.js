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

/**
 * Calculates the shortest distance from a point to a line segment, accounting for map wrap
 */
function distanceToLineSegmentWrapped(px, py, x1, y1, x2, y2, mapWidth) {
  // Account for horizontal wrap - find the effective x2 that's closest to x1
  let dx = x2 - x1;
  if (Math.abs(dx) > mapWidth / 2) {
    // Wrap around
    if (dx > 0) dx -= mapWidth;
    else dx += mapWidth;
  }
  const effectiveX2 = x1 + dx;

  // Also adjust px to be in the right frame of reference
  let effectivePx = px;
  const midX = (x1 + effectiveX2) / 2;
  if (Math.abs(px - midX) > mapWidth / 2) {
    if (px > midX) effectivePx -= mapWidth;
    else effectivePx += mapWidth;
  }

  // Standard point-to-line-segment distance
  const lineLen = Math.sqrt(dx * dx + (y2 - y1) * (y2 - y1));
  if (lineLen === 0) {
    // Line segment is a point
    const dpx = effectivePx - x1;
    const dpy = py - y1;
    return Math.sqrt(dpx * dpx + dpy * dpy);
  }

  // Project point onto line, clamped to segment
  const t = Math.max(0, Math.min(1, ((effectivePx - x1) * dx + (py - y1) * (y2 - y1)) / (lineLen * lineLen)));
  const projX = x1 + t * dx;
  const projY = y1 + t * (y2 - y1);

  const distX = effectivePx - projX;
  const distY = py - projY;
  return Math.sqrt(distX * distX + distY * distY);
}

/**
 * Adds island chains in the corridors between inhabited (homeland) continents
 * Creates stepping-stone archipelagos for naval travel between player start continents
 */
function addCorridorIslands(iWidth, iHeight, mapSeed, continentIsInhabited, tiles, generatorSettings) {
  try {
    const random = createSeededRandom(mapSeed + 67890);

    console.log(`[ContinentsPP] === CORRIDOR ISLAND GENERATION ===`);

    // Find centers of inhabited continents
    const continentData = new Map(); // landmassId -> {sumX, sumY, count}
    const numMajorContinents = generatorSettings.landmass.length;

    for (const row of tiles) {
      for (const tile of row) {
        if (tile.landmassId > 0 && tile.landmassId <= numMajorContinents) {
          if (continentIsInhabited.get(tile.landmassId)) {
            if (!continentData.has(tile.landmassId)) {
              continentData.set(tile.landmassId, { sumX: 0, sumY: 0, count: 0 });
            }
            const data = continentData.get(tile.landmassId);
            data.sumX += tile.coord.x;
            data.sumY += tile.coord.y;
            data.count++;
          }
        }
      }
    }

    // Calculate centers
    const centers = [];
    for (const [id, data] of continentData) {
      centers.push({
        id,
        x: Math.round(data.sumX / data.count),
        y: Math.round(data.sumY / data.count)
      });
    }

    console.log(`[ContinentsPP] Found ${centers.length} inhabited continent centers`);
    if (centers.length < 2) {
      console.log(`[ContinentsPP] Need at least 2 inhabited continents for corridors, skipping`);
      return { chainsAdded: 0, islandsAdded: 0, tilesConverted: 0 };
    }

    // Log centers
    for (const c of centers) {
      console.log(`[ContinentsPP]   Continent ${c.id} center: (${c.x}, ${c.y})`);
    }

    // Configuration
    const CORRIDOR_WIDTH = 8;              // Tiles from center line to consider
    const MIN_DIST_FROM_LAND = 3;          // Don't place too close to continents
    const MAX_DIST_FROM_LAND = 15;         // Don't place too far (that's open ocean's job)
    const CHAIN_LENGTH_MIN = 3;
    const CHAIN_LENGTH_MAX = 6;
    const CHAINS_PER_CORRIDOR = 2;         // Target chains per continent pair
    const ISLAND_SIZE_MIN = 3;             // Proper islands, not atolls
    const ISLAND_SIZE_MAX = 6;

    // Collect all land positions for distance checking (use tiles array, not GameplayMap)
    const landPositions = [];
    for (let y = 0; y < iHeight; y++) {
      for (let x = 0; x < iWidth; x++) {
        const tile = tiles[y]?.[x];
        if (tile && tile.isLand()) {
          landPositions.push({ x, y });
        }
      }
    }

    // Distance to nearest land (with wrap)
    const distanceToLand = (x, y) => {
      let minDist = Infinity;
      for (const land of landPositions) {
        let dx = Math.abs(x - land.x);
        if (dx > iWidth / 2) dx = iWidth - dx;
        const dy = Math.abs(y - land.y);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) minDist = dist;
      }
      return minDist;
    };

    // Find corridor tiles for each continent pair
    const corridorTiles = []; // Array of {x, y, corridorId}
    let corridorId = 0;

    for (let i = 0; i < centers.length; i++) {
      for (let j = i + 1; j < centers.length; j++) {
        const c1 = centers[i];
        const c2 = centers[j];

        console.log(`[ContinentsPP] Scanning corridor between continent ${c1.id} and ${c2.id}`);

        const thisCorridor = [];
        for (let y = 2; y < iHeight - 2; y++) {
          for (let x = 0; x < iWidth; x++) {
            const tile = tiles[y]?.[x];
            if (!tile || tile.isLand()) continue;  // Skip land tiles
            if (tile.terrainType !== TerrainType.Ocean) continue;  // Only deep ocean

            // Check distance to corridor line
            const distToLine = distanceToLineSegmentWrapped(x, y, c1.x, c1.y, c2.x, c2.y, iWidth);
            if (distToLine > CORRIDOR_WIDTH) continue;

            // Check distance to land
            const distLand = distanceToLand(x, y);
            if (distLand < MIN_DIST_FROM_LAND || distLand > MAX_DIST_FROM_LAND) continue;

            thisCorridor.push({ x, y, corridorId, distToLine, distLand });
          }
        }

        console.log(`[ContinentsPP]   Found ${thisCorridor.length} candidate tiles in corridor`);
        corridorTiles.push(...thisCorridor);
        corridorId++;
      }
    }

    // Now create island chains
    let chainsAdded = 0;
    let islandsAdded = 0;
    let tilesConverted = 0;
    const usedPositions = new Set();

    // Group by corridor and sort by distance along corridor for chain formation
    const corridorGroups = new Map();
    for (const tile of corridorTiles) {
      if (!corridorGroups.has(tile.corridorId)) {
        corridorGroups.set(tile.corridorId, []);
      }
      corridorGroups.get(tile.corridorId).push(tile);
    }

    for (const [cid, tiles] of corridorGroups) {
      // Shuffle tiles for randomness
      for (let i = tiles.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
      }

      let chainsInCorridor = 0;
      let tileIndex = 0;

      while (chainsInCorridor < CHAINS_PER_CORRIDOR && tileIndex < tiles.length) {
        const startTile = tiles[tileIndex++];
        const startKey = `${startTile.x},${startTile.y}`;

        // Check if too close to existing islands
        let tooClose = false;
        for (const used of usedPositions) {
          const [ux, uy] = used.split(',').map(Number);
          let dx = Math.abs(startTile.x - ux);
          if (dx > iWidth / 2) dx = iWidth - dx;
          const dy = Math.abs(startTile.y - uy);
          if (Math.sqrt(dx * dx + dy * dy) < 5) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;

        // Create a chain starting from this tile
        const chainLength = randomInt(random, CHAIN_LENGTH_MIN, CHAIN_LENGTH_MAX);
        const chain = [{ x: startTile.x, y: startTile.y }];

        // Pick a general direction for the chain (roughly along corridor)
        const directions = [
          { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
          { dx: 1, dy: 1 }, { dx: -1, dy: -1 },
          { dx: 1, dy: -1 }, { dx: -1, dy: 1 },
          { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
        ];
        const primaryDir = directions[Math.floor(random() * directions.length)];

        // Grow the chain
        for (let c = 1; c < chainLength; c++) {
          const last = chain[chain.length - 1];

          // Try to continue in primary direction with some variance
          const candidates = [];
          for (const dir of directions) {
            // Prefer primary direction
            const alignment = dir.dx * primaryDir.dx + dir.dy * primaryDir.dy;
            if (alignment < 0) continue; // Skip opposite directions

            const nx = (last.x + dir.dx * 2 + iWidth) % iWidth; // Skip one tile for spacing
            const ny = last.y + dir.dy * 2;

            if (ny < 2 || ny >= iHeight - 2) continue;

            const tile = tiles[ny]?.[nx];
            if (!tile || tile.isLand()) continue;  // Skip if land or out of bounds

            const key = `${nx},${ny}`;
            if (usedPositions.has(key)) continue;
            if (chain.some(t => t.x === nx && t.y === ny)) continue;

            candidates.push({ x: nx, y: ny, alignment });
          }

          if (candidates.length === 0) break;

          // Weight by alignment
          candidates.sort((a, b) => b.alignment - a.alignment);
          const pick = candidates[Math.floor(random() * Math.min(3, candidates.length))];
          chain.push(pick);
        }

        // Convert chain tiles to land (each island in chain is 3-6 tiles)
        let islandTilesThisChain = 0;
        for (const islandCenter of chain) {
          const islandSize = randomInt(random, ISLAND_SIZE_MIN, ISLAND_SIZE_MAX);
          const islandTiles = [{ x: islandCenter.x, y: islandCenter.y }];

          // Grow island outward from center (proper island, not atoll)
          for (let t = 1; t < islandSize; t++) {
            // Pick a random existing tile to grow from
            const growFrom = islandTiles[Math.floor(random() * islandTiles.length)];
            const growDirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

            // Shuffle for variety
            for (let i = growDirs.length - 1; i > 0; i--) {
              const j = Math.floor(random() * (i + 1));
              [growDirs[i], growDirs[j]] = [growDirs[j], growDirs[i]];
            }

            for (const dir of growDirs) {
              const nx = (growFrom.x + dir[0] + iWidth) % iWidth;
              const ny = growFrom.y + dir[1];

              if (ny < 2 || ny >= iHeight - 2) continue;

              // Check not already in island
              if (islandTiles.some(it => it.x === nx && it.y === ny)) continue;

              // Check valid terrain (must be water to expand into)
              const tile = tiles[ny]?.[nx];
              if (tile && !tile.isLand()) {
                islandTiles.push({ x: nx, y: ny });
                break;
              }
            }
          }

          // Place the island tiles
          for (const it of islandTiles) {
            const key = `${it.x},${it.y}`;
            if (usedPositions.has(key)) continue;

            try {
              TerrainBuilder.setTerrainType(it.x, it.y, globals.g_FlatTerrain);
              TerrainBuilder.addPlotTag(it.x, it.y, PlotTags.PLOT_TAG_ISLAND);
              // Corridor islands between homelands = WEST (homeland waters)
              TerrainBuilder.setLandmassRegionId(it.x, it.y, LandmassRegion.LANDMASS_REGION_WEST);
              usedPositions.add(key);
              tilesConverted++;
              islandTilesThisChain++;
            } catch (e) {
              // Skip on error
            }
          }
          islandsAdded++;
        }

        chainsAdded++;
        chainsInCorridor++;
        console.log(`[ContinentsPP]   Chain ${chainsAdded}: ${chain.length} islands, ${islandTilesThisChain || chain.length} tiles at (${startTile.x}, ${startTile.y})`);
      }

      if (chainsInCorridor > 0) {
        console.log(`[ContinentsPP]   Corridor ${cid}: ${chainsInCorridor} chains created from ${tiles.length} candidates`);
      }
    }

    console.log(`[ContinentsPP]`);
    console.log(`[ContinentsPP] CORRIDOR ISLAND SUMMARY:`);
    console.log(`[ContinentsPP]   Total chains: ${chainsAdded}`);
    console.log(`[ContinentsPP]   Total islands: ${islandsAdded}`);
    console.log(`[ContinentsPP]   Total tiles: ${tilesConverted}`);
    console.log(`[ContinentsPP]   Avg tiles/island: ${islandsAdded > 0 ? (tilesConverted / islandsAdded).toFixed(1) : 0}`);
    return { chainsAdded, islandsAdded, tilesConverted };

  } catch (error) {
    console.log(`[ContinentsPP] ERROR in addCorridorIslands: ${error.message}`);
    console.log(`[ContinentsPP] Stack: ${error.stack}`);
    return { chainsAdded: 0, islandsAdded: 0, tilesConverted: 0 };
  }
}

/**
 * Adds small islands in large empty ocean areas
 * Scans for ocean tiles far from land and randomly converts some to islands
 * Only runs 40-60% of the time for map variety
 */
function addOpenOceanIslands(iWidth, iHeight, mapSeed, continentIsInhabited, majorContinentKdTree, tiles) {
  try {
    const random = createSeededRandom(mapSeed + 12345);  // Different seed offset for variety

    console.log(`[ContinentsPP] === OPEN OCEAN ISLAND CHAINS ===`);

    // Scale configuration with map size
    const mapArea = iWidth * iHeight;
    const scaleFactor = Math.sqrt(mapArea / 4000);  // Normalize to standard map

    // Configuration - ALWAYS runs, creates proper island chains
    const MIN_DISTANCE_FROM_LAND = 6;                              // Minimum tiles from nearest land
    const OPTIMAL_DISTANCE_FROM_LAND = 10;                         // Preferred distance for spawning
    const MIN_SPACING_BETWEEN_CHAINS = 8;                          // Space between different chains
    const MAX_CHAINS = Math.floor(8 * scaleFactor);                // ~8 chains on standard map
    const CHAIN_LENGTH_MIN = 3;                                    // Minimum islands per chain
    const CHAIN_LENGTH_MAX = 7;                                    // Maximum islands per chain
    const ISLAND_SPACING_MIN = 2;                                  // Min tiles between islands in chain
    const ISLAND_SPACING_MAX = 4;                                  // Max tiles between islands in chain
    const SINGLE_ATOLL_CHANCE = 0.15;                              // 15% chance for single atolls (prefer chains)

    console.log(`[ContinentsPP] Config: max ${MAX_CHAINS} chains, ${CHAIN_LENGTH_MIN}-${CHAIN_LENGTH_MAX} islands each`);

    // Collect all land tile positions for distance checking
    const landPositions = [];
    for (let y = 0; y < iHeight; y++) {
      for (let x = 0; x < iWidth; x++) {
        const tile = tiles[y]?.[x];
        if (tile && tile.isLand()) {
          landPositions.push({ x, y });
        }
      }
    }

    // Distance function with wrap awareness
    const distanceToLand = (x, y) => {
      let minDist = Infinity;
      for (const land of landPositions) {
        let dx = Math.abs(x - land.x);
        if (dx > iWidth / 2) dx = iWidth - dx;
        const dy = Math.abs(y - land.y);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) minDist = dist;
      }
      return minDist;
    };

    // Distance between two points with wrap
    const distanceBetween = (x1, y1, x2, y2) => {
      let dx = Math.abs(x1 - x2);
      if (dx > iWidth / 2) dx = iWidth - dx;
      const dy = Math.abs(y1 - y2);
      return Math.sqrt(dx * dx + dy * dy);
    };

    // Find candidate ocean tiles (deep ocean, far from land)
    // Rules:
    // - Truly deep ocean (15+ tiles from land): ALLOW (not a stepping stone)
    // - Near distant lands (< 15 tiles): SKIP (would be stepping stone)
    // - Near inhabited lands (< 15 tiles): ALLOW (homeland waters)
    const TRULY_DEEP_OCEAN = 15;  // Beyond this, it's middle-of-nowhere ocean
    const deepOceanTiles = [];
    let skippedNearDistant = 0;
    let trulyDeepOcean = 0;

    for (let y = 3; y < iHeight - 3; y++) {  // Avoid polar regions
      for (let x = 0; x < iWidth; x++) {
        const tile = tiles[y]?.[x];
        if (tile && !tile.isLand() && tile.terrainType === TerrainType.Ocean) {
          const dist = distanceToLand(x, y);
          if (dist >= MIN_DISTANCE_FROM_LAND) {
            // Truly deep ocean - allow regardless of nearest continent
            if (dist >= TRULY_DEEP_OCEAN) {
              trulyDeepOcean++;
              deepOceanTiles.push({ x, y, dist, priority: 3 });  // Highest priority
              continue;
            }

            // Not truly deep - check if near inhabited or distant lands
            let isNearInhabited = false;
            try {
              const searchPos = { x, y };
              const searchResult = majorContinentKdTree.search(searchPos);
              if (searchResult && searchResult.data && searchResult.data.landmassId) {
                isNearInhabited = continentIsInhabited.get(searchResult.data.landmassId) ?? false;
              }
            } catch (e) {
              isNearInhabited = false;
            }

            if (!isNearInhabited) {
              skippedNearDistant++;
              continue;  // Don't create stepping stones to distant lands
            }

            // Near inhabited continent - allow (homeland waters)
            const priority = dist >= OPTIMAL_DISTANCE_FROM_LAND ? 2 : 1;
            deepOceanTiles.push({ x, y, dist, priority });
          }
        }
      }
    }

    console.log(`[ContinentsPP] Found ${trulyDeepOcean} truly deep ocean tiles (${TRULY_DEEP_OCEAN}+ from land)`);
    console.log(`[ContinentsPP] Skipped ${skippedNearDistant} tiles near distant lands`);

    // Sort by priority (optimal distance first) then shuffle within priority
    deepOceanTiles.sort((a, b) => b.priority - a.priority || random() - 0.5);

    console.log(`[ContinentsPP] Found ${deepOceanTiles.length} deep ocean candidates (${MIN_DISTANCE_FROM_LAND}+ tiles from land)`);

    if (deepOceanTiles.length === 0) {
      console.log(`[ContinentsPP] No suitable ocean tiles found for island chains`);
      return { islandsAdded: 0, tilesConverted: 0, chainsAdded: 0 };
    }

    // Track all created islands to avoid overlaps
    const usedPositions = new Set();
    const chainCenters = [];  // Track chain starting points

    let chainsAdded = 0;
    let islandsAdded = 0;
    let tilesConverted = 0;

    // Helper: check if position is valid for new island
    const isValidPosition = (x, y, minSpacing = 2) => {
      if (y < 3 || y >= iHeight - 3) return false;
      const tile = tiles[y]?.[x];
      if (!tile || tile.isLand()) return false;  // Must be water
      for (const used of usedPositions) {
        const [ux, uy] = used.split(',').map(Number);
        if (distanceBetween(x, y, ux, uy) < minSpacing) return false;
      }
      return true;
    };

    // Helper: create a single island tile
    const createIslandTile = (x, y) => {
      try {
        TerrainBuilder.setTerrainType(x, y, globals.g_FlatTerrain);
        TerrainBuilder.addPlotTag(x, y, PlotTags.PLOT_TAG_ISLAND);

        // Determine WEST/EAST based on nearest major continent
        let isNearInhabited = false;
        try {
          const searchPos = { x, y };
          const searchResult = majorContinentKdTree.search(searchPos);
          if (searchResult && searchResult.data && searchResult.data.landmassId) {
            isNearInhabited = continentIsInhabited.get(searchResult.data.landmassId) ?? false;
          }
        } catch (e) {
          isNearInhabited = false;
        }

        if (isNearInhabited) {
          TerrainBuilder.setLandmassRegionId(x, y, LandmassRegion.LANDMASS_REGION_WEST);
        } else {
          TerrainBuilder.setLandmassRegionId(x, y, LandmassRegion.LANDMASS_REGION_EAST);
        }

        usedPositions.add(`${x},${y}`);
        return true;
      } catch (e) {
        return false;
      }
    };

    // Create island chains
    for (const startTile of deepOceanTiles) {
      if (chainsAdded >= MAX_CHAINS) break;

      // Check if too close to existing chain centers
      let tooCloseToChain = false;
      for (const center of chainCenters) {
        if (distanceBetween(startTile.x, startTile.y, center.x, center.y) < MIN_SPACING_BETWEEN_CHAINS) {
          tooCloseToChain = true;
          break;
        }
      }
      if (tooCloseToChain) continue;

      // Determine chain type: full chain or small isolated island
      const isSmallIsland = random() < SINGLE_ATOLL_CHANCE;

      if (isSmallIsland) {
        // Create small isolated island (3-6 tiles in a cluster)
        if (isValidPosition(startTile.x, startTile.y)) {
          const islandSize = randomInt(random, 3, 6);
          const islandTiles = [{ x: startTile.x, y: startTile.y }];

          // Grow island outward from center
          for (let t = 1; t < islandSize; t++) {
            // Pick a random existing tile to grow from
            const growFrom = islandTiles[Math.floor(random() * islandTiles.length)];
            const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

            // Shuffle directions for variety
            for (let i = dirs.length - 1; i > 0; i--) {
              const j = Math.floor(random() * (i + 1));
              [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
            }

            for (const dir of dirs) {
              const nx = (growFrom.x + dir[0] + iWidth) % iWidth;
              const ny = growFrom.y + dir[1];
              const key = `${nx},${ny}`;

              // Check not already in island and valid position
              if (!islandTiles.some(it => it.x === nx && it.y === ny) &&
                  isValidPosition(nx, ny, 1)) {
                islandTiles.push({ x: nx, y: ny });
                break;
              }
            }
          }

          // Create all tiles in the island cluster
          if (islandTiles.length >= 3) {
            for (const it of islandTiles) {
              if (createIslandTile(it.x, it.y)) {
                tilesConverted++;
              }
            }
            islandsAdded++;
            chainCenters.push({ x: startTile.x, y: startTile.y });
            chainsAdded++;
            console.log(`[ContinentsPP]   Small island: ${islandTiles.length} tiles at (${startTile.x}, ${startTile.y})`);
          }
        }
      } else {
        // Create island chain
        const chainLength = randomInt(random, CHAIN_LENGTH_MIN, CHAIN_LENGTH_MAX);

        // Choose chain direction (with some randomness)
        // Prefer east-west or diagonal for natural archipelago look
        const baseAngle = random() * Math.PI * 2;
        const angleVariance = Math.PI / 6;  // 30 degrees variance

        const chainIslands = [];
        let currentX = startTile.x;
        let currentY = startTile.y;

        for (let i = 0; i < chainLength; i++) {
          if (isValidPosition(currentX, currentY)) {
            chainIslands.push({ x: currentX, y: currentY });

            // Calculate next island position
            const angle = baseAngle + (random() - 0.5) * angleVariance;
            const spacing = randomInt(random, ISLAND_SPACING_MIN, ISLAND_SPACING_MAX);
            const nextX = (currentX + Math.round(Math.cos(angle) * spacing) + iWidth) % iWidth;
            const nextY = currentY + Math.round(Math.sin(angle) * spacing);

            // Clamp Y to valid range
            currentX = nextX;
            currentY = Math.max(3, Math.min(iHeight - 4, nextY));
          } else {
            break;  // Can't continue chain
          }
        }

        // Only count as chain if we got at least 2 islands
        if (chainIslands.length >= 2) {
          for (const island of chainIslands) {
            if (createIslandTile(island.x, island.y)) {
              tilesConverted++;
              islandsAdded++;

              // Add small cluster around some islands (30% chance)
              if (random() < 0.3) {
                const clusterDirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                const dir = clusterDirs[Math.floor(random() * clusterDirs.length)];
                const cx = (island.x + dir[0] + iWidth) % iWidth;
                const cy = island.y + dir[1];
                if (isValidPosition(cx, cy, 1)) {
                  if (createIslandTile(cx, cy)) {
                    tilesConverted++;
                  }
                }
              }
            }
          }

          chainCenters.push({ x: startTile.x, y: startTile.y });
          chainsAdded++;
          console.log(`[ContinentsPP]   Chain ${chainsAdded}: ${chainIslands.length} islands at (${startTile.x}, ${startTile.y})`);
        }
      }
    }

    console.log(`[ContinentsPP]`);
    console.log(`[ContinentsPP] OPEN OCEAN ISLAND SUMMARY:`);
    console.log(`[ContinentsPP]   Total chains: ${chainsAdded}`);
    console.log(`[ContinentsPP]   Total islands: ${islandsAdded}`);
    console.log(`[ContinentsPP]   Total tiles: ${tilesConverted}`);
    console.log(`[ContinentsPP]   Avg tiles/island: ${islandsAdded > 0 ? (tilesConverted / islandsAdded).toFixed(1) : 0}`);
    return { islandsAdded, tilesConverted, chainsAdded };
  } catch (error) {
    console.log(`[ContinentsPP] ERROR in addOpenOceanIslands: ${error.message}`);
    console.log(`[ContinentsPP] Stack: ${error.stack}`);
    return { islandsAdded: 0, tilesConverted: 0, chainsAdded: 0 };
  }
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
  // Target: ~60-65% water, multiple distinct continents with island chains
  0: {
    name: 'TINY',
    landmassCount: { min: 3, max: 4 },
    totalLandmassSize: { min: 26, max: 32 },      // Moderate increase, room for islands
    erosionPercent: { min: 8, max: 12 },
    // Coastal islands (attached - cosmetic)
    coastalIslands: { min: 15, max: 25 },
    coastalIslandSize: { min: 0.2, max: 0.5 },
    coastalSizeVariance: { min: 0.8, max: 1.2 },
    // Ocean islands - MODERATE (should NOT rival continents in size!)
    islandTotalSize: { min: 6, max: 12 },         // Much smaller - islands should be SMALL
    islandVariance: { min: 3, max: 6 },           // Low variance = consistent small islands
    islandDistance: { min: 2, max: 3 },           // Spread out
    landmassDistance: { min: 2, max: 3 },         // Not too close to continents
    islandMinSize: { min: 0.1, max: 0.2 },        // Small islands
    islandMaxSize: { min: 0.5, max: 1.0 },        // Cap to prevent mega-islands
    mountainPercent: { min: 10, max: 14 },
    mountainRandomize: { min: 25, max: 45 },
    continentSeparation: { min: 6, max: 8 },      // Increased to prevent landmass touching
    separationFalloff: { min: 4, max: 6 },
  },

  // Index 1: SMALL (4-6 players)
  1: {
    name: 'SMALL',
    landmassCount: { min: 3, max: 5 },
    totalLandmassSize: { min: 28, max: 36 },      // Moderate increase, room for islands
    erosionPercent: { min: 10, max: 14 },
    // Coastal islands (attached - cosmetic)
    coastalIslands: { min: 18, max: 30 },
    coastalIslandSize: { min: 0.25, max: 0.55 },
    coastalSizeVariance: { min: 0.8, max: 1.3 },
    // Ocean islands - MODERATE
    islandTotalSize: { min: 8, max: 15 },         // Keep islands smaller than continents
    islandVariance: { min: 4, max: 8 },
    islandDistance: { min: 2, max: 3 },
    landmassDistance: { min: 2, max: 3 },
    islandMinSize: { min: 0.1, max: 0.25 },
    islandMaxSize: { min: 0.6, max: 1.2 },
    mountainPercent: { min: 10, max: 15 },
    mountainRandomize: { min: 25, max: 45 },
    continentSeparation: { min: 6, max: 8 },      // Increased to prevent landmass touching
    separationFalloff: { min: 4, max: 6 },
  },

  // Index 2: STANDARD (6-8 players)
  2: {
    name: 'STANDARD',
    landmassCount: { min: 4, max: 5 },
    totalLandmassSize: { min: 30, max: 40 },      // Moderate increase, room for islands
    erosionPercent: { min: 12, max: 16 },
    // Coastal islands (attached to continents - cosmetic)
    coastalIslands: { min: 20, max: 35 },
    coastalIslandSize: { min: 0.25, max: 0.6 },
    coastalSizeVariance: { min: 0.8, max: 1.4 },
    // Ocean islands - MODERATE (islands should enhance, not dominate)
    islandTotalSize: { min: 10, max: 18 },        // Keep total island area small
    islandVariance: { min: 5, max: 10 },          // Moderate variance
    islandDistance: { min: 2, max: 4 },           // Space between island chains
    landmassDistance: { min: 2, max: 4 },         // Keep islands distinct from continents
    islandMinSize: { min: 0.15, max: 0.3 },       // Small individual islands
    islandMaxSize: { min: 0.8, max: 1.5 },        // Cap to prevent mega-islands
    mountainPercent: { min: 11, max: 15 },
    mountainRandomize: { min: 30, max: 50 },
    continentSeparation: { min: 7, max: 9 },      // Increased to prevent landmass touching
    separationFalloff: { min: 4, max: 7 },
  },

  // Index 3: LARGE (8-10 players)
  3: {
    name: 'LARGE',
    landmassCount: { min: 4, max: 6 },
    totalLandmassSize: { min: 34, max: 45 },      // Moderate increase, room for islands
    erosionPercent: { min: 14, max: 18 },
    // Coastal islands (attached - cosmetic)
    coastalIslands: { min: 25, max: 40 },
    coastalIslandSize: { min: 0.28, max: 0.65 },
    coastalSizeVariance: { min: 0.9, max: 1.5 },
    // Ocean islands - MODERATE
    islandTotalSize: { min: 12, max: 22 },        // Reasonable island coverage
    islandVariance: { min: 6, max: 12 },
    islandDistance: { min: 2, max: 4 },
    landmassDistance: { min: 2, max: 4 },
    islandMinSize: { min: 0.15, max: 0.35 },
    islandMaxSize: { min: 1.0, max: 1.8 },
    mountainPercent: { min: 11, max: 16 },
    mountainRandomize: { min: 30, max: 50 },
    continentSeparation: { min: 7, max: 10 },     // Increased to prevent landmass touching
    separationFalloff: { min: 5, max: 7 },
  },

  // Index 4: HUGE (10-12 players)
  4: {
    name: 'HUGE',
    landmassCount: { min: 5, max: 7 },
    totalLandmassSize: { min: 38, max: 50 },      // Moderate increase, room for islands
    erosionPercent: { min: 16, max: 20 },
    // Coastal islands (attached - cosmetic)
    coastalIslands: { min: 30, max: 50 },
    coastalIslandSize: { min: 0.3, max: 0.7 },
    coastalSizeVariance: { min: 0.9, max: 1.5 },
    // Ocean islands - MODERATE (should not rival continents!)
    islandTotalSize: { min: 15, max: 28 },        // Reasonable - less than one continent
    islandVariance: { min: 8, max: 15 },
    islandDistance: { min: 2, max: 4 },
    landmassDistance: { min: 2, max: 4 },
    islandMinSize: { min: 0.2, max: 0.4 },
    islandMaxSize: { min: 1.2, max: 2.0 },        // Cap to prevent mega-islands
    mountainPercent: { min: 12, max: 17 },
    mountainRandomize: { min: 30, max: 55 },
    continentSeparation: { min: 8, max: 11 },     // Increased to prevent landmass touching
    separationFalloff: { min: 5, max: 8 },
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

  // Randomize island size range (allows mix of tiny 1-4 tile AND chunky islands)
  const islandMinSize = randomRange(random,
    baseConfig.islandMinSize.min,
    baseConfig.islandMinSize.max
  );
  const coastalSizeVariance = randomRange(random,
    baseConfig.coastalSizeVariance.min,
    baseConfig.coastalSizeVariance.max
  );

  // Generate landmass configurations for each continent
  const landmassConfigs = [];
  for (let i = 0; i < landmassCount; i++) {
    const erosion = randomInt(random, baseConfig.erosionPercent.min, baseConfig.erosionPercent.max);
    const coastalIslands = randomInt(random, baseConfig.coastalIslands.min, baseConfig.coastalIslands.max);

    landmassConfigs.push({
      erosionPercent: erosion,
      coastalIslands: coastalIslands,
      coastalIslandsSize: coastalIslandSize * (0.8 + random() * 0.4),  // Slight variation per continent
      coastalIslandsSizeVariance: coastalSizeVariance,  // Randomized: high = mix of tiny & chunky
      coastalIslandsMinDistance: 1,                     // Close to coast for reliable spawning
      coastalIslandsMaxDistance: 2 + mapSizeIndex,      // Spread based on map size (3-6 tiles)
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
      minSize: islandMinSize,                   // Randomized: low = tiny 1-4 tile islands possible
      maxSize: islandMaxSize,                   // Randomized: high = chunky islands possible
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
  console.log(`[ContinentsPP] Island spacing: islandDist=${config.island.islandDistance}, landmassDist=${config.island.landmassDistance}`);
  console.log(`[ContinentsPP] Island sizes: min=${config.island.minSize.toFixed(2)}, max=${config.island.maxSize.toFixed(1)}, variance=${config.island.variance.toFixed(1)}`);
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
    console.log(`[ContinentsPP] Landmass ${i+1}: erosion=${landmassConfig.erosionPercent}%, coastalIslands=${landmassConfig.coastalIslands}, size=${landmassConfig.coastalIslandsSize?.toFixed(2)}, minDist=${landmassConfig.coastalIslandsMinDistance}, maxDist=${landmassConfig.coastalIslandsMaxDistance}`);
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
    console.log(`[ContinentsPP] Island settings applied: totalSize=${generatorSettings.island.totalSize}, variance=${generatorSettings.island.variance}, minSize=${generatorSettings.island.minSize}, maxSize=${generatorSettings.island.maxSize}`);
  } else {
    console.log(`[ContinentsPP] WARNING: generatorSettings.island is undefined!`);
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

  // Track stats for final summary (populated during terrain application)
  let mapStats = {
    islandCount: 0,
    islandTiles: 0,
    islandsNearHomeland: 0,
    islandsNearDistant: 0,
    islandTilesNearHomeland: 0,
    islandTilesNearDistant: 0,
    homelandCount: 0,
    distantLandCount: 0,
    continentTiles: 0,
    corridorChains: 0,        // Island chains between homelands
    corridorIslands: 0,       // Individual islands in corridor chains
    corridorTiles: 0,         // Tiles in corridor islands
    openOceanChains: 0,       // Island chains in open ocean
    openOceanIslands: 0,      // Added by post-processing
    openOceanIslandTiles: 0
  };

  // Retrieve base map parameters
  const aliveMajorIds = Players.getAliveMajorIds();
  const iTotalPlayers = aliveMajorIds.length;
  const iNumNaturalWonders = mapInfo.NumNaturalWonders;
  const iTilesPerLake = mapInfo.LakeGenerationFrequency;
  const mapSizeIndex = mapInfo.$index;

  // Identify human players for priority separation across continents
  const humanPlayerIds = aliveMajorIds.filter(id => Players.isHuman(id));
  const aiPlayerIds = aliveMajorIds.filter(id => Players.isAI(id));
  const humanCount = humanPlayerIds.length;
  const aiCount = aiPlayerIds.length;

  console.log(`[ContinentsPP] Map size: ${MAP_SIZE_CONFIGS[mapSizeIndex]?.name || 'UNKNOWN'} (index: ${mapSizeIndex})`);
  console.log(`[ContinentsPP] Dimensions: ${iWidth}x${iHeight}`);
  console.log(`[ContinentsPP] Total players: ${iTotalPlayers} (${humanCount} human, ${aiCount} AI)`);

  // Read player distribution mode from game setup options
  // Mode 0: Clustered (default) - humans on same/nearby continents
  // Mode 1: Spread - humans on different continents, preserve distant lands
  // Mode 2: Random - no special human handling
  let playerDistributionMode = 0;
  try {
    const configValue = Configuration.getMapValue("ContinentsPPPlayerDistribution");
    if (configValue !== undefined && configValue !== null) {
      playerDistributionMode = parseInt(configValue, 10) || 0;
    }
  } catch (e) {
    console.log(`[ContinentsPP] Could not read player distribution config: ${e.message}`);
  }

  const DISTRIBUTION_MODE_NAMES = ['Clustered', 'Spread', 'Random'];
  console.log(`[ContinentsPP] Player Distribution Mode: ${playerDistributionMode} (${DISTRIBUTION_MODE_NAMES[playerDistributionMode] || 'Unknown'})`);

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

  // SIZE-AWARE PLAYER DISTRIBUTION
  // Small continents get max 2 civs, overflow goes to larger continents
  // This ensures players aren't crammed together on small landmasses
  const landmassCount = generatorSettings.landmass.length;

  console.log(`[ContinentsPP] === SIZE-AWARE PLAYER DISTRIBUTION ===`);

  // Reserve at least 1 continent as uninhabited (distant lands)
  const continentsForPlayers = Math.max(1, landmassCount - 1);
  const distantLandContinents = landmassCount - continentsForPlayers;
  console.log(`[ContinentsPP] Reserving ${distantLandContinents} continent(s) as Distant Lands (uninhabited)`);

  // Gather continent sizes (set by applySettings during init)
  // These are relative size values that determine how many tiles each continent gets
  const continentInfo = [];
  for (let i = 0; i < continentsForPlayers; i++) {
    const size = generatorSettings.landmass[i].size || 1;
    continentInfo.push({
      index: i,
      size: size,
      maxPlayers: 0,      // Will be calculated
      assignedPlayers: 0  // Will be assigned
    });
  }

  // Calculate total and average size
  const totalSize = continentInfo.reduce((sum, c) => sum + c.size, 0);
  const avgSize = totalSize / continentInfo.length;

  // Sort by size descending (largest first for distribution)
  continentInfo.sort((a, b) => b.size - a.size);

  // Log sizes
  console.log(`[ContinentsPP] Continent sizes (avg=${avgSize.toFixed(2)}):`);
  for (const c of continentInfo) {
    const sizeRatio = c.size / avgSize;
    console.log(`[ContinentsPP]   Continent ${c.index + 1}: size=${c.size.toFixed(2)}, ratio=${sizeRatio.toFixed(2)}x avg`);
  }

  // Determine max players per continent based on relative size
  // Small continents (< 70% of avg) get max 2 civs
  // Very small (< 50% of avg) get max 1 civ
  // Medium/large get proportional capacity
  const SIZE_RATIO_FOR_1_CIV = 0.50;   // Below 50% of avg = max 1 civ
  const SIZE_RATIO_FOR_2_CIVS = 0.70;  // Below 70% of avg = max 2 civs
  const SIZE_RATIO_FOR_3_CIVS = 0.90;  // Below 90% of avg = max 3 civs

  let totalCapacity = 0;
  for (const continent of continentInfo) {
    const sizeRatio = continent.size / avgSize;

    if (sizeRatio < SIZE_RATIO_FOR_1_CIV) {
      continent.maxPlayers = 1;
    } else if (sizeRatio < SIZE_RATIO_FOR_2_CIVS) {
      continent.maxPlayers = 2;
    } else if (sizeRatio < SIZE_RATIO_FOR_3_CIVS) {
      continent.maxPlayers = 3;
    } else {
      // Large continents: scale with size, minimum 3, cap at reasonable max
      continent.maxPlayers = Math.min(6, Math.max(3, Math.floor(sizeRatio * 3)));
    }
    totalCapacity += continent.maxPlayers;
  }

  console.log(`[ContinentsPP] Capacity by size: ${continentInfo.map(c => `C${c.index + 1}:max${c.maxPlayers}`).join(', ')}`);
  console.log(`[ContinentsPP] Total capacity: ${totalCapacity}, Players to place: ${iTotalPlayers}`);

  //────────────────────────────────────────────────────────────────────────────
  // PLAYER DISTRIBUTION: Based on playerDistributionMode setting
  // Mode 0: Clustered - humans on same/nearby continents (cooperative)
  // Mode 1: Spread - humans on different continents, preserve distant lands (competitive)
  // Mode 2: Random - proportional distribution, no human priority (chaos)
  //────────────────────────────────────────────────────────────────────────────

  console.log(`[ContinentsPP] === PLAYER DISTRIBUTION (Mode ${playerDistributionMode}: ${DISTRIBUTION_MODE_NAMES[playerDistributionMode]}) ===`);
  console.log(`[ContinentsPP] Human players: ${humanCount}, AI players: ${aiCount}, Available continents: ${continentInfo.length}`);

  // Track which continents have been assigned human players
  const continentsWithHumans = new Set();
  let remainingPlayers = iTotalPlayers;

  if (playerDistributionMode === 0 && humanCount > 0) {
    //──────────────────────────────────────────────────────────────────────────
    // MODE 0: CLUSTERED - Humans on minimum number of nearby continents
    // Fill largest continent first, overflow to next largest only when needed
    // Maximizes distant lands for shared exploration
    //──────────────────────────────────────────────────────────────────────────
    console.log(`[ContinentsPP] Clustered: Grouping humans on fewest continents possible`);

    let humansToAssign = humanCount;
    let aisToAssign = aiCount;

    // Assign humans to minimum number of continents (largest first)
    // Only move to next continent when current is full
    for (const continent of continentInfo) {
      if (humansToAssign <= 0) break;

      // How many humans can fit on this continent?
      const humansForThis = Math.min(humansToAssign, continent.maxPlayers);
      if (humansForThis > 0) {
        continent.assignedPlayers = humansForThis;
        continent.hasHuman = true;
        continentsWithHumans.add(continent.index);
        humansToAssign -= humansForThis;
        console.log(`[ContinentsPP]   ${humansForThis} human(s) → Continent ${continent.index + 1} (size=${continent.size.toFixed(2)})`);
      }
    }

    // Distribute AIs to fill remaining capacity on inhabited continents first
    // This keeps humans and some AIs together
    for (const continent of continentInfo) {
      if (aisToAssign <= 0) break;
      const availableSlots = continent.maxPlayers - continent.assignedPlayers;
      if (availableSlots > 0) {
        const toAssign = Math.min(availableSlots, aisToAssign);
        continent.assignedPlayers += toAssign;
        aisToAssign -= toAssign;
      }
    }

    // Force remaining AIs onto largest if all continents full
    if (aisToAssign > 0) {
      continentInfo[0].assignedPlayers += aisToAssign;
      aisToAssign = 0;
    }

    const humanContinentCount = continentsWithHumans.size;
    console.log(`[ContinentsPP] Humans clustered on ${humanContinentCount} continent(s): ${[...continentsWithHumans].map(i => i + 1).join(', ')}`);

  } else if (playerDistributionMode === 1 && humanCount > 0) {
    //──────────────────────────────────────────────────────────────────────────
    // MODE 1: SPREAD - Humans on different continents for competitive play
    // ALWAYS preserve at least 1 continent as distant lands
    // RULE: Humans need AI companion UNLESS there's a bridge to another inhabited continent
    // (Corridor islands connect all inhabited continents, so 2+ inhabited = bridges exist)
    //──────────────────────────────────────────────────────────────────────────
    console.log(`[ContinentsPP] Spread: Separating humans across continents (preserving distant lands)`);

    let humansToAssign = humanCount;
    let aisToAssign = aiCount;

    // Calculate max continents for players (always reserve 1 for distant lands)
    const maxInhabitedContinents = Math.max(1, continentInfo.length - 1);
    console.log(`[ContinentsPP]   Max inhabited continents: ${maxInhabitedContinents} (reserving 1 for distant lands)`);

    // Determine if humans can be alone (bridges exist if 2+ inhabited continents)
    // If only 1 continent will be inhabited, humans need AI companions
    const willHaveBridges = humanCount >= 2 || (humanCount === 1 && aiCount >= 1 && maxInhabitedContinents >= 2);

    if (!willHaveBridges && humanCount === 1 && aiCount >= 1) {
      // Single human, need AI companion, no bridges → put both on same continent
      console.log(`[ContinentsPP]   Single human with no bridges possible - adding AI companion`);
      const largestContinent = continentInfo[0];
      largestContinent.assignedPlayers = 2;  // 1 human + 1 AI
      largestContinent.hasHuman = true;
      continentsWithHumans.add(largestContinent.index);
      humansToAssign = 0;
      aisToAssign--;
    } else {
      // Multiple continents will be inhabited → bridges will connect them
      // Humans can be spread across different continents

      // Assign each human to a different continent (up to maxInhabitedContinents)
      let inhabitedCount = 0;
      for (const continent of continentInfo) {
        if (humansToAssign <= 0) break;
        if (inhabitedCount >= maxInhabitedContinents) break;
        if (continent.maxPlayers < 1) continue;

        continent.assignedPlayers = 1;
        continent.hasHuman = true;
        continentsWithHumans.add(continent.index);
        humansToAssign--;
        inhabitedCount++;
        console.log(`[ContinentsPP]   Human → Continent ${continent.index + 1} (size=${continent.size.toFixed(2)})`);
      }

      // If still have humans but hit max continents, add to existing inhabited ones
      if (humansToAssign > 0) {
        console.log(`[ContinentsPP]   ${humansToAssign} human(s) must share (preserving distant lands)`);
        for (const continent of continentInfo) {
          if (humansToAssign <= 0) break;
          if (!continent.hasHuman) continue;
          if (continent.assignedPlayers < continent.maxPlayers) {
            continent.assignedPlayers++;
            humansToAssign--;
          }
        }
        if (humansToAssign > 0) {
          const firstInhabited = continentInfo.find(c => c.hasHuman);
          if (firstInhabited) {
            firstInhabited.assignedPlayers += humansToAssign;
            humansToAssign = 0;
          }
        }
      }
    }

    // Check: if only 1 inhabited continent, ensure human has AI companion
    const inhabitedContinentCount = continentInfo.filter(c => c.assignedPlayers > 0).length;
    if (inhabitedContinentCount === 1 && aisToAssign > 0) {
      const singleInhabited = continentInfo.find(c => c.hasHuman);
      if (singleInhabited && singleInhabited.assignedPlayers === 1) {
        // Human is alone on only inhabited continent - no bridges possible
        console.log(`[ContinentsPP]   WARNING: Human alone on only inhabited continent - adding AI companion`);
        if (singleInhabited.assignedPlayers < singleInhabited.maxPlayers) {
          singleInhabited.assignedPlayers++;
          aisToAssign--;
        }
      }
    }

    // Distribute remaining AIs to inhabited continents (preserve distant lands)
    for (const continent of continentInfo) {
      if (aisToAssign <= 0) break;
      if (continent.assignedPlayers === 0) continue;
      const availableSlots = continent.maxPlayers - continent.assignedPlayers;
      if (availableSlots > 0) {
        const proportional = Math.round(aisToAssign * (continent.size / totalSize));
        const toAssign = Math.min(proportional, availableSlots, aisToAssign);
        if (toAssign > 0) {
          continent.assignedPlayers += toAssign;
          aisToAssign -= toAssign;
        }
      }
    }

    // Fill remaining AI slots on inhabited continents
    while (aisToAssign > 0) {
      let assignedAny = false;
      for (const continent of continentInfo) {
        if (aisToAssign <= 0) break;
        if (continent.assignedPlayers === 0) continue;
        if (continent.assignedPlayers < continent.maxPlayers) {
          continent.assignedPlayers++;
          aisToAssign--;
          assignedAny = true;
        }
      }
      // If inhabited continents full, must use uninhabited (rare edge case)
      if (!assignedAny && aisToAssign > 0) {
        console.log(`[ContinentsPP]   WARNING: Inhabited continents full, ${aisToAssign} AI(s) overflow to other continents`);
        for (const continent of continentInfo) {
          if (aisToAssign <= 0) break;
          if (continent.assignedPlayers < continent.maxPlayers) {
            continent.assignedPlayers++;
            aisToAssign--;
          }
        }
        if (aisToAssign > 0) {
          continentInfo[0].assignedPlayers += aisToAssign;
          aisToAssign = 0;
        }
      }
    }

    const humanContinents = continentInfo.filter(c => c.hasHuman).map(c => c.index + 1);
    const distantLandCount = continentInfo.filter(c => c.assignedPlayers === 0).length;
    console.log(`[ContinentsPP] Humans spread to continents: ${humanContinents.join(', ')}`);
    console.log(`[ContinentsPP] Distant lands preserved: ${distantLandCount} continent(s)`);

  } else {
    //──────────────────────────────────────────────────────────────────────────
    // MODE 2: RANDOM - Proportional distribution, no human priority
    // Maximum unpredictability - humans might be together or apart
    // BUT: Still enforce human+AI rule if no bridges possible
    //──────────────────────────────────────────────────────────────────────────
    console.log(`[ContinentsPP] Random: Proportional distribution (no human priority)`);

    // First pass: proportional distribution by continent size
    for (const continent of continentInfo) {
      if (remainingPlayers <= 0) break;
      const proportional = Math.round(iTotalPlayers * (continent.size / totalSize));
      const toAssign = Math.min(proportional, continent.maxPlayers, remainingPlayers);
      continent.assignedPlayers = toAssign;
      remainingPlayers -= toAssign;
    }

    // Second pass: fill remaining slots
    while (remainingPlayers > 0) {
      let assignedAny = false;
      for (const continent of continentInfo) {
        if (remainingPlayers <= 0) break;
        if (continent.assignedPlayers < continent.maxPlayers) {
          continent.assignedPlayers++;
          remainingPlayers--;
          assignedAny = true;
        }
      }
      if (!assignedAny) {
        continentInfo[0].assignedPlayers += remainingPlayers;
        remainingPlayers = 0;
      }
    }

    // POST-CHECK: With 1 human in Random mode, ensure NO continent has exactly 1 player
    // Because that 1 player could be the human, leaving them isolated
    // Goal: every continent has 0 or 2+ players
    if (humanCount === 1 && iTotalPlayers >= 2) {
      console.log(`[ContinentsPP] Random: 1 human - checking for single-player continents`);

      let fixNeeded = true;
      let iterations = 0;
      const maxIterations = 10;

      while (fixNeeded && iterations < maxIterations) {
        fixNeeded = false;
        iterations++;

        // Find continents with exactly 1 player
        const singlePlayerContinents = continentInfo.filter(c => c.assignedPlayers === 1);
        const multiPlayerContinents = continentInfo.filter(c => c.assignedPlayers >= 2);

        for (const lonely of singlePlayerContinents) {
          console.log(`[ContinentsPP]   Continent ${lonely.index + 1} has only 1 player`);

          // Option 1: Pull a player from a multi-player continent to join the lonely one
          const donor = multiPlayerContinents.find(c => c.assignedPlayers >= 3);
          if (donor) {
            donor.assignedPlayers--;
            lonely.assignedPlayers++;
            console.log(`[ContinentsPP]   Moved player from continent ${donor.index + 1} to ${lonely.index + 1}`);
            fixNeeded = true;
            break;
          }

          // Option 2: Move the lonely player to another continent
          const recipient = continentInfo.find(c =>
            c !== lonely && c.assignedPlayers > 0 && c.assignedPlayers < c.maxPlayers
          );
          if (recipient) {
            lonely.assignedPlayers--;
            recipient.assignedPlayers++;
            console.log(`[ContinentsPP]   Moved player from continent ${lonely.index + 1} to ${recipient.index + 1}`);
            fixNeeded = true;
            break;
          }

          // Option 3: If lonely is on a continent by itself with no options, leave it
          // (This shouldn't happen with normal player counts)
          console.log(`[ContinentsPP]   WARNING: Could not fix single-player continent ${lonely.index + 1}`);
        }
      }

      // Final check
      const remainingSingles = continentInfo.filter(c => c.assignedPlayers === 1);
      if (remainingSingles.length > 0) {
        console.log(`[ContinentsPP] WARNING: ${remainingSingles.length} continent(s) still have only 1 player`);
      } else {
        console.log(`[ContinentsPP] All continents have 0 or 2+ players - human isolation prevented`);
      }
    }

    console.log(`[ContinentsPP] Players distributed proportionally by continent size`);
  }

  // Apply distribution to generatorSettings (restore original index order)
  for (let i = 0; i < landmassCount; i++) {
    const info = continentInfo.find(c => c.index === i);
    if (info) {
      generatorSettings.landmass[i].playerAreas = info.assignedPlayers;
    } else {
      // Distant lands continent
      generatorSettings.landmass[i].playerAreas = 0;
    }
  }

  const playerDistribution = generatorSettings.landmass.map((l, i) => `C${i+1}: ${l.playerAreas}`).join(', ');
  console.log(`[ContinentsPP] Final distribution: ${playerDistribution}`);

  // Log homeland vs distant lands assignment
  console.log(`[ContinentsPP] === HOMELAND / DISTANT LANDS ASSIGNMENT ===`);
  for (let i = 0; i < generatorSettings.landmass.length; i++) {
    const hasPlayers = generatorSettings.landmass[i].playerAreas > 0;
    const region = hasPlayers ? 'WEST (Homeland)' : 'EAST (Distant Lands)';
    const playerCount = generatorSettings.landmass[i].playerAreas;
    const info = continentInfo.find(c => c.index === i);
    const sizeInfo = info ? ` (size=${info.size.toFixed(2)}, max=${info.maxPlayers})` : ' (distant lands)';
    console.log(`[ContinentsPP]   Continent ${i + 1}: ${region} - ${playerCount} player(s)${sizeInfo}`);
  }
  console.log(`[ContinentsPP] Uninhabited continents + their islands = Distant Lands for all players`);

  // DYNAMIC ISLAND ADJUSTMENT: Continents with fewer civs get MORE coastal islands
  // This creates archipelago-rich areas around isolated/lightly-populated continents
  console.log(`[ContinentsPP] === DYNAMIC COASTAL ISLAND ADJUSTMENT ===`);
  for (let i = 0; i < generatorSettings.landmass.length; i++) {
    const playerCount = generatorSettings.landmass[i].playerAreas;
    const baseCoastalIslands = generatorSettings.landmass[i].coastalIslands || 30;
    const baseErosion = generatorSettings.landmass[i].erosionPercent || 12;

    let coastalMultiplier, erosionBoost;

    if (playerCount === 0) {
      // Uninhabited distant lands: LOTS of archipelago islands
      coastalMultiplier = 4.0;  // 4x coastal islands
      erosionBoost = 8;         // More fragmented coastline
    } else if (playerCount === 1) {
      // Single civ: moderate archipelago
      coastalMultiplier = 2.5;  // 2.5x coastal islands
      erosionBoost = 4;
    } else if (playerCount === 2) {
      // Two civs: some islands
      coastalMultiplier = 1.5;  // 1.5x coastal islands
      erosionBoost = 2;
    } else {
      // 3+ civs: standard (crowded continent, less room for islands)
      coastalMultiplier = 1.0;
      erosionBoost = 0;
    }

    const newCoastalIslands = Math.round(baseCoastalIslands * coastalMultiplier);
    const newErosion = Math.min(25, baseErosion + erosionBoost);  // Cap at 25%

    generatorSettings.landmass[i].coastalIslands = newCoastalIslands;
    generatorSettings.landmass[i].erosionPercent = newErosion;

    console.log(`[ContinentsPP]   Continent ${i + 1}: ${playerCount} players → coastalIslands=${newCoastalIslands} (${coastalMultiplier}x), erosion=${newErosion}%`);
  }

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

  // Build a kd-tree of ONLY major continent tiles (for island region inheritance)
  // Islands need to inherit WEST/EAST from the nearest major continent
  const numMajorContinents = generatorSettings.landmass.length;
  const majorContinentKdTree = new kdTree((tile) => tile.pos);
  majorContinentKdTree.build(tiles.flatMap((row) =>
    row.filter((tile) => tile.landmassId > 0 && tile.landmassId <= numMajorContinents)
  ));

  // Pre-compute which major continents are inhabited (have player starts)
  const continentIsInhabited = new Map();  // landmassId -> boolean
  for (let i = 0; i < numMajorContinents; i++) {
    const landmassId = i + 1;  // landmassIds are 1-indexed
    const hasPlayers = generatorSettings.landmass[i]?.playerAreas > 0;
    continentIsInhabited.set(landmassId, hasPlayers);
  }
  console.log(`[ContinentsPP] Major continents: ${numMajorContinents}, Islands will inherit region from nearest continent`);

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
        // Continents WITH player starts = WEST (homelands)
        // Continents WITHOUT player starts = EAST (distant lands)
        // Islands inherit WEST/EAST from their nearest major continent
        // This ensures REQUIREMENT_CITY_IS_DISTANT_LANDS works correctly
        // and Exploration Age bonuses apply to uninhabited continents AND their islands
        const isMajorContinent = tile.landmassId <= numMajorContinents;
        let isInhabited;

        if (isMajorContinent) {
          // Major continent - check directly
          isInhabited = continentIsInhabited.get(tile.landmassId) ?? false;
        } else {
          // Island - find nearest major continent and inherit its region
          const nearestContinentTile = majorContinentKdTree.search(tile.pos);
          const nearestContinentId = nearestContinentTile?.data?.landmassId ?? 1;
          isInhabited = continentIsInhabited.get(nearestContinentId) ?? false;
          // Tag as island for resource variety
          TerrainBuilder.addPlotTag(x, y, PlotTags.PLOT_TAG_ISLAND);
        }

        if (isInhabited) {
          // Inhabited continent (or island near one) = homeland
          TerrainBuilder.setLandmassRegionId(x, y, LandmassRegion.LANDMASS_REGION_WEST);
        } else {
          // Uninhabited continent (or island near one) = distant lands
          TerrainBuilder.setLandmassRegionId(x, y, LandmassRegion.LANDMASS_REGION_EAST);
          // Also tag uninhabited continents as islands for resource variety
          if (isMajorContinent) {
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
          if (nearbyLandmassId > 0) {
            // Coast inherits region from nearest landmass
            // For islands, trace back to their nearest major continent
            const nearbyIsMajorContinent = nearbyLandmassId <= numMajorContinents;
            let nearbyIsInhabited;

            if (nearbyIsMajorContinent) {
              nearbyIsInhabited = continentIsInhabited.get(nearbyLandmassId) ?? false;
            } else {
              // Nearby land is an island - find which major continent it's near
              const nearestContinentTile = majorContinentKdTree.search(tile.pos);
              const nearestContinentId = nearestContinentTile?.data?.landmassId ?? 1;
              nearbyIsInhabited = continentIsInhabited.get(nearestContinentId) ?? false;
            }

            if (nearbyIsInhabited) {
              TerrainBuilder.setLandmassRegionId(x, y, LandmassRegion.LANDMASS_REGION_WEST);
            } else {
              // Coasts near uninhabited continents/islands = distant lands
              TerrainBuilder.setLandmassRegionId(x, y, LandmassRegion.LANDMASS_REGION_EAST);
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

  // Build a map of landmassId -> sample tile position (for finding nearest continent)
  const landmassSamplePos = new Map();
  for (const row of tiles) {
    for (const tile of row) {
      if (tile.landmassId > 0 && !landmassSamplePos.has(tile.landmassId)) {
        landmassSamplePos.set(tile.landmassId, tile.pos);
      }
    }
  }

  console.log(`[ContinentsPP] === LANDMASS ANALYSIS ===`);

  for (let i = 0; i < sortedLandmasses.length; i++) {
    const [landmassId, tileCount] = sortedLandmasses[i];
    const percentOfLand = (tileCount / landTiles * 100).toFixed(1);
    const isMajorContinent = landmassId <= numMajorContinents;
    let isInhabited;
    let playerCount = 0;

    if (isMajorContinent) {
      isInhabited = continentIsInhabited.get(landmassId) ?? false;
      playerCount = generatorSettings.landmass[landmassId - 1]?.playerAreas || 0;
    } else {
      // Island - find nearest major continent
      const samplePos = landmassSamplePos.get(landmassId);
      if (samplePos) {
        const nearestContinentTile = majorContinentKdTree.search(samplePos);
        const nearestContinentId = nearestContinentTile?.data?.landmassId ?? 1;
        isInhabited = continentIsInhabited.get(nearestContinentId) ?? false;
      } else {
        isInhabited = false;
      }
    }

    const region = isInhabited ? 'WEST/Homeland' : 'EAST/Distant';

    if (i < configuredContinents) {
      // Major continent
      mapStats.continentTiles += tileCount;
      if (isInhabited) mapStats.homelandCount++;
      else mapStats.distantLandCount++;
      console.log(`[ContinentsPP]   Continent ${i + 1} (ID ${landmassId}): ${tileCount} tiles (${percentOfLand}%) - ${region} [${playerCount} players]`);
    } else {
      // Island - inherits from nearest continent
      mapStats.islandTiles += tileCount;
      mapStats.islandCount++;
      if (isInhabited) {
        mapStats.islandsNearHomeland++;
        mapStats.islandTilesNearHomeland += tileCount;
      } else {
        mapStats.islandsNearDistant++;
        mapStats.islandTilesNearDistant += tileCount;
      }
      if (mapStats.islandCount <= 10) {  // Log first 10 islands individually
        console.log(`[ContinentsPP]   Island ${mapStats.islandCount} (ID ${landmassId}): ${tileCount} tiles (${percentOfLand}%) - ${region}`);
      }
    }
  }

  if (mapStats.islandCount > 10) {
    console.log(`[ContinentsPP]   ... and ${mapStats.islandCount - 10} more small islands`);
  }

  const islandPercentOfLand = landTiles > 0 ? (mapStats.islandTiles / landTiles * 100).toFixed(1) : 0;
  const continentPercentOfLand = landTiles > 0 ? (mapStats.continentTiles / landTiles * 100).toFixed(1) : 0;
  console.log(`[ContinentsPP] === SUMMARY ===`);
  console.log(`[ContinentsPP]   Continents: ${configuredContinents} (${mapStats.continentTiles} tiles, ${continentPercentOfLand}% of land)`);
  console.log(`[ContinentsPP]   - Homelands (WEST): ${mapStats.homelandCount} continent(s) with player starts`);
  console.log(`[ContinentsPP]   - Distant Lands (EAST): ${mapStats.distantLandCount} uninhabited continent(s)`);
  console.log(`[ContinentsPP]   Islands: ${mapStats.islandCount} total (${mapStats.islandTiles} tiles, ${islandPercentOfLand}% of land)`);
  console.log(`[ContinentsPP]   - Near Homelands (WEST): ${mapStats.islandsNearHomeland} islands (${mapStats.islandTilesNearHomeland} tiles)`);
  console.log(`[ContinentsPP]   - Near Distant Lands (EAST): ${mapStats.islandsNearDistant} islands (${mapStats.islandTilesNearDistant} tiles)`);
  console.log(`[ContinentsPP]   Island ratio: ${mapStats.islandCount > 0 ? (mapStats.islandTiles / mapStats.continentTiles * 100).toFixed(1) : 0}% of continent size`);

  //────────────────────────────────────────────────────────────────────────────
  // POST-SIMULATION PLAYER REDISTRIBUTION
  // Now that we know ACTUAL tile counts, redistribute players to large landmasses
  // This fixes cases where "islands" ended up larger than configured "continents"
  //────────────────────────────────────────────────────────────────────────────

  console.log(`[ContinentsPP] === POST-SIMULATION PLAYER REDISTRIBUTION ===`);

  // Get all landmasses sorted by ACTUAL tile count (largest first)
  const actualLandmasses = Array.from(landmassTileCounts.entries())
    .map(([id, tiles]) => ({ landmassId: id, tileCount: tiles }))
    .sort((a, b) => b.tileCount - a.tileCount);

  // Calculate total land tiles and average
  const actualTotalLandTiles = actualLandmasses.reduce((sum, l) => sum + l.tileCount, 0);
  const minTilesForContinent = actualTotalLandTiles * 0.05;  // At least 5% of land to be a "continent"

  // Filter to significant landmasses (at least 5% of total land)
  const significantLandmasses = actualLandmasses.filter(l => l.tileCount >= minTilesForContinent);

  console.log(`[ContinentsPP] Significant landmasses (>= ${minTilesForContinent.toFixed(0)} tiles / 5% of land):`);
  for (const l of significantLandmasses) {
    const pct = (l.tileCount / actualTotalLandTiles * 100).toFixed(1);
    const isConfigured = l.landmassId <= numMajorContinents;
    console.log(`[ContinentsPP]   ID ${l.landmassId}: ${l.tileCount} tiles (${pct}%) - ${isConfigured ? 'configured' : 'UNCONFIGURED'}`);
  }

  // Check if any significant landmass is NOT in the configured range
  const unconfiguredLargeLandmass = significantLandmasses.find(l => l.landmassId > numMajorContinents);

  if (unconfiguredLargeLandmass) {
    console.log(`[ContinentsPP] WARNING: Large unconfigured landmass detected (ID ${unconfiguredLargeLandmass.landmassId} with ${unconfiguredLargeLandmass.tileCount} tiles)`);
    console.log(`[ContinentsPP] Redistributing players based on ACTUAL sizes...`);

    // Calculate max players per landmass based on ACTUAL tile count
    const avgTiles = actualTotalLandTiles / significantLandmasses.length;

    // Clear all playerAreas first
    for (let i = 0; i < generatorSettings.landmass.length; i++) {
      generatorSettings.landmass[i].playerAreas = 0;
    }
    continentIsInhabited.clear();

    // Assign players to the largest landmasses (by actual tile count)
    // Reserve at least one for distant lands
    const landsForPlayers = Math.max(1, significantLandmasses.length - 1);
    let redistHumansToAssign = humanCount;
    let redistAisToAssign = aiCount;

    // Calculate capacity for each significant landmass
    const landmassCapacity = [];
    for (let i = 0; i < landsForPlayers; i++) {
      const l = significantLandmasses[i];
      const sizeRatio = l.tileCount / avgTiles;

      // Max players based on size ratio
      let maxPlayers;
      if (sizeRatio < 0.5) maxPlayers = 1;
      else if (sizeRatio < 0.7) maxPlayers = 2;
      else if (sizeRatio < 1.0) maxPlayers = 3;
      else maxPlayers = Math.min(6, Math.max(3, Math.floor(sizeRatio * 2.5)));

      landmassCapacity.push({ ...l, sizeRatio, maxPlayers, assigned: 0, hasHuman: false });
    }

    // MODE-AWARE REDISTRIBUTION: Respect the user's distribution choice
    console.log(`[ContinentsPP] Mode-aware redistribution (Mode ${playerDistributionMode}: ${DISTRIBUTION_MODE_NAMES[playerDistributionMode]})`);

    if (playerDistributionMode === 0) {
      // CLUSTERED: Humans on fewest landmasses
      console.log(`[ContinentsPP]   Clustered: Grouping humans together`);
      for (const l of landmassCapacity) {
        if (redistHumansToAssign <= 0) break;
        const humansForThis = Math.min(redistHumansToAssign, l.maxPlayers);
        if (humansForThis > 0) {
          l.assigned = humansForThis;
          l.hasHuman = true;
          redistHumansToAssign -= humansForThis;
        }
      }
    } else if (playerDistributionMode === 1) {
      // SPREAD: Humans on different landmasses, preserve distant lands
      // RULE: Humans need AI companion unless there's a bridge (2+ inhabited landmasses)
      const maxInhabited = Math.max(1, landmassCapacity.length - 1);
      console.log(`[ContinentsPP]   Spread: Separating humans (max ${maxInhabited} inhabited)`);

      // Check if bridges will exist (2+ inhabited landmasses)
      const willHaveBridges = humanCount >= 2 || (humanCount === 1 && redistAisToAssign >= 1 && maxInhabited >= 2);

      if (!willHaveBridges && humanCount === 1 && redistAisToAssign >= 1) {
        // Single human, no bridges → need AI companion
        console.log(`[ContinentsPP]   Single human, no bridges - adding AI companion`);
        landmassCapacity[0].assigned = 2;
        landmassCapacity[0].hasHuman = true;
        redistHumansToAssign = 0;
        redistAisToAssign--;
      } else {
        let inhabitedCount = 0;
        for (const l of landmassCapacity) {
          if (redistHumansToAssign <= 0) break;
          if (inhabitedCount >= maxInhabited) break;
          l.assigned = 1;
          l.hasHuman = true;
          redistHumansToAssign--;
          inhabitedCount++;
        }
        // Overflow to already-inhabited
        while (redistHumansToAssign > 0) {
          let assignedAny = false;
          for (const l of landmassCapacity) {
            if (redistHumansToAssign <= 0) break;
            if (!l.hasHuman) continue;
            if (l.assigned < l.maxPlayers) {
              l.assigned++;
              redistHumansToAssign--;
              assignedAny = true;
            }
          }
          if (!assignedAny) {
            landmassCapacity[0].assigned += redistHumansToAssign;
            redistHumansToAssign = 0;
          }
        }
      }

      // Verify: if only 1 inhabited, human needs AI companion
      const inhabitedLandmassCount = landmassCapacity.filter(l => l.assigned > 0).length;
      if (inhabitedLandmassCount === 1 && redistAisToAssign > 0) {
        const singleInhabited = landmassCapacity.find(l => l.hasHuman);
        if (singleInhabited && singleInhabited.assigned === 1) {
          console.log(`[ContinentsPP]   Ensuring AI companion for isolated human`);
          if (singleInhabited.assigned < singleInhabited.maxPlayers) {
            singleInhabited.assigned++;
            redistAisToAssign--;
          }
        }
      }
    } else {
      // RANDOM: Proportional, no human priority
      // BUT: Still enforce minimum 2 players per inhabited continent when only 1 is inhabited
      // This ensures the human (wherever they land) has an AI companion for corridor bridges
      console.log(`[ContinentsPP]   Random: Proportional distribution`);
      let totalToAssign = redistHumansToAssign + redistAisToAssign;
      const totalPlayers = totalToAssign;

      for (const l of landmassCapacity) {
        if (totalToAssign <= 0) break;
        const proportional = Math.round(totalPlayers * (l.tileCount / actualTotalLandTiles));
        const toAssign = Math.min(proportional, l.maxPlayers, totalToAssign);
        l.assigned = toAssign;
        totalToAssign -= toAssign;
      }
      // Fill remaining
      while (totalToAssign > 0) {
        let assignedAny = false;
        for (const l of landmassCapacity) {
          if (totalToAssign <= 0) break;
          if (l.assigned < l.maxPlayers) {
            l.assigned++;
            totalToAssign--;
            assignedAny = true;
          }
        }
        if (!assignedAny) {
          landmassCapacity[0].assigned += totalToAssign;
          totalToAssign = 0;
        }
      }

      // POST-CHECK: Ensure NO continent has exactly 1 player (human would be isolated)
      // Every inhabited continent should have 0 or 2+ players
      if (humanCount === 1 && totalPlayers >= 2) {
        console.log(`[ContinentsPP]   Random: Checking for single-player continents in redistribution`);

        let fixNeeded = true;
        let iterations = 0;
        const maxIterations = 10;

        while (fixNeeded && iterations < maxIterations) {
          fixNeeded = false;
          iterations++;

          // Find continents with exactly 1 player
          const singlePlayerLandmasses = landmassCapacity.filter(l => l.assigned === 1);
          const multiPlayerLandmasses = landmassCapacity.filter(l => l.assigned >= 2);

          for (const lonely of singlePlayerLandmasses) {
            console.log(`[ContinentsPP]   Landmass ${lonely.landmassId} has only 1 player`);

            // Option 1: Pull from a 3+ player landmass
            const donor = multiPlayerLandmasses.find(l => l.assigned >= 3);
            if (donor) {
              donor.assigned--;
              lonely.assigned++;
              console.log(`[ContinentsPP]   Moved player from ${donor.landmassId} to ${lonely.landmassId}`);
              fixNeeded = true;
              break;
            }

            // Option 2: Move lonely to another inhabited landmass
            const recipient = landmassCapacity.find(l =>
              l !== lonely && l.assigned > 0 && l.assigned < l.maxPlayers
            );
            if (recipient) {
              lonely.assigned--;
              recipient.assigned++;
              console.log(`[ContinentsPP]   Moved player from ${lonely.landmassId} to ${recipient.landmassId}`);
              fixNeeded = true;
              break;
            }
          }
        }

        const remainingSingles = landmassCapacity.filter(l => l.assigned === 1);
        if (remainingSingles.length > 0) {
          console.log(`[ContinentsPP]   WARNING: ${remainingSingles.length} landmass(es) still have only 1 player`);
        } else {
          console.log(`[ContinentsPP]   All landmasses have 0 or 2+ players`);
        }
      }

      redistHumansToAssign = 0;
      redistAisToAssign = 0;
    }

    // Distribute AIs to fill remaining capacity (for Clustered and Spread modes)
    if (playerDistributionMode !== 2) {
      for (const l of landmassCapacity) {
        if (redistAisToAssign <= 0) break;
        const availableSlots = l.maxPlayers - l.assigned;
        if (availableSlots > 0) {
          // For Spread mode, only add to inhabited landmasses
          if (playerDistributionMode === 1 && l.assigned === 0) continue;
          const toAssign = Math.min(availableSlots, redistAisToAssign);
          l.assigned += toAssign;
          redistAisToAssign -= toAssign;
        }
      }
      // Final pass for remaining AIs
      while (redistAisToAssign > 0) {
        let assignedAny = false;
        for (const l of landmassCapacity) {
          if (redistAisToAssign <= 0) break;
          if (l.assigned < l.maxPlayers) {
            l.assigned++;
            redistAisToAssign--;
            assignedAny = true;
          }
        }
        if (!assignedAny) {
          landmassCapacity[0].assigned += redistAisToAssign;
          redistAisToAssign = 0;
        }
      }
    }

    // Apply the new distribution
    console.log(`[ContinentsPP] New distribution based on actual sizes:`);
    for (const l of landmassCapacity) {
      // Only apply to configured landmasses (IDs 1-numMajorContinents)
      if (l.landmassId <= numMajorContinents && l.landmassId >= 1) {
        const idx = l.landmassId - 1;
        generatorSettings.landmass[idx].playerAreas = l.assigned;
        if (l.assigned > 0) {
          continentIsInhabited.set(l.landmassId, true);
        }
      }
      console.log(`[ContinentsPP]   ID ${l.landmassId}: ${l.tileCount} tiles, ratio=${l.sizeRatio.toFixed(2)}x, max=${l.maxPlayers}, assigned=${l.assigned}`);
    }

    // Mark distant lands
    for (let i = landsForPlayers; i < significantLandmasses.length; i++) {
      const l = significantLandmasses[i];
      if (l.landmassId <= numMajorContinents && l.landmassId >= 1) {
        continentIsInhabited.set(l.landmassId, false);
      }
      console.log(`[ContinentsPP]   ID ${l.landmassId}: ${l.tileCount} tiles - DISTANT LANDS`);
    }

    // Update mapStats
    mapStats.homelandCount = landmassCapacity.filter(l => l.assigned > 0).length;
    mapStats.distantLandCount = significantLandmasses.length - mapStats.homelandCount;

    const newDistribution = generatorSettings.landmass.map((l, i) => `C${i+1}: ${l.playerAreas}`).join(', ');
    console.log(`[ContinentsPP] Updated distribution: ${newDistribution}`);
  } else {
    console.log(`[ContinentsPP] Player distribution looks reasonable, no redistribution needed`);
  }

  //────────────────────────────────────────────────────────────────────────────
  // POST-PROCESS: ADD CORRIDOR ISLANDS (between homeland continents)
  // Creates stepping-stone archipelagos for naval travel between player starts
  //────────────────────────────────────────────────────────────────────────────

  const corridorResult = addCorridorIslands(iWidth, iHeight, mapSeed, continentIsInhabited, tiles, generatorSettings);
  mapStats.corridorChains = corridorResult.chainsAdded;
  mapStats.corridorIslands = corridorResult.islandsAdded;
  mapStats.corridorTiles = corridorResult.tilesConverted;
  mapStats.islandCount += corridorResult.islandsAdded;
  mapStats.islandTiles += corridorResult.tilesConverted;
  mapStats.islandsNearHomeland += corridorResult.islandsAdded;  // Corridor islands are WEST
  mapStats.islandTilesNearHomeland += corridorResult.tilesConverted;

  //────────────────────────────────────────────────────────────────────────────
  // POST-PROCESS: ADD OPEN OCEAN ISLANDS
  // Scan for large empty ocean areas and add small islands
  //────────────────────────────────────────────────────────────────────────────

  const oceanIslandResult = addOpenOceanIslands(iWidth, iHeight, mapSeed, continentIsInhabited, majorContinentKdTree, tiles);
  mapStats.islandCount += oceanIslandResult.islandsAdded;
  mapStats.islandTiles += oceanIslandResult.tilesConverted;
  mapStats.openOceanChains = oceanIslandResult.chainsAdded || 0;
  mapStats.openOceanIslands = oceanIslandResult.islandsAdded;
  mapStats.openOceanIslandTiles = oceanIslandResult.tilesConverted;

  //────────────────────────────────────────────────────────────────────────────
  // TERRAIN PROCESSING
  //────────────────────────────────────────────────────────────────────────────

  TerrainBuilder.validateAndFixTerrain();
  AreaBuilder.recalculateAreas();
  TerrainBuilder.stampContinents();

  // Diagnostic: Count distinct continents after stamping
  // This helps detect when separate Voronoi landmasses get merged by stampContinents
  const stampedContinents = new Set();
  for (let y = 0; y < iHeight; y++) {
    for (let x = 0; x < iWidth; x++) {
      const continentId = GameplayMap.getContinentType(x, y);
      if (continentId !== -1) {
        stampedContinents.add(continentId);
      }
    }
  }
  const stampedCount = stampedContinents.size;
  const expectedCount = randomConfig.landmassCount;
  console.log(`[ContinentsPP] === CONTINENT STAMPING DIAGNOSTIC ===`);
  console.log(`[ContinentsPP] Expected ${expectedCount} continents, game stamped ${stampedCount}`);
  if (stampedCount < expectedCount) {
    console.log(`[ContinentsPP] WARNING: Fewer continents than expected! Some landmasses may have been merged.`);
    console.log(`[ContinentsPP] This can happen if coastlines or islands connect separate landmasses.`);
  } else if (stampedCount > expectedCount) {
    console.log(`[ContinentsPP] Note: More continents detected (islands may be counted as separate continents)`);
  }

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

  //────────────────────────────────────────────────────────────────────────────
  // HUMAN ISOLATION FIX
  // After assignment, check if human is alone on their continent
  // If so (and no bridges), swap with an AI from a populated continent
  //────────────────────────────────────────────────────────────────────────────

  console.log(`[ContinentsPP] === POST-ASSIGNMENT HUMAN ISOLATION CHECK ===`);

  // Build map of landmass -> players on it
  const playersPerLandmass = new Map();  // landmassId -> [{playerIndex, isHuman}]
  for (let i = 0; i < aliveMajorIds.length; i++) {
    const playerId = aliveMajorIds[i];
    const landmassId = playerRegions[i]?.landmassId ?? -1;
    const isHuman = Players.isHuman(playerId);

    if (landmassId >= 0) {
      if (!playersPerLandmass.has(landmassId)) {
        playersPerLandmass.set(landmassId, []);
      }
      playersPerLandmass.get(landmassId).push({ playerIndex: i, isHuman, playerId });
    }
  }

  // Log current distribution
  for (const [landmassId, players] of playersPerLandmass) {
    const humanCount = players.filter(p => p.isHuman).length;
    const aiCount = players.filter(p => !p.isHuman).length;
    console.log(`[ContinentsPP] Landmass ${landmassId}: ${players.length} players (${humanCount} human, ${aiCount} AI)`);
  }

  // Check if any human is alone
  const inhabitedLandmasses = Array.from(playersPerLandmass.entries()).filter(([_, p]) => p.length > 0);
  const bridgesExist = inhabitedLandmasses.length >= 2;

  for (const [landmassId, players] of playersPerLandmass) {
    const humansHere = players.filter(p => p.isHuman);
    const aisHere = players.filter(p => !p.isHuman);

    // Human is alone if: only 1 player total AND that player is human
    if (players.length === 1 && humansHere.length === 1) {
      console.log(`[ContinentsPP] WARNING: Human alone on landmass ${landmassId}!`);

      if (!bridgesExist) {
        console.log(`[ContinentsPP] No bridges exist (only ${inhabitedLandmasses.length} inhabited landmass)`);
        // Only 1 inhabited landmass - need to ensure human has companion
        // This shouldn't happen if our pre-assignment logic is correct, but handle it anyway
      }

      // Find an AI on a different landmass to swap with
      let swapTarget = null;
      for (const [otherLandmassId, otherPlayers] of playersPerLandmass) {
        if (otherLandmassId === landmassId) continue;
        // Find landmass with multiple players (so we can steal one AI)
        const otherAis = otherPlayers.filter(p => !p.isHuman);
        if (otherPlayers.length >= 2 && otherAis.length >= 1) {
          swapTarget = { landmassId: otherLandmassId, ai: otherAis[0] };
          break;
        }
      }

      if (swapTarget) {
        const humanPlayer = humansHere[0];
        const aiPlayer = swapTarget.ai;

        console.log(`[ContinentsPP] Swapping human (player ${humanPlayer.playerIndex}) with AI (player ${aiPlayer.playerIndex})`);

        // Swap start positions
        const humanStartPos = startPositions[humanPlayer.playerIndex];
        const aiStartPos = startPositions[aiPlayer.playerIndex];
        startPositions[humanPlayer.playerIndex] = aiStartPos;
        startPositions[aiPlayer.playerIndex] = humanStartPos;

        console.log(`[ContinentsPP] Human now starts at plot ${aiStartPos} (was ${humanStartPos})`);
      } else {
        console.log(`[ContinentsPP] No suitable AI found to swap with - human may be isolated`);
      }
    }
  }

  //────────────────────────────────────────────────────────────────────────────
  // MINIMUM PLAYER DISTANCE ENFORCEMENT
  // Ensure all players are at least MIN_PLAYER_DISTANCE tiles apart
  // This prevents crowded starts where 2 players spawn within 4 hexes
  //────────────────────────────────────────────────────────────────────────────

  console.log(`[ContinentsPP] === MINIMUM PLAYER DISTANCE CHECK ===`);

  const MIN_PLAYER_DISTANCE = 10;  // Minimum tiles between any two players
  const MAX_SWAP_ATTEMPTS = 20;

  // Helper: calculate distance between two plot indices
  const plotDistance = (plotA, plotB) => {
    const ax = plotA % iWidth;
    const ay = Math.floor(plotA / iWidth);
    const bx = plotB % iWidth;
    const by = Math.floor(plotB / iWidth);
    let dx = Math.abs(ax - bx);
    if (dx > iWidth / 2) dx = iWidth - dx;  // Wrap
    const dy = Math.abs(ay - by);
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Build array of all player positions
  let allPlayerPositions = [];
  for (let i = 0; i < aliveMajorIds.length; i++) {
    const plotIndex = startPositions[i];
    if (plotIndex !== undefined && plotIndex >= 0) {
      allPlayerPositions.push({
        playerIndex: i,
        playerId: aliveMajorIds[i],
        isHuman: Players.isHuman(aliveMajorIds[i]),
        plotIndex,
        x: plotIndex % iWidth,
        y: Math.floor(plotIndex / iWidth)
      });
    }
  }

  // Find pairs that are too close
  let swapAttempts = 0;
  let fixedPairs = 0;

  for (let attempt = 0; attempt < MAX_SWAP_ATTEMPTS; attempt++) {
    let foundTooClose = false;
    let closestPair = null;
    let closestDist = Infinity;

    // Find the closest pair
    for (let i = 0; i < allPlayerPositions.length; i++) {
      for (let j = i + 1; j < allPlayerPositions.length; j++) {
        const dist = plotDistance(allPlayerPositions[i].plotIndex, allPlayerPositions[j].plotIndex);
        if (dist < MIN_PLAYER_DISTANCE && dist < closestDist) {
          closestDist = dist;
          closestPair = { i, j, dist };
          foundTooClose = true;
        }
      }
    }

    if (!foundTooClose) break;

    swapAttempts++;
    const p1 = allPlayerPositions[closestPair.i];
    const p2 = allPlayerPositions[closestPair.j];
    console.log(`[ContinentsPP] Players ${p1.playerIndex} and ${p2.playerIndex} too close (${closestDist.toFixed(1)} tiles)`);

    // Find a third player to swap with (one that would increase the minimum distance)
    // Prefer swapping the AI if one is human, otherwise swap the second one
    const playerToMove = p1.isHuman ? p2 : p1;
    const playerToStay = p1.isHuman ? p1 : p2;

    let bestSwapTarget = null;
    let bestNewMinDist = 0;

    for (let k = 0; k < allPlayerPositions.length; k++) {
      if (k === closestPair.i || k === closestPair.j) continue;
      const candidate = allPlayerPositions[k];

      // Calculate what the new minimum distance would be if we swapped
      const distToStay = plotDistance(candidate.plotIndex, playerToStay.plotIndex);
      const distMovedToCandidate = plotDistance(playerToMove.plotIndex, candidate.plotIndex);

      // Check all distances after swap
      let wouldBeValid = distToStay >= MIN_PLAYER_DISTANCE;
      if (wouldBeValid) {
        for (let m = 0; m < allPlayerPositions.length; m++) {
          if (m === k || m === closestPair.i || m === closestPair.j) continue;
          const otherDist = plotDistance(candidate.plotIndex, allPlayerPositions[m].plotIndex);
          if (otherDist < MIN_PLAYER_DISTANCE) {
            wouldBeValid = false;
            break;
          }
        }
      }

      if (wouldBeValid && distToStay > bestNewMinDist) {
        bestNewMinDist = distToStay;
        bestSwapTarget = candidate;
      }
    }

    if (bestSwapTarget) {
      console.log(`[ContinentsPP] Swapping player ${playerToMove.playerIndex} with player ${bestSwapTarget.playerIndex}`);

      // Swap positions
      const tempPlot = startPositions[playerToMove.playerIndex];
      startPositions[playerToMove.playerIndex] = startPositions[bestSwapTarget.playerIndex];
      startPositions[bestSwapTarget.playerIndex] = tempPlot;

      // Update our tracking array
      const tempPlotIndex = playerToMove.plotIndex;
      playerToMove.plotIndex = bestSwapTarget.plotIndex;
      playerToMove.x = bestSwapTarget.x;
      playerToMove.y = bestSwapTarget.y;
      bestSwapTarget.plotIndex = tempPlotIndex;
      bestSwapTarget.x = tempPlotIndex % iWidth;
      bestSwapTarget.y = Math.floor(tempPlotIndex / iWidth);

      fixedPairs++;
    } else {
      console.log(`[ContinentsPP] WARNING: Could not find swap target for crowded players`);
      break;
    }
  }

  if (fixedPairs > 0) {
    console.log(`[ContinentsPP] Fixed ${fixedPairs} crowded player pairs`);
  } else if (swapAttempts === 0) {
    console.log(`[ContinentsPP] All players are ${MIN_PLAYER_DISTANCE}+ tiles apart`);
  }

  //────────────────────────────────────────────────────────────────────────────
  // HUMAN PLAYER DISTANCE VERIFICATION
  // Log human player distances for debugging/verification
  //────────────────────────────────────────────────────────────────────────────

  if (humanCount > 1) {
    console.log(`[ContinentsPP] === HUMAN PLAYER DISTANCE CHECK (Mode ${playerDistributionMode}) ===`);

    // Minimum acceptable distance in tiles (only enforced in Spread mode)
    const MIN_HUMAN_DISTANCE = Math.floor(10 + mapSizeIndex * 3);  // 10, 13, 16, 19, 22 for Tiny→Huge

    // Get human start positions
    const humanStartPositions = [];
    for (let i = 0; i < aliveMajorIds.length; i++) {
      const playerId = aliveMajorIds[i];
      if (Players.isHuman(playerId)) {
        const startPlotIndex = startPositions[i];
        if (startPlotIndex !== undefined && startPlotIndex >= 0) {
          const x = startPlotIndex % iWidth;
          const y = Math.floor(startPlotIndex / iWidth);
          humanStartPositions.push({ playerId, playerIndex: i, x, y });
        }
      }
    }

    console.log(`[ContinentsPP] Human start positions (${humanStartPositions.length}):`);
    for (const hs of humanStartPositions) {
      console.log(`[ContinentsPP]   Player ${hs.playerId} (index ${hs.playerIndex}): (${hs.x}, ${hs.y})`);
    }

    // Calculate distances between all human player pairs
    let minFoundDistance = Infinity;
    let allSeparated = true;

    for (let i = 0; i < humanStartPositions.length; i++) {
      for (let j = i + 1; j < humanStartPositions.length; j++) {
        const h1 = humanStartPositions[i];
        const h2 = humanStartPositions[j];

        // Calculate wrapped horizontal distance
        let dx = Math.abs(h1.x - h2.x);
        if (dx > iWidth / 2) dx = iWidth - dx;  // Wrap around

        const dy = Math.abs(h1.y - h2.y);
        const distance = Math.sqrt(dx * dx + dy * dy);

        minFoundDistance = Math.min(minFoundDistance, distance);

        if (playerDistributionMode === 1 && distance < MIN_HUMAN_DISTANCE) {
          allSeparated = false;
        }
      }
    }

    // Log result based on mode
    if (playerDistributionMode === 0) {
      // Clustered: close humans are expected
      console.log(`[ContinentsPP] Clustered mode: Human distance = ${minFoundDistance.toFixed(1)} tiles (close proximity intended)`);
    } else if (playerDistributionMode === 1) {
      // Spread: verify separation
      if (allSeparated) {
        console.log(`[ContinentsPP] ✓ Spread mode: Humans adequately separated (min: ${minFoundDistance.toFixed(1)}, threshold: ${MIN_HUMAN_DISTANCE})`);
      } else {
        console.log(`[ContinentsPP] ⚠ Spread mode: Humans closer than threshold (min: ${minFoundDistance.toFixed(1)}, threshold: ${MIN_HUMAN_DISTANCE})`);
        console.log(`[ContinentsPP]   This can happen when there are more humans than available continents`);
      }
    } else if (playerDistributionMode === 2) {
      // Random: just informational
      console.log(`[ContinentsPP] Random mode: Human distance = ${minFoundDistance.toFixed(1)} tiles`);
    }
  }

  //────────────────────────────────────────────────────────────────────────────
  // FINAL PLAYER REPORT
  // Comprehensive summary of all player placements for verification
  //────────────────────────────────────────────────────────────────────────────

  console.log(`[ContinentsPP] === FINAL PLAYER REPORT ===`);
  console.log(`[ContinentsPP] Distribution Mode: ${DISTRIBUTION_MODE_NAMES[playerDistributionMode]} (${playerDistributionMode})`);
  console.log(`[ContinentsPP] Total Players: ${iTotalPlayers} (${humanCount} human, ${aiCount} AI)`);
  console.log(`[ContinentsPP]`);

  // Build final player info with continent data
  const finalPlayerInfo = [];
  for (let i = 0; i < aliveMajorIds.length; i++) {
    const playerId = aliveMajorIds[i];
    const plotIndex = startPositions[i];
    const isHuman = Players.isHuman(playerId);
    const x = plotIndex % iWidth;
    const y = Math.floor(plotIndex / iWidth);
    const landmassId = playerRegions[i]?.landmassId ?? -1;
    const continentSize = landmassTileCounts.get(landmassId) ?? 0;
    const isHomeland = continentIsInhabited.get(landmassId) ?? false;

    finalPlayerInfo.push({
      index: i,
      playerId,
      isHuman,
      x, y,
      plotIndex,
      landmassId,
      continentSize,
      isHomeland
    });
  }

  // Log each player
  console.log(`[ContinentsPP] PLAYER POSITIONS:`);
  for (const p of finalPlayerInfo) {
    const type = p.isHuman ? 'HUMAN' : 'AI';
    const region = p.isHomeland ? 'Homeland' : 'Distant';
    console.log(`[ContinentsPP]   Player ${p.index} [${type}]: (${p.x}, ${p.y}) on Continent ${p.landmassId} (${p.continentSize} tiles, ${region})`);
  }
  console.log(`[ContinentsPP]`);

  // Calculate and log all pairwise distances
  console.log(`[ContinentsPP] PLAYER DISTANCES (min required: ${MIN_PLAYER_DISTANCE} tiles):`);
  const distanceMatrix = [];
  let minDistance = Infinity;
  let maxDistance = 0;
  let minPair = null;

  for (let i = 0; i < finalPlayerInfo.length; i++) {
    for (let j = i + 1; j < finalPlayerInfo.length; j++) {
      const p1 = finalPlayerInfo[i];
      const p2 = finalPlayerInfo[j];
      const dist = plotDistance(p1.plotIndex, p2.plotIndex);

      if (dist < minDistance) {
        minDistance = dist;
        minPair = { i, j, dist };
      }
      maxDistance = Math.max(maxDistance, dist);

      const type1 = p1.isHuman ? 'H' : 'A';
      const type2 = p2.isHuman ? 'H' : 'A';
      const status = dist < MIN_PLAYER_DISTANCE ? '⚠️ TOO CLOSE' : '✓';
      const sameCont = p1.landmassId === p2.landmassId ? 'same continent' : 'different continents';

      distanceMatrix.push({ p1: i, p2: j, dist, type1, type2, sameCont, status });
    }
  }

  // Show closest pairs first
  distanceMatrix.sort((a, b) => a.dist - b.dist);
  for (const d of distanceMatrix.slice(0, 10)) {  // Show top 10 closest pairs
    console.log(`[ContinentsPP]   P${d.p1}[${d.type1}] ↔ P${d.p2}[${d.type2}]: ${d.dist.toFixed(1)} tiles (${d.sameCont}) ${d.status}`);
  }
  if (distanceMatrix.length > 10) {
    console.log(`[ContinentsPP]   ... and ${distanceMatrix.length - 10} more pairs`);
  }
  console.log(`[ContinentsPP]`);
  console.log(`[ContinentsPP] Distance Summary: min=${minDistance.toFixed(1)}, max=${maxDistance.toFixed(1)} tiles`);
  if (minPair && minDistance < MIN_PLAYER_DISTANCE) {
    console.log(`[ContinentsPP] ⚠️ WARNING: Players ${minPair.i} and ${minPair.j} are only ${minDistance.toFixed(1)} tiles apart!`);
  } else {
    console.log(`[ContinentsPP] ✓ All players are ${MIN_PLAYER_DISTANCE}+ tiles apart`);
  }
  console.log(`[ContinentsPP]`);

  // Human-specific summary
  const humanPlayers = finalPlayerInfo.filter(p => p.isHuman);
  if (humanPlayers.length > 0) {
    console.log(`[ContinentsPP] HUMAN PLAYER SUMMARY:`);
    for (const h of humanPlayers) {
      const companions = finalPlayerInfo.filter(p => p.landmassId === h.landmassId && p.index !== h.index);
      const humanCompanions = companions.filter(p => p.isHuman).length;
      const aiCompanions = companions.filter(p => !p.isHuman).length;
      const isolationStatus = companions.length === 0 ? '⚠️ ISOLATED!' : `✓ ${companions.length} companion(s)`;
      console.log(`[ContinentsPP]   Human P${h.index}: Continent ${h.landmassId} with ${humanCompanions}H + ${aiCompanions}AI neighbors - ${isolationStatus}`);
    }
  }
  console.log(`[ContinentsPP]`);

  // Continent summary
  console.log(`[ContinentsPP] CONTINENT SUMMARY:`);
  const continentPlayers = new Map();
  for (const p of finalPlayerInfo) {
    if (!continentPlayers.has(p.landmassId)) {
      continentPlayers.set(p.landmassId, { humans: 0, ais: 0, size: p.continentSize, isHomeland: p.isHomeland });
    }
    const c = continentPlayers.get(p.landmassId);
    if (p.isHuman) c.humans++;
    else c.ais++;
  }

  // Add uninhabited continents
  for (const [landmassId, tileCount] of landmassTileCounts) {
    if (!continentPlayers.has(landmassId) && tileCount >= 50) {
      const isHomeland = continentIsInhabited.get(landmassId) ?? false;
      continentPlayers.set(landmassId, { humans: 0, ais: 0, size: tileCount, isHomeland });
    }
  }

  // Sort by size and log
  const sortedContinents = Array.from(continentPlayers.entries()).sort((a, b) => b[1].size - a[1].size);
  for (const [landmassId, info] of sortedContinents) {
    const region = info.isHomeland ? 'WEST/Homeland' : 'EAST/Distant';
    const players = info.humans + info.ais;
    const playerStr = players > 0 ? `${info.humans}H + ${info.ais}AI` : 'uninhabited';
    console.log(`[ContinentsPP]   Continent ${landmassId}: ${info.size} tiles, ${region}, ${playerStr}`);
  }

  //────────────────────────────────────────────────────────────────────────────
  // ANTIQUITY REACHABLE DISTANCE
  // BFS to find actual walking distance via land + coastal tiles (no deep ocean)
  // This is the "real" early-game distance between players
  //────────────────────────────────────────────────────────────────────────────

  console.log(`[ContinentsPP]`);
  console.log(`[ContinentsPP] === ANTIQUITY REACHABLE DISTANCE ===`);
  console.log(`[ContinentsPP] (Walking distance via land + coastal tiles, no ocean crossing)`);

  // Helper: check if a tile is traversable in Antiquity (land or coastal water)
  const isAntiquityTraversable = (x, y) => {
    // Check bounds
    if (y < 0 || y >= iHeight) return false;
    // Wrap x
    const wx = ((x % iWidth) + iWidth) % iWidth;

    // Get terrain type from the game map (after terrain has been applied)
    const terrain = GameplayMap.getPlotTerrainType(wx, y);

    // Traversable: anything that's not deep ocean
    // Land terrains, coast, and shallow water are OK
    // Only TERRAIN_OCEAN (deep ocean) blocks movement
    return terrain !== globals.g_OceanTerrain;
  };

  // BFS from a starting position, returns distance map
  const bfsFromPosition = (startX, startY, maxDist = 100) => {
    const distances = new Map();  // "x,y" -> distance
    const queue = [{ x: startX, y: startY, dist: 0 }];
    distances.set(`${startX},${startY}`, 0);

    // 6 hex directions (offset coordinates)
    const getNeighbors = (x, y) => {
      const neighbors = [];
      // Even/odd row affects neighbor offsets in hex grid
      const isOddRow = y % 2 === 1;

      // Standard hex neighbors
      const offsets = isOddRow
        ? [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]
        : [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];

      for (const [dx, dy] of offsets) {
        const nx = ((x + dx) % iWidth + iWidth) % iWidth;
        const ny = y + dy;
        if (ny >= 0 && ny < iHeight) {
          neighbors.push({ x: nx, y: ny });
        }
      }
      return neighbors;
    };

    while (queue.length > 0) {
      const current = queue.shift();
      if (current.dist >= maxDist) continue;

      for (const neighbor of getNeighbors(current.x, current.y)) {
        const key = `${neighbor.x},${neighbor.y}`;
        if (distances.has(key)) continue;  // Already visited

        if (isAntiquityTraversable(neighbor.x, neighbor.y)) {
          const newDist = current.dist + 1;
          distances.set(key, newDist);
          queue.push({ x: neighbor.x, y: neighbor.y, dist: newDist });
        }
      }
    }

    return distances;
  };

  // For each human player, calculate reachable distances to all other players
  for (const human of humanPlayers) {
    console.log(`[ContinentsPP]`);
    console.log(`[ContinentsPP] Human P${human.index} at (${human.x}, ${human.y}):`);

    // Run BFS from human's position
    const distances = bfsFromPosition(human.x, human.y, 150);

    // Check distance to each other player
    const playerDistances = [];
    for (const other of finalPlayerInfo) {
      if (other.index === human.index) continue;

      const otherKey = `${other.x},${other.y}`;
      const reachableDist = distances.get(otherKey);
      const straightDist = plotDistance(human.plotIndex, other.plotIndex);
      const sameCont = human.landmassId === other.landmassId;

      playerDistances.push({
        playerIndex: other.index,
        isHuman: other.isHuman,
        x: other.x,
        y: other.y,
        reachableDist,
        straightDist,
        sameCont,
        landmassId: other.landmassId
      });
    }

    // Sort by reachable distance (unreachable last)
    playerDistances.sort((a, b) => {
      if (a.reachableDist === undefined && b.reachableDist === undefined) return 0;
      if (a.reachableDist === undefined) return 1;
      if (b.reachableDist === undefined) return -1;
      return a.reachableDist - b.reachableDist;
    });

    // Log results
    let reachableCount = 0;
    let nearestReachable = null;

    for (const pd of playerDistances) {
      const type = pd.isHuman ? 'H' : 'A';
      const contStr = pd.sameCont ? 'same' : `C${pd.landmassId}`;

      if (pd.reachableDist !== undefined) {
        reachableCount++;
        if (!nearestReachable) nearestReachable = pd;
        const ratio = (pd.reachableDist / pd.straightDist).toFixed(1);
        console.log(`[ContinentsPP]   → P${pd.playerIndex}[${type}] (${pd.x},${pd.y}): ${pd.reachableDist} tiles walk (${pd.straightDist.toFixed(0)} straight, ${ratio}x) [${contStr}]`);
      } else {
        console.log(`[ContinentsPP]   → P${pd.playerIndex}[${type}] (${pd.x},${pd.y}): ❌ UNREACHABLE (${pd.straightDist.toFixed(0)} straight) [${contStr}]`);
      }
    }

    // Summary for this human
    console.log(`[ContinentsPP]`);
    if (nearestReachable) {
      const nearType = nearestReachable.isHuman ? 'Human' : 'AI';
      console.log(`[ContinentsPP]   Nearest reachable: P${nearestReachable.playerIndex} (${nearType}) at ${nearestReachable.reachableDist} tiles`);
      console.log(`[ContinentsPP]   Reachable players: ${reachableCount}/${playerDistances.length}`);

      // Verdict
      if (nearestReachable.reachableDist <= 15) {
        console.log(`[ContinentsPP]   ✓ GOOD: Nearby neighbor within 15 tiles`);
      } else if (nearestReachable.reachableDist <= 30) {
        console.log(`[ContinentsPP]   ⚠️ OK: Nearest neighbor is ${nearestReachable.reachableDist} tiles (moderate distance)`);
      } else {
        console.log(`[ContinentsPP]   ⚠️ FAR: Nearest neighbor is ${nearestReachable.reachableDist} tiles (long journey)`);
      }
    } else {
      console.log(`[ContinentsPP]   ❌ ISOLATED: No players reachable via land/coast!`);
    }
  }

  console.log(`[ContinentsPP]`);
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
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Land: ${landPercent}% | Water: ${waterPercent}%`);
  console.log(`  Continents: ${landmassCount} | Players: ${iTotalPlayers} (${humanCount} human, ${aiCount} AI)`);
  console.log(`  Distribution Mode: ${DISTRIBUTION_MODE_NAMES[playerDistributionMode]} (${playerDistribution})`);
  console.log("───────────────────────────────────────────────────────────────");
  console.log(`  Homelands (WEST): ${mapStats.homelandCount} continent(s)`);
  console.log(`  Distant Lands (EAST): ${mapStats.distantLandCount} continent(s)`);
  console.log("───────────────────────────────────────────────────────────────");
  console.log(`  Islands: ${mapStats.islandCount} total (${mapStats.islandTiles} tiles)`);
  const voronoiIslands = mapStats.islandCount - mapStats.openOceanIslands - mapStats.corridorIslands;
  console.log(`    Voronoi-generated: ${voronoiIslands}`);
  console.log(`    Corridor chains: ${mapStats.corridorChains} chains, ${mapStats.corridorIslands} islands (${mapStats.corridorTiles} tiles)`);
  console.log(`    Open ocean chains: ${mapStats.openOceanChains} chains, ${mapStats.openOceanIslands} islands (${mapStats.openOceanIslandTiles} tiles)`);
  console.log(`    Near Homelands: ${mapStats.islandsNearHomeland} (${mapStats.islandTilesNearHomeland} tiles)`);
  console.log(`    Near Distant Lands: ${mapStats.islandsNearDistant} (${mapStats.islandTilesNearDistant} tiles)`);
  console.log("═══════════════════════════════════════════════════════════════");
}

engine.on('RequestMapInitData', requestMapData);
engine.on('GenerateMap', generateMap);
console.log("Loaded Continents++ (Voronoi Edition)");
