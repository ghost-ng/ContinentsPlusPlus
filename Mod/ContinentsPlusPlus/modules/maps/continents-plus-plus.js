/**
 * Continents++ Map Script — v3 (new Voronoi API)
 *
 * Generates 2-8 randomized continents plus dedicated Distant Lands landmasses
 * using the base game's UnifiedContinentsBase (post-2026 patch Voronoi API).
 *
 * v3 is a full migration from the legacy pipeline (see git history for v2):
 * the old hand-rolled systems — terrain application, WEST/EAST region stamping,
 * distant-lands BFS, player distribution layers — are replaced by native
 * engine features: distantCount (distant landmasses with playerAreas=0),
 * landmassGroupCount (continent grouping), minPlayersPerLandmassGroup
 * (companion guarantee), and hex-map validation (bridging removal, forced
 * oceans between groups).
 *
 * Region ID semantics (new engine): landmass region id 0 = non-player land
 * (islands + distant landmasses, tagged PLOT_TAG_ISLAND), 1+ = player
 * landmass group id. player.isDistantLands() derives from these.
 */

const ContinentsPlusPlusVersion = "3.0.0-dev";
const ContinentsPlusPlusLogs = [];
var _cppOriginalLog = console.log;
console.log = function(...args) {
  _cppOriginalLog.apply(console, args);
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  if (msg.includes('[ContinentsPP]') || msg.includes('Continents++')) {
    ContinentsPlusPlusLogs.push(msg);
  }
};
/**
 * Persist a key/value readable from other JS contexts (UI/debug console).
 * The map-gen context's Configuration API varies by game version:
 * pre-patch had Configuration.editMap(); try every known channel.
 */
function persistMapValue(key, value) {
  try { Configuration.editMap().setValue(key, value); return 'editMap'; } catch (e) { /* next */ }
  try { Configuration.getMap().setValue(key, value); return 'getMap.setValue'; } catch (e) { /* next */ }
  try { Game.setProperty(key, value); return 'Game.setProperty'; } catch (e) { /* next */ }
  return null;
}

const _versionChannel = persistMapValue("ContinentsPlusPlusVersion", ContinentsPlusPlusVersion);
console.log(`Generating using script Continents++ v${ContinentsPlusPlusVersion}` +
  (_versionChannel ? ` (persist channel: ${_versionChannel})` : ' (no persistence channel available!)'));

import { UnifiedContinentsBase } from '/base-standard/scripts/voronoi_maps/unified-continents-base.js';
import { voronoiMapSchema } from '/base-standard/scripts/voronoi_maps/map-common.js';
import { HexValidationSettings, RemoveBridgingLandmassOptions, VoronoiValidationSettings, SeparationFilterOptions } from '/base-standard/scripts/hex-map.js';
import { RegionType, TerrainType } from '/base-standard/scripts/voronoi-types.js';
import { VoronoiUtils } from '/base-standard/scripts/voronoi-utils.js';
import fractalSettings from '/base-standard/scripts/voronoi_data/fractal.mapconfig.js';
import { generateMapFeatures } from '/base-standard/scripts/common-generation.js';
import { profileScope } from '/base-standard/scripts/profiling.js';
import { assignStartPositionsFromHexMap } from '/base-standard/maps/assign-starting-plots.js';
import { generateDiscoveries } from '/base-standard/maps/discovery-generator.js';
import { assignAdvancedStartRegions } from '/base-standard/maps/assign-advanced-start-region.js';
import { g_PolarWaterRows } from '/base-standard/maps/map-globals.js';

//──────────────────────────────────────────────────────────────────────────────
// MAP SIZE CONFIGURATION
// landmassCount is player continents only; distant landmasses are separate
// (distantCount). Ranges align with the Continent Count UI option text.
//──────────────────────────────────────────────────────────────────────────────

const MAP_SIZE_CONFIGS = {
  // Tiny distant fixed at 1 (T14, 2026-08-17): rolling 2 splits the small
  // distant budget into two ~30-tile islets, both below treasure viability.
  // Tiny Random max 4 → 3 (harness): 4 continents + distant don't fit a
  // 60×38 grid — the distant landmass gets squeezed below viability.
  // Few made size-aware (T16/harness, 2026-08-18): a flat 2-4 let Tiny roll
  // 4 (distant landmass squeezed out entirely) and Huge roll 2 (thirds
  // 40/50/10 — the "lopsided map" class). Standard+ floor is 3.
  // Tiny Many fixed at 5 (2026-08-18): 6 continents on 60×38 starves the
  // smallest below major size even at the schema's land-budget ceiling.
  // Global floor of 3 continents (user rule 2026-08-18): with 2 continents
  // the largest inevitably holds ~45-50% of all land — no single landmass
  // may dominate half the map, so 2-continent rolls are gone in ALL modes.
  0: { name: 'TINY',     few: { min: 3, max: 3 }, random: { min: 3, max: 3 }, many: { min: 5, max: 5 }, distant: { min: 1, max: 1 } },
  1: { name: 'SMALL',    few: { min: 3, max: 4 }, random: { min: 3, max: 5 }, many: { min: 5, max: 7 }, distant: { min: 1, max: 2 } },
  2: { name: 'STANDARD', few: { min: 3, max: 4 }, random: { min: 3, max: 5 }, many: { min: 5, max: 7 }, distant: { min: 1, max: 2 } },
  3: { name: 'LARGE',    few: { min: 3, max: 4 }, random: { min: 3, max: 6 }, many: { min: 5, max: 7 }, distant: { min: 1, max: 3 } },
  4: { name: 'HUGE',     few: { min: 3, max: 4 }, random: { min: 4, max: 7 }, many: { min: 5, max: 8 }, distant: { min: 2, max: 3 } }
};

const rollInt = (min, max, label) => Math.round(VoronoiUtils.getRandomMinMax(min, max, label));

