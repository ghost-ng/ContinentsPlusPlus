/**
 * Improved Voronoi Plate Tectonics Generator
 * Uses Raymond Hill's Fortune algorithm implementation with Lloyd relaxation
 */

const Voronoi = require('voronoi');
const seedrandom = require('seedrandom');

/**
 * Map size configurations matching the actual mod
 */
const MAP_SIZE_CONFIGS = {
  TINY: {
    width: 52,
    height: 34,
    totalLandmassSize: 30,
    minLandmassSize: 12,
    coastalIslands: 6,
    islandTotalSize: 3.5
  },
  SMALL: {
    width: 64,
    height: 42,
    totalLandmassSize: 36,
    minLandmassSize: 14,
    coastalIslands: 9,
    islandTotalSize: 4.5
  },
  STANDARD: {
    width: 84,
    height: 54,
    totalLandmassSize: 42,
    minLandmassSize: 16,
    coastalIslands: 12,
    islandTotalSize: 5.5
  },
  LARGE: {
    width: 104,
    height: 64,
    totalLandmassSize: 48,
    minLandmassSize: 18,
    coastalIslands: 15,
    islandTotalSize: 6.5
  },
  HUGE: {
    width: 128,
    height: 80,
    totalLandmassSize: 54,
    minLandmassSize: 20,
    coastalIslands: 18,
    islandTotalSize: 7.5
  }
};

/**
 * TerrainType enum matching the game
 */
const TerrainType = {
  Flat: 0,
  Rough: 1,
  Mountainous: 2,
  Volcano: 3,
  Water: 4
};

class VoronoiGeneratorV2 {
  constructor(mapSize = 'STANDARD', seed = Date.now()) {
    this.config = MAP_SIZE_CONFIGS[mapSize];
    this.width = this.config.width;
    this.height = this.config.height;
    this.rng = seedrandom(seed.toString());
    this.seed = seed;

    // Voronoi instance
    this.voronoi = new Voronoi();
    this.diagram = null;
    this.sites = [];
    this.cells = [];

    // Plate data
    this.plates = new Map(); // cellId -> plate data
    this.hexGrid = [];

    // Constants
    this.polarWaterRows = 2;
    this.lloydIterations = 3; // Lloyd relaxation iterations for better distribution
    this.plateRotationMultiple = 5;
    this.variance = 5;
    this.erosionPercent = 2.5; // Reduced to preserve more coastline
    this.mountainPercent = 12;
  }

  /**
   * Generate random number using seeded RNG
   */
  random() {
    return this.rng();
  }

  /**
   * Generate initial random sites for plates
   */
  generateRandomSites(numSites) {
    const sites = [];
    for (let i = 0; i < numSites; i++) {
      sites.push({
        x: this.random() * this.width,
        y: this.random() * this.height
      });
    }
    return sites;
  }

  /**
   * Lloyd relaxation: Move sites to centroids of their Voronoi cells
   * This creates more evenly distributed plates
   */
  lloydRelaxation(sites, bbox) {
    // Compute Voronoi diagram
    const diagram = this.voronoi.compute(sites, bbox);
    if (!diagram || !diagram.cells) return sites;

    // Move each site to the centroid of its cell
    const newSites = [];
    for (let cell of diagram.cells) {
      if (!cell || !cell.halfedges || cell.halfedges.length === 0) {
        // If cell is invalid, keep original site
        newSites.push(cell.site);
        continue;
      }

      // Calculate centroid
      let cx = 0, cy = 0, area = 0;
      const vertices = cell.halfedges.map(he => he.getStartpoint());

      // Close the polygon
      vertices.push(vertices[0]);

      for (let i = 0; i < vertices.length - 1; i++) {
        const v0 = vertices[i];
        const v1 = vertices[i + 1];
        const cross = v0.x * v1.y - v1.x * v0.y;
        area += cross;
        cx += (v0.x + v1.x) * cross;
        cy += (v0.y + v1.y) * cross;
      }

      area /= 2;
      if (Math.abs(area) > 0.001) {
        cx = cx / (6 * area);
        cy = cy / (6 * area);

        // Clamp to bbox
        cx = Math.max(bbox.xl, Math.min(bbox.xr, cx));
        cy = Math.max(bbox.yt, Math.min(bbox.yb, cy));

        newSites.push({ x: cx, y: cy });
      } else {
        newSites.push(cell.site);
      }
    }

    // Recycle diagram to free memory
    this.voronoi.recycle(diagram);

    return newSites;
  }

