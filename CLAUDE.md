# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Civilization VII mod** called "Continents++" that implements realistic map generation using **Voronoi plate tectonics simulation** with **research-backed parameters** from fantasy cartography and game design theory.

### Key Features

- **Voronoi Plate Tectonics**: Uses `VoronoiContinents` class for realistic continental generation
- **Randomized Parameters**: Each map generation produces unique configurations using seeded RNG
- **Configurable Land Coverage**: `totalLandmassSize` controls water-to-land ratio
- **Research-Backed Design**: Parameters based on fractal coastline theory, power-law distributions, and game balance research
- **Map Size Scaling**: All parameters scale appropriately from Tiny to Huge maps
- **Earth-like Distribution**: ~65-70% water coverage with asymmetric continent sizes

## Project Structure

```
ContinentsPlusPlus/
├── ContinentsPlusPlus.modinfo         # Mod configuration and module loading
├── CLAUDE.md                          # This documentation file
├── .gitignore                         # Git ignore rules
├── modules/
│   ├── config/
│   │   ├── config.xml                 # Map database entry
│   │   └── MapParameters.xml          # UI parameter definitions (unused)
│   ├── maps/
│   │   ├── continents-plus-plus.js    # Main map generation script
│   │   └── assign-starting-plots.js   # Player starting position logic
│   └── text/
│       └── en_us/
│           ├── MapText.xml            # In-game localization
│           └── ModuleText.xml         # Mod manager localization
└── map-preview-tool/                  # Preview tool infrastructure (incomplete)
```

## Core Architecture

### Enhanced Map Generation System

The map generation uses a **randomized configuration system** that produces unique but balanced maps each generation.

#### Key Components:

1. **Seeded Random Number Generator** (`createSeededRandom`):
   - Uses mulberry32 algorithm for deterministic randomization
   - Same map seed produces identical parameters (reproducible)
   - Different seeds produce varied terrain configurations

2. **Map Size Configurations** (`MAP_SIZE_CONFIGS`):
   - Research-backed parameter ranges for each map size
   - Defines min/max values for randomization
   - Includes `totalLandmassSize` to control water coverage

3. **Randomized Config Generator** (`generateRandomizedConfig`):
   - Produces unique configuration each generation
   - Randomizes: total landmass size, continent ratios, erosion, islands, mountains, volcanoes

4. **Config Applier** (`applyRandomizedConfig`):
   - Safely modifies generator settings after init()
   - Sets `totalLandmassSize` to control land/water ratio
   - Only touches properties that work post-initialization

### Voronoi System Constraints

**CRITICAL**: The `VoronoiContinents` class has specific constraints:

| Property | Modifiable After init()? | Notes |
|----------|-------------------------|-------|
| `totalLandmassSize` | YES | Controls overall land coverage |
| `landmass` array length | NO | Hardcoded to 2 landmasses |
| `landmass[n].size` | NO | Calculated during init() |
| `landmass[n].variance` | NO | Locked after init() |
| `landmass[n].playerAreas` | YES | Safe to modify |
| `landmass[n].erosionPercent` | YES | Safe to modify |
| `landmass[n].coastalIslands` | YES | Safe to modify |
| `landmass[n].coastalIslandsSize` | YES | Safe to modify |
| `island.*` | YES | All island settings safe |
| `mountain.*` | YES | All mountain settings safe |
| `volcano.*` | YES | All volcano settings safe |
| Rules (`getRules()`) | YES | Can modify rule weights/configs |

### Research-Backed Parameters

Based on analysis of:
- **Fractal coastline theory** (target dimension ~1.25-1.33)
- **Power-law island distributions** (many small, few large)
- **Game balance research** (player distribution, resource fairness)
- **Earth's continental distribution** (asymmetric sizes)

#### Map Size Scaling

| Map Size | Landmass Size | Erosion % | Coastal Islands | Island Size | Mountain % |
|----------|---------------|-----------|-----------------|-------------|------------|
| TINY     | 18-24         | 2-4%      | 4-8             | 2.5-4.5     | 10-14%     |
| SMALL    | 22-28         | 3-5%      | 6-12            | 3.5-5.5     | 10-15%     |
| STANDARD | 26-34         | 3-6%      | 8-16            | 4.5-7.0     | 11-15%     |
| LARGE    | 32-40         | 4-7%      | 12-20           | 5.5-8.5     | 11-16%     |
| HUGE     | 38-48         | 5-8%      | 14-24           | 6.5-10.0    | 12-17%     |

**Note**: Lower `Landmass Size` values = more water coverage. Target is ~65-70% water.

#### Continent Size Distribution

- Larger continent: 45-62% of total land (varies by map size)
- Smaller continent: 38-55% of total land
- Which continent is larger is randomized each generation

### Map Generation Flow

1. **Initialization**: Get map parameters, player count, map seed
2. **Random Config**: Generate randomized configuration using map seed
3. **Voronoi Setup**: Create and initialize `VoronoiContinents`
4. **Apply Config**: Set `totalLandmassSize` and other safe properties
5. **Configure Rules**: Set polar distance via `RuleAvoidEdge`
6. **Player Distribution**: Assign players proportionally to continents
7. **Simulation**: Run `voronoiMap.simulate()`
8. **Terrain Application**: Convert Voronoi tiles to terrain types
9. **Standard Processing**: Mountains, volcanoes, lakes, rivers, biomes
10. **Resources & Starts**: Generate resources, assign starting positions