/**
 * Build the randomized generation config from map size + UI options.
 * Uses the engine's seeded RandomImpl (via VoronoiUtils) so results are
 * reproducible per map seed.
 */
function buildCppConfig(mapSizeIndex, continentCountMode, distributionMode, humanCount, totalPlayers) {
  const base = MAP_SIZE_CONFIGS[mapSizeIndex] || MAP_SIZE_CONFIGS[2];

  let landmassCount;
  if (continentCountMode === 0) {
    landmassCount = rollInt(base.few.min, base.few.max, 'CPP Landmass Count Few');
  } else if (continentCountMode === 1) {
    landmassCount = rollInt(base.many.min, base.many.max, 'CPP Landmass Count Many');
  } else {
    landmassCount = rollInt(base.random.min, base.random.max, 'CPP Landmass Count Random');
  }

  let distantCount = rollInt(base.distant.min, base.distant.max, 'CPP Distant Count');
  // With few continents the land budget is small; 3 distants on top of it
  // measured 29% distant share (target <28). Cap distants at 2 when <=3
  // continents rolled (harness, 2026-08-18).
  if (landmassCount <= 3) distantCount = Math.min(distantCount, 2);
  // Crowding caps (Many-mode harness gate 2026-08-18): with 5+ continents,
  // 3 distants push distant share past 28% — fewer, bigger distants are
  // safer for treasure viability. On Tiny/Small grids 7+ continents
  // squeeze even the second distant below viability.
  if (landmassCount >= 5) distantCount = Math.min(distantCount, 2);
  if (mapSizeIndex <= 1 && landmassCount >= 7) distantCount = 1;

  // Land budget (percent of map area before erosion). Schema range is 20-50.
  // Tuned 2026-08-16: 30-36 base measured 67-72% water in test runs; raised
  // to 34-40 to hit the mod's Earth-like 60-65% target (erosion + hex
  // validation eat more of the budget than the raw percent suggests).
  // Size-indexed correction (T13, 2026-08-17): the flat budget doesn't scale
  // linearly with grid area — measured water drifted Tiny 69-70% (too wet) /
  // Standard 64-65% (on target) / Huge 58-61% (too dry).
  // Tiny 5 → 6 (2026-08-18): Tiny still measured 70-70.9% water at 5.
  // All sizes -1 (2026-08-18): the inland-channel fill adds ~1-1.5% land,
  // so the raw budget comes down one point to keep water on target.
  const sizeCorrection = [5, 1, -1, -3, -5][mapSizeIndex] ?? 0;
  // Per-continent increment is size-aware (Many-mode harness gate,
  // 2026-08-18): on Tiny/Small grids each extra continent costs MORE than
  // 0.5 budget points in separation + hex-validation losses — Many (5-6
  // continents) measured 70-74% water with the flat 0.5. Clamp to the
  // schema max (50).
  const perContinent = mapSizeIndex <= 1 ? 1.1 : 0.5;
  const totalLandmassSize = Math.min(50,
    VoronoiUtils.getRandomMinMax(34, 40, 'CPP Total Land Size') + landmassCount * perContinent + sizeCorrection);
  // Distant budget scales with map size: a flat budget measured 32% of all
  // land on Tiny vs 23% on Standard+. Multiplier: Tiny 0.75x → Huge 1.25x.
  // Floor at 4 (T14, 2026-08-17): Tiny rolled 3.75 and produced a 58-tile
  // distant "landmass" — below treasure-mechanic viability.
  const distantScale = 0.75 + mapSizeIndex * 0.125;
  // Per-mass floor (harness sweep 2026-08-17): a distant landmass needs ~3
  // budget points to survive erosion above the viability floor; with 3 rolled
  // distants the old floor of 4 produced 77-tile runts.
  // Crowded maps (7+ continents) erode distants harder — raise the
  // per-mass floor so the second distant stays treasure-viable (2026-08-18).
  const perMassFloor = (mapSizeIndex >= 3 ? 3.0 : 3.5) + (landmassCount >= 7 ? 0.5 : 0);
  const totalDistantSize = Math.max(5, perMassFloor * distantCount,
    (VoronoiUtils.getRandomMinMax(3, 5, 'CPP Total Distant Size') + distantCount) * distantScale);

  // Asymmetric continent sizes (was the seeded 0.5x-1.5x multiplier system)
  let maxSizeVariance = rollInt(30, 50, 'CPP Size Variance');
  // With 5+ continents high variance compounds with erosion into runt
  // continents (Many-mode harness gate 2026-08-18: ratios up to 4.0, and
  // the T12 in-game 17-tile eroded continent). Cap at 35 for high counts.
  if (landmassCount >= 5) maxSizeVariance = Math.min(maxSizeVariance, landmassCount >= 6 ? 30 : 35);
  // Low counts blow up the ratio too: few big continents + high variance =
  // one runt AND one dominant near-half-map continent (user rule
  // 2026-08-18: largest landmass must stay well under 50% of all land).
  if (landmassCount <= 3) maxSizeVariance = Math.min(maxSizeVariance, 30);

  // Player distribution mode → native landmass grouping.
  //   Clustered (0): one group — players' continents cluster together
  //   Spread    (1): one group per human (bounded) — humans end up apart
  //   Random    (2): random 1-3 groups
  let landmassGroupCount;
  if (distributionMode === 0) {
    landmassGroupCount = 1;
  } else if (distributionMode === 1) {
    landmassGroupCount = Math.max(2, Math.min(humanCount, landmassCount, 4));
  } else {
    // Prefer 2+ groups when there are enough continents. Multiple homeland
    // groups give each player a PERSONAL homeland perspective: a player in
    // group 2 sees group 1 as Distant Lands and vice versa (isDistantLands
    // compares the tile's region to the player's spawn region). With one
    // group, everyone shares a single homeland and only the dedicated
    // distant landmasses (region 0) are Distant Lands.
    const minGroups = landmassCount >= 4 ? 2 : 1;
    landmassGroupCount = rollInt(minGroups, Math.min(3, landmassCount), 'CPP Group Count');
  }
  // Loner cap (T15 finding, 2026-08-17): the engine's minPlayersPerLandmassGroup
  // is a dead schema entry, so more groups than floor(players/2) guarantees a
  // player alone in a group (observed: Tiny, 4 players, 3 groups → 2 loners).
  const groupCap = Math.max(1, Math.floor((totalPlayers ?? 8) / 2));
  if (landmassGroupCount > groupCap) {
    console.log(`[ContinentsPP] Group count ${landmassGroupCount} capped to ${groupCap} (${totalPlayers} players, no-loner guarantee)`);
    landmassGroupCount = groupCap;
  }

  return {
    landmassCount,
    distantCount,
    totalLandmassSize,
    totalDistantSize,
    maxSizeVariance,
    landmassGroupCount,
    // Erosion max lowered 12 → 10 (harness sweep): high rolls split whole
    // continents into separate 100+ tile fragments.
    erosionPercent: rollInt(6, 10, 'CPP Erosion'),
    // Reduced 2026-08-16: coast measured at 45% of all water (target ~25-35%)
    // — wide island shelves merged into archipelago-like shallow seas.
    coastalIslands: rollInt(3, 5, 'CPP Coastal Islands'),
    islandTotalSize: VoronoiUtils.getRandomMinMax(1.5, 3.5, 'CPP Ocean Islands')
  };
}

