/**
 * Simplified Voronoi Plate Tectonics Generator
 * Uses d3-delaunay to approximate the behavior of VoronoiContinents
 */

const { Delaunay } = require('d3-delaunay');
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

class VoronoiGenerator {
  constructor(mapSize = 'STANDARD', seed = Date.now()) {
    this.config = MAP_SIZE_CONFIGS[mapSize];
    this.width = this.config.width;
    this.height = this.config.height;
    this.rng = seedrandom(seed.toString());
    this.seed = seed;

    // Voronoi data
    this.sites = [];
    this.delaunay = null;
    this.voronoi = null;

    // Plate data
    this.plates = [];
    this.hexGrid = [];

    // Constants
    this.polarWaterRows = 2;
    this.plateRotationMultiple = 5;
    this.variance = 5;
    this.erosionPercent = 4;
    this.mountainPercent = 12;
  }

  /**
   * Generate random point using seeded RNG
   */
  random() {
    return this.rng();
  }

  /**
   * Generate Poisson disc samples for plate sites
   * This creates evenly-spaced points for Voronoi cells
   */
  generatePoissonSites(numSites) {
    const sites = [];
    const minDist = Math.sqrt((this.width * this.height) / numSites) * 0.7;
    const maxAttempts = 30;

    // Start with a random point
    sites.push([
      this.random() * this.width,
      this.random() * this.height
    ]);

    // Generate more points using Poisson disc sampling
    for (let i = 0; i < numSites - 1; i++) {
      let attempts = 0;
      let validPoint = false;

      while (!validPoint && attempts < maxAttempts) {
        const point = [
          this.random() * this.width,
          this.random() * this.height
        ];

        // Check distance to all existing points
        validPoint = sites.every(site => {
          const dx = site[0] - point[0];
          const dy = site[1] - point[1];
          const dist = Math.sqrt(dx * dx + dy * dy);
          return dist >= minDist;
        });

        if (validPoint) {
          sites.push(point);
        }
        attempts++;
      }

      // If we can't find a valid point, just add a random one
      if (!validPoint) {
        sites.push([
          this.random() * this.width,
          this.random() * this.height
        ]);
      }
    }

    return sites;
  }

  /**
   * Initialize Voronoi diagram with plate sites
   */
  initVoronoi() {
    // Scale number of plates with map size
    // Target: plates should scale proportionally with map area
    const mapArea = this.width * this.height;
    const baseArea = 4536; // STANDARD map area
    const basePlates = 15;
    const numPlates = Math.floor(basePlates * (mapArea / baseArea) + this.random() * 5);
    this.sites = this.generatePoissonSites(Math.max(8, numPlates)); // Minimum 8 plates

    // Create Delaunay triangulation and Voronoi diagram
    this.delaunay = Delaunay.from(this.sites);
    this.voronoi = this.delaunay.voronoi([0, 0, this.width, this.height]);

    // Initialize plate data
    this.plates = this.sites.map((site, i) => ({
      id: i,
      site: site,
      isLand: false,
      size: 0,
      isMountainous: false
    }));
  }

  /**
   * Simulate plate tectonics to create continents
   * This is a simplified version of the actual VoronoiContinents.simulate()
   */
  simulate() {
    console.log('Initializing Voronoi plate tectonics...');
    this.initVoronoi();

    // Step 1: Select plates to become land
    // We need MORE plates as land to account for erosion and polar water
    // Target ~50% of plates as land (after erosion and polar adjustment, will become ~32% land / 68% water)
    const targetLandPlates = Math.floor(this.plates.length * 0.5);

    // Prefer plates away from poles and edges
    const plateScores = this.plates.map((plate, i) => {
      const [x, y] = plate.site;
      const distFromPole = Math.min(y, this.height - y);
      const distFromEdge = Math.min(x, this.width - x, distFromPole);
      return { id: i, score: distFromEdge + this.random() * 5 };
    });

    plateScores.sort((a, b) => b.score - a.score);

    // Mark top plates as land
    for (let i = 0; i < targetLandPlates; i++) {
      this.plates[plateScores[i].id].isLand = true;
    }

    // Step 2: Apply plate rotation and expansion (simplified)
    // In the real system, plates rotate and expand over multiple iterations
    for (let iteration = 0; iteration < this.plateRotationMultiple; iteration++) {
      // Randomly expand some land plates
      this.plates.forEach(plate => {
        if (plate.isLand && this.random() < 0.3) {
          plate.size += this.random() * this.variance;
        }
      });
    }

    // Step 3: Mark mountain formation at plate boundaries
    // Mountains form where plates meet
    this.plates.forEach(plate => {
      if (plate.isLand && this.random() < this.mountainPercent / 100) {
        plate.isMountainous = true;
      }
    });

    console.log(`Generated ${this.plates.filter(p => p.isLand).length} land plates out of ${this.plates.length} total plates`);
  }

  /**
   * Convert Voronoi plates to hex grid
   * Maps each hex tile to its corresponding Voronoi cell
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

        // Find which Voronoi cell this hex belongs to
        const cellIndex = this.delaunay.find(vx, vy);
        const plate = this.plates[cellIndex];

        // Determine terrain type
        let terrain = TerrainType.Water;

        if (plate.isLand) {
          // Apply polar water
          if (y < this.polarWaterRows || y >= this.height - this.polarWaterRows) {
            terrain = TerrainType.Water;
          } else {
            // Base terrain
            terrain = TerrainType.Flat;

            // Add some hills (rough terrain)
            if (this.random() < 0.25) {
              terrain = TerrainType.Rough;
            }

            // Mountains at plate boundaries or mountainous plates
            if (plate.isMountainous && this.random() < 0.4) {
              terrain = TerrainType.Mountainous;
            }

            // Erosion - randomly convert some coastal tiles back to water
            const neighbors = this.getNeighbors(x, y);
            const hasWaterNeighbor = neighbors.some(([nx, ny]) => {
              if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) return true;
              const nCellIndex = this.delaunay.find(
                nx * hexWidth + ((ny % 2 === 0) ? 0 : hexWidth / 2),
                ny * 1.5
              );
              return !this.plates[nCellIndex].isLand;
            });

            if (hasWaterNeighbor && this.random() < this.erosionPercent / 100) {
              terrain = TerrainType.Water;
            }
          }
        }

        // Add coastal islands
        if (terrain === TerrainType.Water) {
          const neighbors = this.getNeighbors(x, y);
          const hasLandNeighbor = neighbors.some(([nx, ny]) => {
            if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) return false;
            const nCellIndex = this.delaunay.find(
              nx * hexWidth + ((ny % 2 === 0) ? 0 : hexWidth / 2),
              ny * 1.5
            );
            return this.plates[nCellIndex].isLand;
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
}

module.exports = {
  VoronoiGenerator,
  TerrainType,
  MAP_SIZE_CONFIGS
};
