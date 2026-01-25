#!/usr/bin/env node

/**
 * Continents++ Map Preview Tool
 * Generates preview images of Voronoi-based maps
 */

const fs = require('fs');
const path = require('path');
const { VoronoiGeneratorV2, MAP_SIZE_CONFIGS } = require('./voronoi-generator-v2');
const { MapRenderer } = require('./map-renderer');

// Parse command line arguments
const args = process.argv.slice(2);

function printUsage() {
  console.log(`
Continents++ Map Preview Tool
==============================

Usage: node src/index.js [options]

Options:
  --size <SIZE>       Map size: TINY, SMALL, STANDARD, LARGE, HUGE
                      Default: STANDARD

  --seed <NUMBER>     Random seed for generation (for reproducibility)
                      Default: random

  --output <PATH>     Output PNG file path
                      Default: ./output/map-preview.png

  --grid             Show hex grid overlay

  --voronoi          Show Voronoi plate boundaries

  --all              Generate all map sizes

  --help             Show this help message

Examples:
  node src/index.js --size HUGE --seed 12345
  node src/index.js --size STANDARD --grid --output my-map.png
  node src/index.js --all
  `);
}

function parseArgs(args) {
  const options = {
    size: 'STANDARD',
    seed: Date.now(),
    output: './output/map-preview.png',
    grid: false,
    voronoi: false,
    all: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      case '--size':
        options.size = args[++i].toUpperCase();
        if (!MAP_SIZE_CONFIGS[options.size]) {
          console.error(`Invalid map size: ${options.size}`);
          console.error(`Valid sizes: ${Object.keys(MAP_SIZE_CONFIGS).join(', ')}`);
          process.exit(1);
        }
        break;
      case '--seed':
        options.seed = parseInt(args[++i], 10);
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--grid':
        options.grid = true;
        break;
      case '--voronoi':
        options.voronoi = true;
        break;
      case '--all':
        options.all = true;
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        printUsage();
        process.exit(1);
    }
  }

  return options;
}

function generateMap(size, seed, options) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Generating ${size} map (seed: ${seed})`);
  console.log('='.repeat(60));

  // Generate Voronoi map with improved algorithm
  const generator = new VoronoiGeneratorV2(size, seed);
  generator.simulate();
  const hexGrid = generator.generateHexGrid();

  // Display statistics
  const stats = generator.getStatistics();
  console.log(`\nMap Statistics:`);
  console.log(`  Total tiles: ${stats.total}`);
  console.log(`  Water: ${stats.water} (${stats.waterPercent}%)`);
  console.log(`  Land: ${stats.total - stats.water} (${stats.landPercent}%)`);
  console.log(`    - Flat: ${stats.flat}`);
  console.log(`    - Hills: ${stats.rough}`);
  console.log(`    - Mountains: ${stats.mountain}`);

  // Render to canvas
  const renderer = new MapRenderer(
    hexGrid,
    generator.width,
    generator.height,
    seed
  );

  let canvas;
  if (options.voronoi) {
    console.log('\nRendering with Voronoi plate boundaries...');
    canvas = renderer.renderWithVoronoi();
  } else if (options.grid) {
    console.log('\nRendering with hex grid overlay...');
    canvas = renderer.renderWithGrid();
  } else {
    console.log('\nRendering map...');
    canvas = renderer.render();
  }

  return canvas;
}

function saveCanvas(canvas, outputPath) {
  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Save PNG
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`\n✓ Map saved to: ${path.resolve(outputPath)}`);
}

function main() {
  const options = parseArgs(args);

  if (options.all) {
    // Generate all map sizes
    const sizes = Object.keys(MAP_SIZE_CONFIGS);
    console.log(`\nGenerating all ${sizes.length} map sizes...`);

    sizes.forEach(size => {
      const canvas = generateMap(size, options.seed, options);
      const outputPath = path.join(
        path.dirname(options.output),
        `map-preview-${size.toLowerCase()}.png`
      );
      saveCanvas(canvas, outputPath);
    });

    console.log(`\n✓ All maps generated successfully!`);
  } else {
    // Generate single map
    const canvas = generateMap(options.size, options.seed, options);
    saveCanvas(canvas, options.output);
  }

  console.log(`\nDone!`);
}

// Run if called directly
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

module.exports = { generateMap, saveCanvas };