  /**
   * Initialize Voronoi diagram with Lloyd-relaxed plate sites
   */
  initVoronoi() {
    // Scale number of plates with map size (similar to game's approach)
    const mapArea = this.width * this.height;
    const baseArea = 4536; // STANDARD map area
    const basePlates = 18; // Higher base for better coverage
    const numPlates = Math.floor(basePlates * Math.sqrt(mapArea / baseArea) + this.random() * 6);

    console.log(`Generating ${numPlates} tectonic plates...`);

    // Generate initial random sites
    let sites = this.generateRandomSites(numPlates);

    // Apply Lloyd relaxation for even distribution
    const bbox = { xl: 0, xr: this.width, yt: 0, yb: this.height };
    for (let i = 0; i < this.lloydIterations; i++) {
      sites = this.lloydRelaxation(sites, bbox);
    }

    // Store sites
    this.sites = sites;

    // Compute final Voronoi diagram
    this.diagram = this.voronoi.compute(sites, bbox);
    this.cells = this.diagram.cells;

    console.log(`Created ${this.cells.length} Voronoi cells after Lloyd relaxation`);
  }

  /**
   * Simulate plate tectonics to create continents
   */
  simulate() {
    console.log('Initializing Voronoi plate tectonics with Lloyd relaxation...');
    this.initVoronoi();

    // Step 1: Assign plate properties
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      const site = cell.site;

      // Distance from poles and edges (affects land probability)
      const distFromPoleY = Math.min(site.y, this.height - site.y);
      const distFromEdgeX = Math.min(site.x, this.width - site.x);
      const distFromEdge = Math.min(distFromEdgeX, distFromPoleY);

      this.plates.set(i, {
        id: i,
        site: site,
        isLand: false,
        size: 0,
        growth: 0,
        edgeScore: distFromEdge,
        isMountainous: false
      });
    }

    // Step 2: Select plates to become land based on edge distance
    const plateArray = Array.from(this.plates.values());
    plateArray.sort((a, b) => b.edgeScore - a.edgeScore);

    // Target: enough land plates to achieve ~68% water after erosion
    // Need higher percentage because Lloyd-relaxed cells are more evenly sized
    const targetLandPlates = Math.floor(plateArray.length * 0.60);

    for (let i = 0; i < targetLandPlates; i++) {
      plateArray[i].isLand = true;
      plateArray[i].size = 1.0 + this.random() * this.variance;
    }

    // Step 3: Simulate plate growth/expansion over multiple iterations
    for (let iter = 0; iter < this.plateRotationMultiple; iter++) {
      plateArray.forEach(plate => {
        if (plate.isLand) {
          // Random growth simulation
          plate.growth += this.random() * (this.variance / this.plateRotationMultiple);
          plate.size += plate.growth;
        }
      });
    }

    // Step 4: Mark mountain formation (plate boundaries)
    plateArray.forEach(plate => {
      if (plate.isLand && this.random() < this.mountainPercent / 100) {
        plate.isMountainous = true;
      }
    });