//──────────────────────────────────────────────────────────────────────────────
// SPLIT-LANDMASS REPAIR
// The engine's erosion (continent-generator addCoasts) converts coastal land
// cells without any connectivity check, so a thin continent can be carved in
// two (~7% of harness seeds: 100-200 tile fragments). The Voronoi cells still
// know which rolled landmass each tile came from (cell.landmassId), so when
// two large components share a landmassId, rebuild a minimal land bridge.
// Must run BEFORE widenStraits (which would widen the erosion channel).
//──────────────────────────────────────────────────────────────────────────────

function repairSplitLandmasses(voronoiMap) {
  const hexMap = voronoiMap.getHexTiles();
  const tiles = hexMap.m_tiles;
  const h = tiles.length, w = tiles[0].length;
  const isLandTile = (t) => t.terrainType !== TerrainType.Ocean && t.terrainType !== TerrainType.Coast;
  const neighborsOf = (x, y) => {
    const odd = y & 1;
    const out = [];
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[odd?1:-1,1],[odd?1:-1,-1]]) {
      let nx = x + dx; const ny = y + dy;
      if (nx < 0) nx = w - 1; if (nx >= w) nx = 0;
      if (ny < 0 || ny >= h) continue;
      out.push(tiles[ny][nx]);
    }
    return out;
  };
  const hexDist = (x1, y1, x2, y2) => {
    const toCube = (x, y) => { const q = x - ((y - (y & 1)) >> 1); return [q, y]; };
    let best = Infinity;
    for (const wrap of [-w, 0, w]) {
      const [aq, ar] = toCube(x1 + wrap, y1);
      const [bq, br] = toCube(x2, y2);
      const d = Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs((-aq - ar) - (-bq - br)));
      if (d < best) best = d;
    }
    return best;
  };

  // land components with their dominant Voronoi landmassId
  const label = Array.from({length: h}, () => new Int32Array(w).fill(-1));
  const comps = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!isLandTile(tiles[y][x]) || label[y][x] !== -1) continue;
    const id = comps.length;
    const tilesIn = []; const lmCount = {};
    const q = [[x, y]]; label[y][x] = id;
    while (q.length) {
      const [cx, cy] = q.pop();
      tilesIn.push([cx, cy]);
      const lm = voronoiMap.getRegionCellForHex(cx, cy)?.landmassId;
      if (lm > 0) lmCount[lm] = (lmCount[lm] || 0) + 1;
      for (const n of neighborsOf(cx, cy)) {
        if (isLandTile(n) && label[n.coord.y][n.coord.x] === -1) {
          label[n.coord.y][n.coord.x] = id;
          q.push([n.coord.x, n.coord.y]);
        }
      }
    }
    const dom = Object.entries(lmCount).sort((a, b) => b[1] - a[1])[0];
    comps.push({ tilesIn, landmassId: dom ? Number(dom[0]) : -1 });
  }

  const byLandmass = new Map();
  for (const c of comps) {
    if (c.landmassId <= 0 || c.tilesIn.length < 50) continue;   // small = coastal island, leave it
    if (!byLandmass.has(c.landmassId)) byLandmass.set(c.landmassId, []);
    byLandmass.get(c.landmassId).push(c);
  }

  let bridges = 0, bridgeTiles = 0;
  for (const [lmId, group] of byLandmass) {
    if (group.length < 2) continue;
    group.sort((a, b) => b.tilesIn.length - a.tilesIn.length);
    const main = group[0];
    for (let gi = 1; gi < group.length; gi++) {
      const frag = group[gi];
      // closest boundary pair
      let best = Infinity, pa = null, pb = null;
      for (const [ax, ay] of main.tilesIn) for (const [bx, by] of frag.tilesIn) {
        const d = hexDist(ax, ay, bx, by);
        if (d < best) { best = d; pa = [ax, ay]; pb = [bx, by]; }
      }
      if (best > 6) continue;   // too far apart to be an erosion channel — leave as-is
      // greedy walk pa → pb converting water to land
      let [cx, cy] = pa;
      const donor = tiles[pa[1]][pa[0]];
      for (let step = 0; step < 12 && (cx !== pb[0] || cy !== pb[1]); step++) {
        let bestN = null, bestD = Infinity;
        for (const n of neighborsOf(cx, cy)) {
          const d = hexDist(n.coord.x, n.coord.y, pb[0], pb[1]);
          if (d < bestD) { bestD = d; bestN = n; }
        }
        if (!bestN) break;
        if (!isLandTile(bestN)) {
          bestN.terrainType = TerrainType.Flat;
          bestN.biomeType = donor.biomeType;
          bestN.playerLandmassId = donor.playerLandmassId;
          bridgeTiles++;
        }
        cx = bestN.coord.x; cy = bestN.coord.y;
      }
      bridges++;
    }
  }
  if (bridges > 0) {
    console.log(`[ContinentsPP] Split repair: rebuilt ${bridges} erosion-split landmass(es) with ${bridgeTiles} bridge tiles`);
  }
}

