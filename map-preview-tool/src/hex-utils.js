/**
 * Hexagonal grid utilities for rendering
 * Uses "even-r" offset coordinates (same as Civ VII)
 */

/**
 * Calculates pixel position for hex center
 * @param {number} x - Hex column
 * @param {number} y - Hex row
 * @param {number} hexSize - Radius of hex in pixels
 * @returns {{x: number, y: number}} Pixel coordinates
 */
function hexToPixel(x, y, hexSize) {
  const hexWidth = hexSize * Math.sqrt(3);
  const hexHeight = hexSize * 2;

  // Even-r horizontal offset
  const xOffset = (y % 2 === 0) ? 0 : hexWidth / 2;

  const pixelX = x * hexWidth + xOffset;
  const pixelY = y * hexHeight * 0.75; // 3/4 overlap

  return { x: pixelX, y: pixelY };
}

/**
 * Generates hexagon polygon points
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} size - Hex radius
 * @returns {Array<number[]>} Array of [x, y] points
 */
function hexagonPoints(cx, cy, size) {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    points.push([x, y]);
  }
  return points;
}

/**
 * Calculates canvas size needed for hex grid
 * @param {number} width - Grid width in hexes
 * @param {number} height - Grid height in hexes
 * @param {number} hexSize - Hex radius in pixels
 * @returns {{width: number, height: number}} Canvas dimensions
 */
function calculateCanvasSize(width, height, hexSize) {
  const hexWidth = hexSize * Math.sqrt(3);
  const hexHeight = hexSize * 2;

  const canvasWidth = Math.ceil(width * hexWidth + hexWidth / 2);
  const canvasHeight = Math.ceil(height * hexHeight * 0.75 + hexHeight * 0.25);

  return { width: canvasWidth, height: canvasHeight };
}

module.exports = {
  hexToPixel,
  hexagonPoints,
  calculateCanvasSize
};