    const landPlates = plateArray.filter(p => p.isLand).length;
    console.log(`Generated ${landPlates} land plates out of ${plateArray.length} total plates`);
  }

  /**
   * Find which Voronoi cell a point belongs to
   */
  findCell(x, y) {
    let minDist = Infinity;
    let closestCell = 0;

    for (let i = 0; i < this.cells.length; i++) {
      const site = this.cells[i].site;
      const dx = x - site.x;
      const dy = y - site.y;
      const dist = dx * dx + dy * dy;

      if (dist < minDist) {
        minDist = dist;
        closestCell = i;
      }
    }

    return closestCell;
  }

  /**
   * Convert Voronoi plates to hex grid
   */
  generateHexGrid() {
    console.log('Generating hex grid...');
    this.hexGrid = [];

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        // Convert hex coordinates to Voronoi coordinates
        const hexWidth = Math.sqrt(3);
        const xOffset = (y % 2 === 0) ? 0 : hexWidth / 2;
        const vx = x * hexWidth + xOffset;
        const vy = y * 1.5;

        // Find which cell this hex belongs to
        const cellIndex = this.findCell(vx, vy);
        const plate = this.plates.get(cellIndex);

        // Determine terrain type
        let terrain = TerrainType.Water;

        if (plate && plate.isLand) {
          // Apply polar water
          if (y < this.polarWaterRows || y >= this.height - this.polarWaterRows) {
            terrain = TerrainType.Water;
          } else {
            // Base terrain
            terrain = TerrainType.Flat;

            // Add hills
            if (this.random() < 0.25) {
              terrain = TerrainType.Rough;
            }

            // Mountains near plate boundaries
            if (plate.isMountainous && this.random() < 0.3) {
              terrain = TerrainType.Mountainous;
            }

            // Coastal erosion
            const neighbors = this.getNeighbors(x, y);
            const hasWaterNeighbor = neighbors.some(([nx, ny]) => {
              if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) return true;
              const nCellIndex = this.findCell(
                nx * hexWidth + ((ny % 2 === 0) ? 0 : hexWidth / 2),
                ny * 1.5
              );
              const nPlate = this.plates.get(nCellIndex);
              return !nPlate || !nPlate.isLand;
            });

            if (hasWaterNeighbor && this.random() < this.erosionPercent / 100) {
              terrain = TerrainType.Water;
            }
          }
        }

        // Add coastal islands
        if (terrain === TerrainType.Water && y >= this.polarWaterRows && y < this.height - this.polarWaterRows) {
          const neighbors = this.getNeighbors(x, y);
          const hasLandNeighbor = neighbors.some(([nx, ny]) => {
            if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) return false;
            const nCellIndex = this.findCell(
              nx * hexWidth + ((ny % 2 === 0) ? 0 : hexWidth / 2),
              ny * 1.5
            );
            const nPlate = this.plates.get(nCellIndex);
            return nPlate && nPlate.isLand;
          });

          if (hasLandNeighbor && this.random() < this.config.coastalIslands / 1000) {
            terrain = TerrainType.Flat;
          }
        }

        this.hexGrid.push({
          x: x,
          y: y,
          terrain: terrain,
          plateId: cellIndex
        });
      }
    }

    console.log('Hex grid generation complete!');
    return this.hexGrid;
  }

  /**
   * Get hexagonal neighbors (6 adjacent hexes)
   */
  getNeighbors(x, y) {
    const evenRow = y % 2 === 0;
    const offsets = evenRow
      ? [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]
      : [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];

    return offsets.map(([dx, dy]) => [x + dx, y + dy]);
  }

  /**
   * Get terrain statistics
   */
  getStatistics() {
    const stats = {
      total: this.hexGrid.length,
      water: 0,
      flat: 0,
      rough: 0,
      mountain: 0
    };

    this.hexGrid.forEach(hex => {
      switch (hex.terrain) {
        case TerrainType.Water:
          stats.water++;
          break;
        case TerrainType.Flat:
          stats.flat++;
          break;
        case TerrainType.Rough:
          stats.rough++;
          break;
        case TerrainType.Mountainous:
        case TerrainType.Volcano:
          stats.mountain++;
          break;
      }
    });

    stats.waterPercent = (stats.water / stats.total * 100).toFixed(1);
    stats.landPercent = ((stats.total - stats.water) / stats.total * 100).toFixed(1);

    return stats;
  }

  /**
   * Clean up Voronoi diagram
   */
  cleanup() {
    if (this.diagram) {
      this.voronoi.recycle(this.diagram);
    }
  }
}

module.exports = {
  VoronoiGeneratorV2,
  TerrainType,
  MAP_SIZE_CONFIGS
};