//──────────────────────────────────────────────────────────────────────────────
// INLAND CHANNEL FILL
// Erosion + coastal generation carve narrow water cuts INTO single
// continents (measured 2026-08-18: 93 water tiles with 4+ land neighbors
// all from the same landmass on one Standard map) — they read as straits
// that "don't need to be there". BUT short cuts are good coastline
// character (bays, fjords — user feedback 2026-08-18), so only LONG runs
// get filled: candidate tiles (water, >= 4 land neighbors, all one
// landmass) are clustered, and only clusters of >= 4 tiles — the
// continent-slicing cuts — are converted. By construction the fill can
// never merge two distinct landmasses. Runs BEFORE widenStraits so any
// pinch the fill tightens gets re-widened by the separation pass.
//──────────────────────────────────────────────────────────────────────────────

function fillInlandChannels(hexMap) {
  const tiles = hexMap.m_tiles;
  const h = tiles.length, w = tiles[0].length;
  const isLandTile = (t) => t.terrainType !== TerrainType.Ocean && t.terrainType !== TerrainType.Coast;
  const neighborsOf = (x, y) => {
    const odd = y & 1;
    const out = [];
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[odd?1:-1,1],[odd?1:-1,-1]]) {
      let nx = x + dx; const ny = y + dy;
      if (nx < 0) nx = w - 1; if (nx >= w) nx = 0;
      if (ny < 0 || ny >= h) continue;
      out.push(tiles[ny][nx]);
    }
    return out;
  };
  let filled = 0;
  for (let pass = 0; pass < 3; pass++) {
    // label connected land components
    const label = Array.from({length: h}, () => new Int32Array(w).fill(-1));
    let nComp = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!isLandTile(tiles[y][x]) || label[y][x] !== -1) continue;
      const q = [[x, y]]; label[y][x] = nComp;
      while (q.length) {
        const [cx, cy] = q.pop();
        for (const n of neighborsOf(cx, cy)) {
          if (isLandTile(n) && label[n.coord.y][n.coord.x] === -1) {
            label[n.coord.y][n.coord.x] = nComp;
            q.push([n.coord.x, n.coord.y]);
          }
        }
      }
      nComp++;
    }
    // collect candidate tiles, then cluster them; fill only clusters >= 4
    const cand = new Map();   // "x,y" -> {t, donor}
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = tiles[y][x];
      if (isLandTile(t)) continue;
      const landN = neighborsOf(x, y).filter(isLandTile);
      if (landN.length < 4) continue;
      const comps = new Set(landN.map(n => label[n.coord.y][n.coord.x]));
      if (comps.size !== 1) continue;   // touching 2+ masses — real separation
      cand.set(x + ',' + y, { t, donor: landN[0] });
    }
    let converted = 0;
    const seen = new Set();
    for (const [k, v] of cand) {
      if (seen.has(k)) continue;
      const cluster = [v]; seen.add(k);
      const q = [v.t];
      while (q.length) {
        const cur = q.pop();
        for (const n of neighborsOf(cur.coord.x, cur.coord.y)) {
          const nk = n.coord.x + ',' + n.coord.y;
          if (cand.has(nk) && !seen.has(nk)) {
            seen.add(nk); cluster.push(cand.get(nk)); q.push(n);
          }
        }
      }
      if (cluster.length < 4) continue;   // short cut = coastline character, keep
      for (const c of cluster) {
        c.t.terrainType = TerrainType.Flat;
        c.t.biomeType = c.donor.biomeType;
        c.t.playerLandmassId = c.donor.playerLandmassId;
        converted++;
      }
    }
    filled += converted;
    if (converted === 0) break;
  }
  if (filled > 0) {
    console.log(`[ContinentsPP] Channel fill: filled ${filled} inland channel tiles (same-landmass water cuts)`);
  }
}

//──────────────────────────────────────────────────────────────────────────────
// STRAIT WIDENING
// The engine's forceOceans separation only oceanizes tiles DIRECTLY adjacent
// to a different landmass (hex-map.js applyTerrainSeparation), so two
// landmasses can legally sit with a single water hex between them. Measured
// 2026-08-17: 1-hex straits between major landmasses in 5 of 7 test seeds.
// This pass finds "pinch" water tiles whose neighbors include land from two
// different major landmasses and converts the smaller side's land neighbors
// to coast, guaranteeing >= 2 water hexes between majors.
//──────────────────────────────────────────────────────────────────────────────

