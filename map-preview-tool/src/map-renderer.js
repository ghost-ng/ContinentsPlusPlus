/**
 * Map Renderer - Draws hex grid to canvas
 * Uses color-palette and hex-utils for rendering
 */

const { createCanvas } = require('@napi-rs/canvas');
const { hexToPixel, hexagonPoints, calculateCanvasSize } = require('./hex-utils');
const { getPlotColor, TERRAIN_COLORS } = require('./color-palette');
const { TerrainType } = require('./voronoi-generator-v2');
const { createNoise2D } = require('simplex-noise');
const seedrandom = require('seedrandom');

/**
 * Biome types matching Civ VII
 */
const BiomeType = {
  GRASSLAND: 'BIOME_GRASSLAND',
  PLAINS: 'BIOME_PLAINS',
  DESERT: 'BIOME_DESERT',
  TUNDRA: 'BIOME_TUNDRA',
  TROPICAL: 'BIOME_TROPICAL',
  SNOW: 'BIOME_SNOW'
};

class MapRenderer {
  constructor(hexGrid, width, height, seed = Date.now()) {
    this.hexGrid = hexGrid;
    this.width = width;
    this.height = height;
    this.hexSize = 8; // Hex radius in pixels
    this.seed = seed;
    this.rng = seedrandom(seed.toString());

    // Create noise generators for biomes and features
    this.tempNoise = createNoise2D(seedrandom(seed.toString()));
    this.moistureNoise = createNoise2D(seedrandom((seed + 1).toString()));
    this.featureNoise = createNoise2D(seedrandom((seed + 2).toString()));
  }

  /**
   * Assign biomes based on latitude and noise
   */
  assignBiome(hex) {
    if (hex.terrain === TerrainType.Water) {
      return null;
    }

    // Latitude-based temperature (poles are cold)
    const latitudeFactor = Math.abs(hex.y - this.height / 2) / (this.height / 2);

    // Add noise for variety
    const tempNoise = this.tempNoise(hex.x * 0.1, hex.y * 0.1);
    const temperature = latitudeFactor + tempNoise * 0.3;

    // Moisture from noise
    const moisture = this.moistureNoise(hex.x * 0.08, hex.y * 0.08);

    // Biome assignment based on temperature and moisture
    if (temperature > 0.8) {
      return BiomeType.SNOW;
    } else if (temperature > 0.6) {
      return BiomeType.TUNDRA;
    } else if (temperature < 0.2 && moisture > 0.1) {
      return BiomeType.TROPICAL;
    } else if (moisture < -0.2) {
      return BiomeType.DESERT;
    } else if (moisture > 0.2) {
      return BiomeType.GRASSLAND;
    } else {
      return BiomeType.PLAINS;
    }
  }

  /**
   * Assign features (forests, etc.) based on biome and noise
   */
  assignFeature(hex, biome) {
    if (hex.terrain === TerrainType.Water || hex.terrain === TerrainType.Mountainous) {
      return null;
    }

    const featureNoise = this.featureNoise(hex.x * 0.15, hex.y * 0.15);

    // Forests in grassland/plains/tropical
    if ((biome === BiomeType.GRASSLAND || biome === BiomeType.PLAINS) && featureNoise > 0.3) {
      return 'FEATURE_FOREST';
    } else if (biome === BiomeType.TROPICAL && featureNoise > 0.2) {
      return 'FEATURE_JUNGLE';
    }

    return null;
  }

  /**
   * Map TerrainType to terrain string
   */
  getTerrainString(terrainType) {
    switch (terrainType) {
      case TerrainType.Water:
        return 'TERRAIN_OCEAN';
      case TerrainType.Flat:
        return 'TERRAIN_FLAT';
      case TerrainType.Rough:
        return 'TERRAIN_HILL';
      case TerrainType.Mountainous:
      case TerrainType.Volcano:
        return 'TERRAIN_MOUNTAIN';
      default:
        return 'TERRAIN_OCEAN';
    }
  }

  /**
   * Render the map to a canvas
   */
  render() {
    console.log('Rendering map to canvas...');

    // Calculate canvas size
    const { width: canvasWidth, height: canvasHeight } = calculateCanvasSize(
      this.width,
      this.height,
      this.hexSize
    );

    // Create canvas
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    // Fill background (ocean color)
    ctx.fillStyle = `rgb(${TERRAIN_COLORS.TERRAIN_OCEAN.join(',')})`;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw each hex
    this.hexGrid.forEach(hex => {
      const { x: pixelX, y: pixelY } = hexToPixel(hex.x, hex.y, this.hexSize);
      const points = hexagonPoints(pixelX, pixelY, this.hexSize);

      // Determine terrain, biome, and feature
      const terrain = this.getTerrainString(hex.terrain);
      const biome = this.assignBiome(hex);
      const feature = this.assignFeature(hex, biome);

      // Get color
      const color = getPlotColor(terrain, biome, feature);

      // Draw hex
      ctx.fillStyle = `rgb(${color.join(',')})`;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0], points[i][1]);
      }
      ctx.closePath();
      ctx.fill();

      // Optional: Draw hex borders for clarity
      if (this.hexSize > 4) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    });

    console.log('Rendering complete!');
    return canvas;
  }

  /**
   * Render with grid overlay for debugging
   */
  renderWithGrid() {
    const canvas = this.render();
    const ctx = canvas.getContext('2d');

    // Draw coordinate grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;

    this.hexGrid.forEach(hex => {
      const { x: pixelX, y: pixelY } = hexToPixel(hex.x, hex.y, this.hexSize);
      const points = hexagonPoints(pixelX, pixelY, this.hexSize);

      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0], points[i][1]);
      }
      ctx.closePath();
      ctx.stroke();
    });

    return canvas;
  }

  /**
   * Render with Voronoi cell boundaries overlay
   */
  renderWithVoronoi() {
    const canvas = this.render();
    const ctx = canvas.getContext('2d');

    // Draw plate boundaries
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
    ctx.lineWidth = 1;

    // Group hexes by plate
    const plateGroups = new Map();
    this.hexGrid.forEach(hex => {
      if (!plateGroups.has(hex.plateId)) {
        plateGroups.set(hex.plateId, []);
      }
      plateGroups.get(hex.plateId).push(hex);
    });

    // Draw boundaries between different plates
    this.hexGrid.forEach(hex => {
      const neighbors = this.getNeighbors(hex.x, hex.y);
      neighbors.forEach(([nx, ny]) => {
        if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) return;

        const neighborIndex = ny * this.width + nx;
        const neighbor = this.hexGrid[neighborIndex];

        if (neighbor && neighbor.plateId !== hex.plateId) {
          const { x: x1, y: y1 } = hexToPixel(hex.x, hex.y, this.hexSize);
          const { x: x2, y: y2 } = hexToPixel(nx, ny, this.hexSize);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      });
    });

    return canvas;
  }

  /**
   * Get hexagonal neighbors
   */
  getNeighbors(x, y) {
    const evenRow = y % 2 === 0;
    const offsets = evenRow
      ? [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]
      : [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];

    return offsets.map(([dx, dy]) => [x + dx, y + dy]);
  }
}

module.exports = { MapRenderer };
