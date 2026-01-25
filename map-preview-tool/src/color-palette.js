/**
 * Color palette for map rendering
 * All colors in RGB format [R, G, B]
 */

const TERRAIN_COLORS = {
  TERRAIN_OCEAN: [28, 66, 107],           // Deep blue
  TERRAIN_COAST: [82, 128, 169],          // Light blue
  TERRAIN_FLAT: [180, 160, 120],          // Tan/beige
  TERRAIN_HILL: [140, 120, 90],           // Brown
  TERRAIN_MOUNTAIN: [90, 85, 80]          // Dark gray
};

const BIOME_COLORS = {
  BIOME_GRASSLAND: [130, 180, 90],        // Green
  BIOME_PLAINS: [200, 190, 130],          // Yellow-tan
  BIOME_DESERT: [230, 210, 150],          // Sandy
  BIOME_TUNDRA: [220, 235, 245],          // Pale blue
  BIOME_TROPICAL: [90, 150, 60],          // Dark green
  BIOME_SNOW: [250, 250, 255]             // White
};

const FEATURE_COLORS = {
  FEATURE_FOREST: [50, 100, 50],          // Dark green
  FEATURE_JUNGLE: [40, 90, 40],           // Very dark green
  FEATURE_VOLCANO: [180, 50, 30],         // Red-orange
  FEATURE_ICE: [240, 250, 255],           // Ice white
  FEATURE_FLOODPLAIN: [150, 180, 110],    // Light green
  FEATURE_MARSH: [100, 120, 80],          // Murky green-brown
  FEATURE_OASIS: [80, 160, 140],          // Teal
  FEATURE_REEF: [100, 180, 170]           // Turquoise
};

const RESOURCE_COLORS = {
  RESOURCE_STRATEGIC: [255, 100, 100],    // Red
  RESOURCE_LUXURY: [255, 215, 0],         // Gold
  RESOURCE_BONUS: [150, 255, 150]         // Light green
};

/**
 * Blends two RGB colors with alpha transparency
 * @param {number[]} base - Base RGB color [R, G, B]
 * @param {number[]} overlay - Overlay RGB color [R, G, B]
 * @param {number} alpha - Alpha value (0-1)
 * @returns {number[]} Blended RGB color
 */
function blendColors(base, overlay, alpha) {
  return [
    Math.round(base[0] * (1 - alpha) + overlay[0] * alpha),
    Math.round(base[1] * (1 - alpha) + overlay[1] * alpha),
    Math.round(base[2] * (1 - alpha) + overlay[2] * alpha)
  ];
}

/**
 * Gets the final color for a plot considering terrain, biome, and features
 * @param {string} terrain - Terrain type name
 * @param {string|null} biome - Biome type name (or null)
 * @param {string|null} feature - Feature type name (or null)
 * @returns {number[]} Final RGB color [R, G, B]
 */
function getPlotColor(terrain, biome, feature) {
  // Start with terrain base color
  let color = TERRAIN_COLORS[terrain] || [128, 128, 128];

  // Apply biome overlay (50% opacity)
  if (biome && BIOME_COLORS[biome]) {
    color = blendColors(color, BIOME_COLORS[biome], 0.5);
  }

  // Apply feature overlay (70% opacity)
  if (feature && FEATURE_COLORS[feature]) {
    color = blendColors(color, FEATURE_COLORS[feature], 0.7);
  }

  return color;
}

module.exports = {
  TERRAIN_COLORS,
  BIOME_COLORS,
  FEATURE_COLORS,
  RESOURCE_COLORS,
  blendColors,
  getPlotColor
};