function widenStraits(hexMap) {
  const tiles = hexMap.m_tiles;
  const h = tiles.length, w = tiles[0].length;
  const isLandTile = (t) => t.terrainType !== TerrainType.Ocean && t.terrainType !== TerrainType.Coast;
  const neighborsOf = (x, y) => {
    const odd = y & 1;
    const out = [];
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[odd?1:-1,1],[odd?1:-1,-1]]) {
      let nx = x + dx; const ny = y + dy;
      if (nx < 0) nx = w - 1; if (nx >= w) nx = 0;   // X-wrap
      if (ny < 0 || ny >= h) continue;
      out.push(tiles[ny][nx]);
    }
    return out;
  };

  const MAJOR_MIN = 50;   // comps below this are islands; offshore islands may touch
  let widened = 0;

  // Up to 3 passes: each pass relabels comps, widens 1-hex pinches between any
  // two majors, then widens 2-hex channels between majors of DIFFERENT regions
  // (player groups / distant lands) so those gaps reach >= 4 — wide enough
  // for the orphan-coast trim below to leave true ocean in the middle.
  for (let pass = 0; pass < 3; pass++) {
    const label = Array.from({length: h}, () => new Int32Array(w).fill(-1));
    const compSize = []; const compRegion = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!isLandTile(tiles[y][x]) || label[y][x] !== -1) continue;
      const id = compSize.length;
      let size = 0; const regionCount = {};
      const q = [[x, y]]; label[y][x] = id;
      while (q.length) {
        const [cx, cy] = q.pop(); size++;
        const r = tiles[cy][cx].playerLandmassId;
        regionCount[r] = (regionCount[r] || 0) + 1;
        for (const n of neighborsOf(cx, cy)) {
          if (isLandTile(n) && label[n.coord.y][n.coord.x] === -1) {
            label[n.coord.y][n.coord.x] = id;
            q.push([n.coord.x, n.coord.y]);
          }
        }
      }
      compSize.push(size);
      compRegion.push(Number(Object.entries(regionCount).sort((a, b) => b[1] - a[1])[0][0]));
    }
    const majorAt = (t) => {
      if (!isLandTile(t)) return -1;
      const id = label[t.coord.y][t.coord.x];
      return compSize[id] >= MAJOR_MIN ? id : -1;
    };
    let converted = 0;
    // Articulation guard: eroding a neck tile can cut a peninsula off its
    // landmass (observed: 98-tile piece severed from a 404-tile continent).
    // Only erode when the tile's land neighbors stay connected to each other
    // within the 1-ring after removal.
    const safeToErode = (t) => {
      const ring = neighborsOf(t.coord.x, t.coord.y);
      const landRing = ring.filter(isLandTile);
      if (landRing.length <= 1) return true;
      const adj = (a, b) => neighborsOf(a.coord.x, a.coord.y).includes(b);
      const seen = new Set([landRing[0]]);
      const q = [landRing[0]];
      while (q.length) {
        const cur = q.pop();
        for (const other of landRing) {
          if (!seen.has(other) && adj(cur, other)) { seen.add(other); q.push(other); }
        }
      }
      return seen.size === landRing.length;
    };
    // Erode candidate tiles at a pinch: prefer the smaller major's tiles,
    // fall back to the larger's — whichever survives the articulation guard.
    const erodeAtPinch = (candidates, idsHere) => {
      const bySize = [...idsHere].sort((a, b) => compSize[a] - compSize[b]);
      for (const id of bySize.slice(0, -1).concat(bySize.slice(-1))) {
        let any = false;
        for (const t of candidates) {
          if (majorAt(t) === id && safeToErode(t)) {
            t.terrainType = TerrainType.Coast;
            converted++; any = true;
          }
        }
        if (any) return true;
      }
      return false;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const here = tiles[y][x];
      if (isLandTile(here)) continue;
      const near = neighborsOf(x, y);
      // 1-hex pinch: this water tile touches two different majors
      const touching = new Set(near.map(majorAt).filter(id => id >= 0));
      if (touching.size >= 2) {
        erodeAtPinch(near, touching);
        continue;
      }
      // 2-hex channel between DIFFERENT regions: this water tile touches major
      // A while a neighboring water tile touches major B of another region
      if (touching.size === 1) {
        const [a] = touching;
        for (const nw of near) {
          if (isLandTile(nw)) continue;
          for (const nn of neighborsOf(nw.coord.x, nw.coord.y)) {
            const b = majorAt(nn);
            if (b >= 0 && b !== a && compRegion[b] !== compRegion[a]) {
              erodeAtPinch(near.concat(neighborsOf(nw.coord.x, nw.coord.y)), new Set([a, b]));
            }
          }
        }
      }
    }
    widened += converted;
    if (converted === 0) break;
  }

  // Orphan-coast trim: coast that touches no land becomes ocean. Turns every
  // >= 3-wide water band into real deep ocean (Antiquity ships cannot cross)
  // and keeps coast as a shelf hugging the shorelines.
  const toOcean = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = tiles[y][x];
    if (t.terrainType !== TerrainType.Coast) continue;
    if (!neighborsOf(x, y).some(isLandTile)) toOcean.push(t);
  }
  for (const t of toOcean) {
    t.terrainType = TerrainType.Ocean;
    t.playerLandmassId = -1;
  }
  console.log(`[ContinentsPP] Separation: widened ${widened} strait tiles, ` +
    `deepened ${toOcean.length} off-shelf coast tiles to ocean`);
}

//──────────────────────────────────────────────────────────────────────────────
// MAP CLASS
//──────────────────────────────────────────────────────────────────────────────

class ContinentsPlusPlusMap extends UnifiedContinentsBase {
  m_cppConfig;

  constructor() {
    super({ ...voronoiMapSchema }, fractalSettings);
  }

  static getName() {
    return "Continents++";
  }

  getFilename() {
    return "fractal.mapconfig.js";
  }

  init(hexDims) {
    this.initInternal(hexDims);
  }

  configure(cppConfig) {
    this.m_cppConfig = cppConfig;
  }