## Module Configuration

### modinfo Structure

The `ContinentsPlusPlus.modinfo` file defines:

- **Properties**: Mod name (via LOC tag), description, author
- **Dependencies**: Requires `base-standard` mod
- **ActionGroups**:
  - `base-game-main-mapscript-template` (game scope): Loads text and scripts
  - `shell-mapscript-template` (shell scope): Database and UI entries
- **LocalizedText**: Points to both ModuleText.xml and MapText.xml
- **ScriptModules**: Registers JavaScript modules

### Database Configuration

`modules/config/config.xml` adds the map to selection menu:
```xml
<Row File="{ContinentsPlusPlus}modules/maps/continents-plus-plus.js"
     Name="Continents++"
     Description="LOC_CONTINENTS_PLUS_PLUS_DESCRIPTION"
     SortIndex="9"/>
```

## Working with Base Game Modules

### Voronoi System Imports

From `/base-standard/scripts/`:
- `voronoi_maps/continents.js`: `VoronoiContinents` class
- `voronoi_rules/avoid-edge.js`: `RuleAvoidEdge` for polar control
- `kd-tree.js`: `TerrainType` enum

### Standard Terrain Generation

From `/base-standard/maps/`:
- `elevation-terrain-generator.js`: Mountains, hills, lakes, rainfall
- `feature-biome-generator.js`: Biomes and features
- `natural-wonder-generator.js`: Natural wonder placement
- `resource-generator.js`: Resource distribution
- `volcano-generator.js`: Volcanic terrain
- `snow-generator.js`: Polar ice
- `discovery-generator.js`: Discovery mechanics
- `map-globals.js`: Global constants
- `map-utilities.js`: Helper functions

## Localization

Localization files in `modules/text/en_us/`:

**ModuleText.xml** - Mod manager display:
- `LOC_CONTINENTS_PLUS_PLUS_NAME`: "Continents++"
- `LOC_CONTINENTS_PLUS_PLUS_DESCRIPTION`: Enhanced map generation description

**MapText.xml** - In-game map chooser display:
- Same tags with more detailed description about unique maps, fractal coastlines, etc.

## Testing

### In-Game Testing

1. **Load the mod** in Civilization VII Addons menu
2. **Start new game** with "Continents++" map script
3. **Check console logs** for:
   - `[ContinentsPP] Generating randomized config for X map`
   - `[ContinentsPP] Total landmass size: XX`
   - `[ContinentsPP] Continent ratio: XX.X% / XX.X%`
   - `[ContinentsPP] Land/Water: XX.X% land / XX.X% water`

### Visual Verification

- 2 distinct continents with asymmetric sizes
- Organic, irregular coastlines (varied erosion)
- Coastal islands near landmasses
- Mid-ocean islands for naval gameplay
- ~65-70% water coverage (adjust `totalLandmassSize` if too much/little land)

### Multiple Generation Test

Generate several maps with same settings to verify randomization:
- Total landmass size should vary within configured range
- Continent size ratios should vary
- Erosion levels should differ
- Island counts should change
- Mountain placement should vary

## Key Technical Details

### Seeded Random Number Generator

```javascript
function createSeededRandom(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
```

- Uses mulberry32 algorithm
- Deterministic: same seed = same sequence
- Used for all randomized parameters

### Terrain Type Mapping

```javascript
TerrainType.Flat → globals.g_FlatTerrain
TerrainType.Rough → globals.g_HillTerrain
TerrainType.Mountainous → globals.g_MountainTerrain
TerrainType.Volcano → globals.g_MountainTerrain
Non-land → globals.g_OceanTerrain
```

### Starting Position System

Uses **fertility-based method** (Civ VI algorithm):
1. Empty `startSectors` array triggers fallback
2. `StartPositioner.divideMapIntoMajorRegions()` creates regions
3. Players assigned based on fertility and start biases

## Tuning Guide

### Adjusting Water Coverage

To increase water (less land):
- Decrease `totalLandmassSize` min/max values in `MAP_SIZE_CONFIGS`
- Current values target ~65-70% water

To decrease water (more land):
- Increase `totalLandmassSize` min/max values

### Adjusting Coastline Complexity

- Higher `erosionPercent` = more irregular coastlines
- Lower `erosionPercent` = smoother coastlines

### Adjusting Island Density

- `coastalIslands`: Number of islands near continents
- `islandTotalSize`: Mid-ocean island coverage
- `islandVariance`: Size variation of islands

## Future Enhancements

Potential improvements if VoronoiContinents constraints can be bypassed:

1. **More than 2 continents**: Would require extending `UnifiedContinentsBase` class
2. **Dynamic continent count**: Scale with player count, not just map size
3. **Island chains**: Volcanic arc generation between continents
4. **Continental shelves**: More islands near coasts than deep ocean

These would require access to base game source files or reverse engineering the Voronoi system.
