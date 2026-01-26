# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Civilization VII mod** called "Continents++" that implements realistic map generation using **Voronoi plate tectonics simulation** with dynamic multi-continent support.

### Key Features

- **3-7 Dynamic Continents**: Uses `UnifiedContinentsBase` for variable landmass count based on map size
- **Randomized Parameters**: Each map uses seeded RNG for unique but reproducible configurations
- **Earth-like Water Coverage**: Targets ~65-70% water with asymmetric continent sizes
- **Organic Coastlines**: Fractal erosion creates natural-looking shores and bays
- **Scattered Archipelagos**: Mid-ocean islands and coastal island chains
- **Map Size Scaling**: All parameters scale appropriately from Tiny to Huge maps

## Project Structure

```
ContinentsPlusPlus/
├── ContinentsPlusPlus.modinfo         # Mod configuration and module loading
├── CLAUDE.md                          # This documentation file
├── README.md                          # User installation/usage guide
├── .gitignore                         # Git ignore rules
├── modules/
│   ├── config/
│   │   ├── config.xml                 # Map database entry
│   │   └── MapParameters.xml          # UI parameter definitions (future use)
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

### UnifiedContinentsBase System

The mod uses `UnifiedContinentsBase` instead of the default `VoronoiContinents` class. This enables:

- **Dynamic landmass count** (3-7 continents vs fixed 2)
- **Configurable total land size** via `m_settings.totalLandmassSize`
- **Proper size calculations** via `applySettings()` method

#### Key Imports

```javascript
import { UnifiedContinentsBase } from '/base-standard/scripts/voronoi_maps/unified-continents-base.js';
import { kdTree, TerrainType, WrapType } from '/base-standard/scripts/kd-tree.js';
import { GeneratorType } from '/base-standard/scripts/voronoi_generators/map-generator.js';
import { RuleAvoidEdge } from '/base-standard/scripts/voronoi_rules/avoid-edge.js';
```

### Initialization Sequence

**CRITICAL**: `UnifiedContinentsBase` does NOT have an `init()` method. Must use `initInternal()`:

```javascript
const voronoiMap = new UnifiedContinentsBase();

// 1. Set m_settings BEFORE initInternal (applySettings reads these)
const voronoiSettings = voronoiMap.getSettings();
voronoiSettings.landmassCount = 4;        // Dynamic: 3-7 based on map size
voronoiSettings.totalLandmassSize = 25;   // Controls water coverage

// 2. Call initInternal with required parameters
voronoiMap.initInternal(
  mapSizeIndex,           // Map size enum (0-4)
  GeneratorType.Continent,
  defaultGeneratorSettings,  // JSON config object
  cellCountMultiple,      // Usually 1
  relaxationSteps,        // Usually 3
  WrapType.WrapX          // Cylindrical world
);