  simulateInternal() {
    const settings = this.m_settings;
    const cfg = this.m_cppConfig;

    settings.landmassCount = cfg.landmassCount;
    settings.distantCount = cfg.distantCount;
    settings.totalLandmassSize = cfg.totalLandmassSize;
    settings.totalDistantSize = cfg.totalDistantSize;
    settings.maxSizeVariance = cfg.maxSizeVariance;
    // 50 let the 3rd distant mass roll below the viability floor (harness)
    settings.maxDistantSizeVariance = 30;
    settings.landmassGroupCount = cfg.landmassGroupCount;
    settings.minPlayersPerLandmassGroup = 2;   // companion guarantee
    settings.enforceGroupConstraints = 1;
    // Default groupBalancedMode=0 spaces groups evenly around the placement
    // circle — with 2 groups that produces an un-Earth-like clean straight
    // ocean band splitting the map. 1 = slightly randomized group layout.
    settings.groupBalancedMode = 1;
    // Widen the spawn-distance band for more asymmetric layouts.
    // Min raised 0.25 → 0.4 (2026-08-17): at 0.25, 3 of 4 test seeds had two
    // landmasses separated by a single water hex (min boundary gap 2).
    settings.minLandmassSpawnCenterDistance = 0.4;
    settings.maxLandmassSpawnCenterDistance = 0.85;

    // Per-landmass template — applySettings() clones landmass[0] for all
    const gen = this.getGenerator().getSettings();
    gen.landmass[0].erosionPercent = cfg.erosionPercent;
    gen.landmass[0].coastalIslands = cfg.coastalIslands;
    if (gen.island) {
      gen.island.totalSize = cfg.islandTotalSize;
    }

    console.log(`[ContinentsPP] Simulating: ${cfg.landmassCount} continents + ${cfg.distantCount} distant, ` +
      `land=${cfg.totalLandmassSize.toFixed(1)}% + distant=${cfg.totalDistantSize.toFixed(1)}%, ` +
      `sizeVariance=${cfg.maxSizeVariance}%, groups=${cfg.landmassGroupCount}, erosion=${cfg.erosionPercent}%`);

    const hexValidationSettings = new HexValidationSettings();
    hexValidationSettings.removeBridgingPlayerLandmasses = RemoveBridgingLandmassOptions.FORCE_OCEANS;
    hexValidationSettings.polarMargin = 1;
    this.getHexTiles().setValidationSettings(hexValidationSettings);

    super.simulateInternal();
  }

  getVoronoiValidationSettings() {
    const voronoiValidationSettings = new VoronoiValidationSettings();
    // Ocean (not just coast) required between ALL distinct landmasses, groups,
    // and land types. Coast-only separation (the archipelago default) let
    // same-group landmasses fuse after erosion: a "Many (7)" roll stamped as
    // only 4 game continents. Ocean separation keeps the advertised continent
    // count visible on the final map.
    voronoiValidationSettings.forceOceans = SeparationFilterOptions.DIFFERENT_TYPES
      | SeparationFilterOptions.DIFFERENT_LANDMASS_GROUPS
      | SeparationFilterOptions.DIFFERENT_LANDMASSES;
    voronoiValidationSettings.forceCoasts = SeparationFilterOptions.OFF;
    return voronoiValidationSettings;
  }

  // Distant landmasses (playerAreas=0) and islands → 0 (non-player land =
  // Distant Lands). Player landmasses → their group id.
  getPlayerLandmassFromCell(cell) {
    if (cell.landmassId > 0) {
      const landmass = this.m_generator.getLandmasses()[cell.landmassId];
      if (landmass.type === RegionType.Island || landmass.playerAreas === 0) {
        return 0;
      }
      return landmass.groupId;
    }
    return -1;
  }
}

//──────────────────────────────────────────────────────────────────────────────
// GENERATION ENTRY POINTS
//──────────────────────────────────────────────────────────────────────────────

function requestMapData(initParams) {
  console.log(`[ContinentsPP] Map init: ${initParams.width}x${initParams.height}, wrapX=${initParams.wrapX}`);
  engine.call("SetMapInitData", initParams);
}

function readMapOption(key, min, max, fallback) {
  try {
    const v = parseInt(Configuration.getMapValue(key), 10);
    if (!isNaN(v) && v >= min && v <= max) return v;
  } catch (e) { /* fall through */ }
  return fallback;
}