// 3. Get generator settings and modify post-init properties
const generatorSettings = voronoiMap.getGenerator().getSettings();
// Now safe to modify erosion, coastal islands, etc.
```

### Voronoi System Constraints

| Property | When to Set | Notes |
|----------|-------------|-------|
| `m_settings.landmassCount` | BEFORE initInternal | Controls number of continents |
| `m_settings.totalLandmassSize` | BEFORE initInternal | Controls water coverage |
| `landmass[n].size` | Set by applySettings | DO NOT override |
| `landmass[n].variance` | Set by applySettings | DO NOT override |
| `landmass[n].spawnCenterDistance` | Set by applySettings | DO NOT override |
| `landmass[n].erosionPercent` | AFTER initInternal | Safe to modify |
| `landmass[n].coastalIslands` | AFTER initInternal | Safe to modify |
| `landmass[n].playerAreas` | AFTER initInternal | Safe to modify |
| `island.*` | AFTER initInternal | All island settings safe |
| `mountain.*` | AFTER initInternal | All mountain settings safe |
| `volcano.*` | AFTER initInternal | All volcano settings safe |

### Map Size Configuration

```javascript
const MAP_SIZE_CONFIGS = {
  0: { name: 'TINY',     landmassCount: { min: 3, max: 4 }, totalLandmassSize: { min: 20, max: 26 } },
  1: { name: 'SMALL',    landmassCount: { min: 3, max: 5 }, totalLandmassSize: { min: 22, max: 28 } },
  2: { name: 'STANDARD', landmassCount: { min: 4, max: 5 }, totalLandmassSize: { min: 24, max: 30 } },
  3: { name: 'LARGE',    landmassCount: { min: 4, max: 6 }, totalLandmassSize: { min: 26, max: 34 } },
  4: { name: 'HUGE',     landmassCount: { min: 5, max: 7 }, totalLandmassSize: { min: 28, max: 38 } }
};
```

### Map Generation Flow

1. **Initialization**: Get map parameters, player count, map seed
2. **Random Config**: Generate randomized configuration using map seed
3. **Create Voronoi**: Instantiate `UnifiedContinentsBase`
4. **Set Pre-Init Settings**: Configure `landmassCount` and `totalLandmassSize` in `m_settings`
5. **Initialize**: Call `initInternal()` with generator settings
6. **Apply Post-Init Config**: Set erosion, coastal islands, mountains, volcanoes
7. **Configure Rules**: Set polar distance via `RuleAvoidEdge`
8. **Player Distribution**: Assign players evenly across continents
9. **Simulation**: Run `voronoiMap.simulate()`
10. **Terrain Application**: Convert Voronoi tiles to terrain types
11. **Standard Processing**: Mountains, volcanoes, lakes, rivers, biomes
12. **Resources & Starts**: Generate resources, assign starting positions

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

### Voronoi System

From `/base-standard/scripts/`:
- `voronoi_maps/unified-continents-base.js`: Main class for dynamic continents
- `voronoi_maps/map-common.js`: Base `VoronoiMap` class with `initInternal()`
- `voronoi_generators/map-generator.js`: `GeneratorType` enum
- `voronoi_rules/avoid-edge.js`: `RuleAvoidEdge` for polar control
- `kd-tree.js`: `TerrainType`, `WrapType`, `MapDims`

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

## Testing

### In-Game Testing

1. **Fully restart** Civilization VII (JS modules are cached)
2. **Start new game** with "Continents++" map script
3. **Check console logs** for:
   ```
   [ContinentsPP] Landmass count: 4
   [ContinentsPP] Using UnifiedContinentsBase for 4 continents
   [ContinentsPP] Pre-init settings: landmassCount=4, totalLandmassSize=27
   [ContinentsPP] Voronoi generator initialized successfully
   [ContinentsPP] Post-init landmass count: 4
   [ContinentsPP] Configuring 4 landmasses
   ```

4. **Verify "Grow Landmasses"** shows 3-7 regions (not just 2)

### Visual Verification

- Multiple distinct continents (3-7 based on map size)
- Organic, irregular coastlines
- Coastal islands near landmasses
- Mid-ocean islands
- ~65-70% water coverage

### Debugging

**IMPORTANT**: Always check the game logs when debugging issues:

```
C:\Users\miguel\AppData\Local\Firaxis Games\Sid Meier's Civilization VII\Logs
```

Key log files:
- `Lua.log` - Script errors and console output
- `Database.log` - XML loading errors (check for mod-related warnings)
- `Modding.log` - Mod loading and activation issues

### Troubleshooting

**XML loading errors** (e.g., "Error Loading XML" with rollback):
- Check `Database.log` for specific error messages
- Common issues: wrong attribute names, missing required columns
- Verify XML matches base game format in `SetupParameters.xml`

**"voronoiMap.init is not a function"**:
- Must use `initInternal()`, not `init()` - UnifiedContinentsBase doesn't define `init()`

**Only 2 continents generated**:
- Ensure `m_settings.landmassCount` is set BEFORE `initInternal()`
- Restart game completely to reload cached JS modules

**Script crashes silently**:
- Add try-catch blocks around `initInternal()` and check for stack traces in logs
- Verify all required imports are present (WrapType, GeneratorType)

**Map options not appearing in UI**:
- Check `Database.log` for XML parse errors
- Verify `Key2` matches exact map script path from `Maps` table
- Use `Configuration.getMapValue("KeyName")` to read values in JS

## Tuning Guide

### Adjusting Water Coverage

To increase water (less land):
- Decrease `totalLandmassSize` values in `MAP_SIZE_CONFIGS`

To decrease water (more land):
- Increase `totalLandmassSize` values

### Adjusting Continent Count

Modify `landmassCount.min` and `landmassCount.max` in `MAP_SIZE_CONFIGS`:
- Valid range: 0-12 (per UnifiedContinentsBase schema)
- Recommended: 3-7 for balanced gameplay

### Adjusting Coastline Complexity

- Higher `erosionPercent` = more irregular coastlines
- Lower `erosionPercent` = smoother coastlines
- Range: 6-18% recommended

### Adjusting Island Density

- `coastalIslands`: Number of islands near each continent
- `island.totalSize`: Mid-ocean island coverage
- `island.variance`: Size variation of islands

## Key Code Locations

| Component | File | Lines |
|-----------|------|-------|
| Map size configs | continents-plus-plus.js | 97-171 |
| Random config generator | continents-plus-plus.js | 177-285 |
| Voronoi initialization | continents-plus-plus.js | 427-496 |
| Config application | continents-plus-plus.js | 317-362 |
| Terrain application | continents-plus-plus.js | 485-506 |
| Player distribution | continents-plus-plus.js | 513-530 |