async function generateMap() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  CONTINENTS++ v${ContinentsPlusPlusVersion} — Voronoi Generation`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`[ContinentsPP] Age: ${GameInfo.Ages.lookup(Game.age).AgeType}`);

  const generationScope = new profileScope("Continents++ Generation");

  const iWidth = GameplayMap.getGridWidth();
  const iHeight = GameplayMap.getGridHeight();
  const uiMapSize = GameplayMap.getMapSize();
  const mapInfo = GameInfo.Maps.lookup(uiMapSize);
  if (mapInfo == null) {
    console.log("[ContinentsPP] ERROR: Could not lookup map info!");
    return;
  }
  const mapSizeIndex = mapInfo.$index;

  const aliveMajorIds = Players.getAliveMajorIds();
  const iTotalPlayers = aliveMajorIds.length;
  const humanCount = aliveMajorIds.filter(id => Players.isHuman(id)).length;

  console.log(`[ContinentsPP] Map size: ${MAP_SIZE_CONFIGS[mapSizeIndex]?.name || 'UNKNOWN'} (${iWidth}x${iHeight})`);
  console.log(`[ContinentsPP] Players: ${iTotalPlayers} (${humanCount} human)`);

  // UI options
  const continentCountMode = readMapOption("ContinentsPPContinentCount", 0, 2, 2);
  let distributionMode = readMapOption("ContinentsPPPlayerDistribution", 0, 2, 0);
  const COUNT_NAMES = ['Few (2-4)', 'Many (5+)', 'Random'];
  const DIST_NAMES = ['Clustered', 'Spread', 'Random'];
  console.log(`[ContinentsPP] Continent Count Mode: ${continentCountMode} (${COUNT_NAMES[continentCountMode]})`);
  if (humanCount <= 1 && distributionMode !== 2) {
    console.log(`[ContinentsPP] Player Distribution Mode: ${distributionMode} (${DIST_NAMES[distributionMode]}) → OVERRIDE to 2 (Random)`);
    console.log(`[ContinentsPP]   Reason: ${humanCount === 0 ? 'No' : 'Single'} human player — Clustered/Spread only apply to multiplayer`);
    distributionMode = 2;
  } else {
    console.log(`[ContinentsPP] Player Distribution Mode: ${distributionMode} (${DIST_NAMES[distributionMode]})`);
  }

  const cfg = buildCppConfig(mapSizeIndex, continentCountMode, distributionMode, humanCount, iTotalPlayers);
  console.log(`[ContinentsPP] Config: ${JSON.stringify(cfg)}`);

  // Voronoi generation
  const voronoiMap = new ContinentsPlusPlusMap();
  voronoiMap.init({ x: iWidth, y: iHeight });
  voronoiMap.setPrimaryMapSetting(["totalPlayers"], iTotalPlayers);
  voronoiMap.configure(cfg);
  voronoiMap.simulate();

  // Rebuild continents the erosion pass carved in two, smooth away inland
  // channel cuts, then guarantee wide ocean separation between the
  // (now-intact) landmasses
  repairSplitLandmasses(voronoiMap);
  fillInlandChannels(voronoiMap.getHexTiles());
  widenStraits(voronoiMap.getHexTiles());

  // Terrain, biomes, features, resources — engine common pipeline
  await generateMapFeatures(voronoiMap.getHexTiles());

  // Start positions from player landmasses (distant lands excluded natively)
  const fertilityGetter = (tile) => StartPositioner.getPlotFertilityForCoord(tile.coord.x, tile.coord.y);
  voronoiMap.createMajorPlayerAreas(fertilityGetter);
  const startPositions = assignStartPositionsFromHexMap(voronoiMap.getHexTiles());

  //────────────────────────────────────────────────────────────────────────────
  // SPREAD MODE: post-assignment human separation.
  // The engine's assignStartPositionsFromTiles has bHumansTogether — when the
  // age defines HumanPlayersPrimaryHemisphere (Antiquity does), ALL humans are
  // forced onto the largest landmass group, defeating Spread. Fix by swapping
  // humans that share a group with AIs from unused groups.
  //────────────────────────────────────────────────────────────────────────────
  if (distributionMode === 1 && humanCount >= 2) {
    const regionOfPlot = (plot) =>
      GameplayMap.getLandmassRegionId(plot % iWidth, Math.floor(plot / iWidth));
    const players = aliveMajorIds
      .filter(id => startPositions[id] != null && startPositions[id] >= 0)
      .map(id => ({ id, isHuman: Players.isHuman(id), plot: startPositions[id],
        region: regionOfPlot(startPositions[id]) }));
    const humans = players.filter(p => p.isHuman);
    const usedHumanRegions = new Set();
    for (const human of humans) {
      if (!usedHumanRegions.has(human.region)) {
        usedHumanRegions.add(human.region);
        continue;
      }
      // Human shares a group with an earlier human — swap with an AI in a
      // group no human occupies yet. Pick the donor with the BEST start-plot
      // fertility so the relocated human doesn't inherit a weak AI position.
      const fertilityOf = (plot) => {
        try { return StartPositioner.getPlotFertilityForCoord(plot % iWidth, Math.floor(plot / iWidth)); }
        catch (e) { return 0; }
      };
      const donors = players.filter(p => !p.isHuman && p.region > 0 && !usedHumanRegions.has(p.region));
      if (donors.length === 0) {
        console.log(`[ContinentsPP] Spread: no free group for human ${human.id} — leaving in region ${human.region}`);
        continue;
      }
      const donor = donors.reduce((best, p) => fertilityOf(p.plot) > fertilityOf(best.plot) ? p : best);
      console.log(`[ContinentsPP] Spread: swapping human ${human.id} (region ${human.region}, fertility ${fertilityOf(human.plot)}) ` +
        `with AI ${donor.id} (region ${donor.region}, fertility ${fertilityOf(donor.plot)}) — best of ${donors.length} donor(s)`);
      const humanPlot = human.plot, donorPlot = donor.plot;
      startPositions[human.id] = donorPlot;
      startPositions[donor.id] = humanPlot;
      StartPositioner.setStartPosition(donorPlot, human.id);
      StartPositioner.setStartPosition(humanPlot, donor.id);
      const tmpRegion = human.region;
      human.region = donor.region; human.plot = donorPlot;
      donor.region = tmpRegion; donor.plot = humanPlot;
      usedHumanRegions.add(human.region);
    }
    console.log(`[ContinentsPP] Spread: humans now in regions [${humans.map(hm => hm.region).join(', ')}]`);
  }

  //────────────────────────────────────────────────────────────────────────────
  // NO-LONER REBALANCE (guardrail, 2026-08-19). The engine's
  // minPlayersPerLandmassGroup is a dead schema entry, and T19 caught the
  // engine splitting 4 players 3/1 across 2 groups — the human alone in
  // their group. When any group holds exactly 1 player and another holds
  // >= 3, relocate the lowest-fertility AI from the big group to the best
  // free plot in the loner's group (min 8-plot spacing, relaxing to 6).
  //────────────────────────────────────────────────────────────────────────────
  {
    const regionOfPlot = (plot) =>
      GameplayMap.getLandmassRegionId(plot % iWidth, Math.floor(plot / iWidth));
    const fertilityOf = (plot) => {
      try { return StartPositioner.getPlotFertilityForCoord(plot % iWidth, Math.floor(plot / iWidth)); }
      catch (e) { return 0; }
    };
    for (let round = 0; round < 4; round++) {
      const players = aliveMajorIds
        .filter(id => startPositions[id] != null && startPositions[id] >= 0)
        .map(id => ({ id, isHuman: Players.isHuman(id), plot: startPositions[id],
          region: regionOfPlot(startPositions[id]) }));
      const byRegion = new Map();
      for (const p of players) byRegion.set(p.region, (byRegion.get(p.region) || 0) + 1);
      const lonerRegion = [...byRegion.entries()].find(([r, n]) => n === 1 && r > 0)?.[0];
      if (lonerRegion === undefined) break;
      const donorRegion = [...byRegion.entries()]
        .filter(([r, n]) => n >= 3 && r > 0).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (donorRegion === undefined) {
        console.log(`[ContinentsPP] Loner rebalance: region ${lonerRegion} has a loner but no >=3 donor group — leaving as-is`);
        break;
      }
      const donors = players.filter(p => !p.isHuman && p.region === donorRegion);
      if (donors.length === 0) break;   // donor group is all humans — leave
      const mover = donors.reduce((worst, p) => fertilityOf(p.plot) < fertilityOf(worst.plot) ? p : worst);
      // best free plot in the loner's region with spacing from all starts
      const allStarts = players.map(p => p.plot);
      const distOf = (plot, other) => GameplayMap.getPlotDistance(
        plot % iWidth, Math.floor(plot / iWidth), other % iWidth, Math.floor(other / iWidth));
      let best = null;
      for (const minDist of [8, 6]) {
        for (let y = 1; y < iHeight - 1; y++) for (let x = 0; x < iWidth; x++) {
          if (GameplayMap.getContinentType(x, y) === -1) continue;
          if (GameplayMap.getLandmassRegionId(x, y) !== lonerRegion) continue;
          if (GameplayMap.isImpassable(x, y) || GameplayMap.isMountain(x, y)) continue;
          const plot = y * iWidth + x;
          if (allStarts.some(s => s !== mover.plot && distOf(plot, s) < minDist)) continue;
          const f = fertilityOf(plot);
          if (f <= 0) continue;
          if (!best || f > best.f) best = { plot, f };
        }
        if (best) break;
      }
      if (!best) {
        console.log(`[ContinentsPP] Loner rebalance: no valid plot in region ${lonerRegion} — leaving as-is`);
        break;
      }
      console.log(`[ContinentsPP] Loner rebalance: relocating AI ${mover.id} (region ${donorRegion}, fertility ${fertilityOf(mover.plot)}) ` +
        `to region ${lonerRegion} plot fertility ${best.f} — groups were ${[...byRegion.entries()].filter(([r]) => r > 0).map(([r, n]) => `r${r}:${n}`).join(' ')}`);
      startPositions[mover.id] = best.plot;
      StartPositioner.setStartPosition(best.plot, mover.id);
    }
  }

  generateDiscoveries(iWidth, iHeight, startPositions, g_PolarWaterRows);
  FertilityBuilder.recalculate();
  assignAdvancedStartRegions();

  //────────────────────────────────────────────────────────────────────────────
  // VERIFICATION REPORT — consumed by tests via persisted logs
  //────────────────────────────────────────────────────────────────────────────
  let landTiles = 0, waterTiles = 0, distantLandTiles = 0;
  const regionIds = new Set();
  for (let y = 0; y < iHeight; y++) {
    for (let x = 0; x < iWidth; x++) {
      if (GameplayMap.getContinentType(x, y) === -1) { waterTiles++; continue; }
      landTiles++;
      const r = GameplayMap.getLandmassRegionId(x, y);
      regionIds.add(r);
      if (r === 0) distantLandTiles++;
    }
  }
  const waterPct = (waterTiles / (landTiles + waterTiles) * 100).toFixed(1);
  console.log(`[ContinentsPP] === GENERATION REPORT ===`);
  console.log(`[ContinentsPP] Water: ${waterPct}% | Land: ${landTiles} tiles (${distantLandTiles} distant/island)`);
  console.log(`[ContinentsPP] Region IDs present: [${[...regionIds].sort((a, b) => a - b).join(', ')}]`);

  console.log(`[ContinentsPP] PLAYER POSITIONS:`);
  let humansOk = true;
  for (let i = 0; i < aliveMajorIds.length; i++) {
    const plot = startPositions[i];
    if (plot == null || plot < 0) { console.log(`[ContinentsPP]   Player ${i}: NO START POSITION`); continue; }
    const x = plot % iWidth, y = Math.floor(plot / iWidth);
    const region = GameplayMap.getLandmassRegionId(x, y);
    const isHuman = Players.isHuman(aliveMajorIds[i]);
    if (isHuman && region === 0) humansOk = false;
    console.log(`[ContinentsPP]   Player ${i} (${isHuman ? 'HUMAN' : 'AI'}): (${x}, ${y}) region=${region}${isHuman && region === 0 ? ' [BAD: distant lands spawn!]' : ''}`);
  }
  if (humansOk) {
    console.log(`[ContinentsPP] CONFIRMED: All human players spawn on player landmasses (homeland)`);
  } else {
    console.log(`[ContinentsPP] CRITICAL WARNING: A human spawned on non-player land`);
  }

  // Persist for tests / debug console
  const statsJson = JSON.stringify({
    version: ContinentsPlusPlusVersion,
    config: cfg,
    waterPct: Number(waterPct),
    landTiles, distantLandTiles,
    regionIds: [...regionIds].sort((a, b) => a - b)
  });
  const logChannel = persistMapValue("ContinentsPlusPlusLogs", JSON.stringify(ContinentsPlusPlusLogs));
  persistMapValue("ContinentsPlusPlusStats", statsJson);
  if (logChannel) {
    console.log(`[ContinentsPP] Persisted logs + stats via ${logChannel}`);
  } else {
    // Help the next debugging round: what does this context actually expose?
    try {
      console.log(`[ContinentsPP] No persistence channel. Configuration props: ` +
        Object.getOwnPropertyNames(Configuration).join(','));
      console.log(`[ContinentsPP] Game props: ` +
        Object.getOwnPropertyNames(Game).filter(n => /prop|value|set/i.test(n)).join(','));
    } catch (e) { /* best effort */ }
  }

  generationScope.end();
}

engine.on("RequestMapInitData", requestMapData);
engine.on("GenerateMap", generateMap);
console.log("Loaded continents-plus-plus.js (v3)");

// Exports for the headless shape harness (harness/run.mjs). Inert in-game.
export { MAP_SIZE_CONFIGS, buildCppConfig, widenStraits, repairSplitLandmasses, fillInlandChannels, ContinentsPlusPlusMap };
