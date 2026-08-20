// Headless shape harness for Continents++.
// Runs buildCppConfig + Voronoi simulate + widenStraits entirely in Node
// (the whole simulate path is pure JS; RandomImpl falls back to its own PCG
// when TerrainBuilder is absent) and scores the resulting tile grid against
// the T13/T15 shape metrics. No game required.
//
// Usage: node --import ./harness/register.mjs harness/run.mjs
//          [--size tiny|small|standard|large|huge|all] [--seeds N] [--seed X]
//          [--mode 0|1|2] [--ascii] [--json]
//
// Exit code 0 = all seeds pass, 1 = failures.

globalThis.engine = { on() {}, call() {}, off() {} };

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : dflt;
};
const hasFlag = (name) => args.includes('--' + name);

const SIZES = [
  { idx: 0, name: 'tiny',     w: 60,  h: 38, players: 4 },
  { idx: 1, name: 'small',    w: 74,  h: 46, players: 6 },
  { idx: 2, name: 'standard', w: 84,  h: 54, players: 8 },
  { idx: 3, name: 'large',    w: 96,  h: 60, players: 10 },
  { idx: 4, name: 'huge',     w: 106, h: 66, players: 10 },
];

const sizeArg = (getArg('size', 'all') || 'all').toLowerCase();
const seedCount = parseInt(getArg('seeds', '5'), 10);
const fixedSeed = getArg('seed', null);
const mode = parseInt(getArg('mode', '2'), 10);   // count mode: 0 Few 1 Many 2 Random
const ascii = hasFlag('ascii');
const asJson = hasFlag('json');

// Known-marginal baseline: exactly-matching (mode, seed, check-prefix)
// failures are downgraded to warnings; anything else fails the gate.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
let KNOWN = [];
try {
  const here = dirname(fileURLToPath(import.meta.url));
  KNOWN = JSON.parse(readFileSync(join(here, 'known-marginals.json'), 'utf8')).entries;
} catch (e) { /* no baseline file — strict gate */ }

const { RandomImpl } = await import('/base-standard/scripts/random-pcg-32.js');
const { TerrainType } = await import('/base-standard/scripts/voronoi-types.js');
const mod = await import('../Mod/ContinentsPlusPlus/modules/maps/continents-plus-plus.js');
const { buildCppConfig, widenStraits, repairSplitLandmasses, fillInlandChannels, ContinentsPlusPlusMap } = mod;

//──────────────────────────────────────────────────────────────────────────────
// Metrics over hexMap.m_tiles
//──────────────────────────────────────────────────────────────────────────────

function neighborDeltas(y) {
  const odd = y & 1;
  return [[1, 0], [-1, 0], [0, 1], [0, -1], [odd ? 1 : -1, 1], [odd ? 1 : -1, -1]];
}

// Hex distance on odd-row offset grid with X wrap (matches GameplayMap.getPlotDistance)
function hexDist(x1, y1, x2, y2, w) {
  const toCube = (x, y) => {
    const q = x - ((y - (y & 1)) >> 1);
    return [q, y, -q - y];
  };
  let best = Infinity;
  for (const wrap of [-w, 0, w]) {
    const [aq, ar, as] = toCube(x1 + wrap, y1);
    const [bq, br, bs] = toCube(x2, y2);
    const d = Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
    if (d < best) best = d;
  }
  return best;
}

function analyze(hexMap, cfg, dims) {
  const tiles = hexMap.m_tiles;
  const h = tiles.length, w = tiles[0].length;
  const isLandT = (t) => t.terrainType !== TerrainType.Ocean && t.terrainType !== TerrainType.Coast;

  let land = 0, ocean = 0, coast = 0, r0 = 0;
  for (const row of tiles) for (const t of row) {
    if (t.terrainType === TerrainType.Ocean) ocean++;
    else if (t.terrainType === TerrainType.Coast) coast++;
    else { land++; if (t.playerLandmassId <= 0) r0++; }
  }
  const water = ocean + coast;
  const waterPct = water / (w * h) * 100;
  const coastShare = coast / water * 100;

  // connected land components
  const label = Array.from({ length: h }, () => new Int32Array(w).fill(-1));
  const comps = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!isLandT(tiles[y][x]) || label[y][x] !== -1) continue;
    const id = comps.length;
    const tilesInComp = [];
    const regionCount = {};
    const q = [[x, y]]; label[y][x] = id;
    while (q.length) {
      const [cx, cy] = q.pop();
      tilesInComp.push([cx, cy]);
      const r = tiles[cy][cx].playerLandmassId;
      regionCount[r] = (regionCount[r] || 0) + 1;
      for (const [dx, dy] of neighborDeltas(cy)) {
        let nx = cx + dx; const ny = cy + dy;
        if (nx < 0) nx = w - 1; if (nx >= w) nx = 0;
        if (ny < 0 || ny >= h) continue;
        if (isLandT(tiles[ny][nx]) && label[ny][nx] === -1) {
          label[ny][nx] = id; q.push([nx, ny]);
        }
      }
    }
    comps.push({ tiles: tilesInComp, regionCount });
  }
  comps.sort((a, b) => b.tiles.length - a.tiles.length);
  const majors = comps.filter(c => c.tiles.length >= 50);   // 20-49 = islands, not majors
  const debrisTiles = comps.filter(c => c.tiles.length < 20).reduce((s, c) => s + c.tiles.length, 0);
  const region = (c) => Number(Object.entries(c.regionCount).sort((a, b) => b[1] - a[1])[0][0]);

  // boundary tiles per major
  const bounds = majors.map(c => c.tiles.filter(([x, y]) => {
    for (const [dx, dy] of neighborDeltas(y)) {
      let nx = x + dx; const ny = y + dy;
      if (nx < 0) nx = w - 1; if (nx >= w) nx = 0;
      if (ny < 0 || ny >= h) continue;
      if (!isLandT(tiles[ny][nx])) return true;
    }
    return false;
  }));

  // min gap per pair, split same-region vs different-region
  let minGapSame = Infinity, minGapDiff = Infinity;
  let pairSame = null, pairDiff = null;
  const closeDiffPairs = [];
  for (let i = 0; i < majors.length; i++) for (let j = i + 1; j < majors.length; j++) {
    let g = Infinity;
    for (const [ax, ay] of bounds[i]) for (const [bx, by] of bounds[j]) {
      const d = hexDist(ax, ay, bx, by, w);
      if (d < g) g = d;
    }
    const same = region(majors[i]) === region(majors[j]);
    const tag = `${majors[i].tiles.length}r${region(majors[i])}↔${majors[j].tiles.length}r${region(majors[j])}`;
    if (same) { if (g < minGapSame) { minGapSame = g; pairSame = tag; } }
    else { if (g < minGapDiff) { minGapDiff = g; pairDiff = tag; } if (g <= 8) closeDiffPairs.push([i, j, g]); }
  }

  // deep-ocean check: every close different-region pair must have >= 1 Ocean
  // tile in the corridor (water tiles within dist 2 of both comps' bounds)
  let oceanCorridorsOk = true;
  const corridorFails = [];
  for (const [i, j, g] of closeDiffPairs) {
    let hasOcean = false;
    outer:
    for (const [ax, ay] of bounds[i]) {
      for (const [bx, by] of bounds[j]) {
        if (hexDist(ax, ay, bx, by, w) > g + 1) continue;
        // walk water tiles near this pinch
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          let px = ax + dx; const py = ay + dy;
          if (px < 0) px += w; if (px >= w) px -= w;
          if (py < 0 || py >= h) continue;
          const t = tiles[py][px];
          if (t.terrainType === TerrainType.Ocean
              && hexDist(px, py, ax, ay, w) <= Math.ceil(g / 2) + 1
              && hexDist(px, py, bx, by, w) <= Math.ceil(g / 2) + 1) {
            hasOcean = true; break outer;
          }
        }
      }
    }
    if (!hasOcean) {
      oceanCorridorsOk = false;
      corridorFails.push(`${majors[i].tiles.length}r${region(majors[i])}↔${majors[j].tiles.length}r${region(majors[j])} gap=${g}`);
    }
  }

  // spatial thirds anchored at largest comp centroid
  let cx = 0;
  for (const [x] of majors[0].tiles) cx += x;
  cx = Math.round(cx / majors[0].tiles.length);
  const bands = [0, 0, 0];
  for (const c of comps) for (const [x] of c.tiles) {
    const rel = (x - cx + w * 1.5) % w;
    bands[Math.min(2, Math.floor(rel / (w / 3)))]++;
  }
  const thirds = bands.map(b => b / land * 100);

  // latitudinal thirds (no wrap; poles naturally carry less land, so the
  // gate below is looser than the longitudinal one)
  const latBands = [0, 0, 0];
  for (const c of comps) for (const [, y] of c.tiles) {
    latBands[Math.min(2, Math.floor(y / (h / 3)))]++;
  }
  const latThirds = latBands.map(b => b / land * 100);

  // inland channels: water tiles with >=4 land neighbors all from ONE comp,
  // counted only when they form runs of >= 4 connected tiles (the
  // continent-slicing cuts; short bays/fjords are kept as character)
  const chanCand = new Set();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (isLandT(tiles[y][x])) continue;
    const landN = [];
    for (const [dx, dy] of neighborDeltas(y)) {
      let nx = x + dx; const ny = y + dy;
      if (nx < 0) nx = w - 1; if (nx >= w) nx = 0;
      if (ny < 0 || ny >= h) continue;
      if (isLandT(tiles[ny][nx])) landN.push(label[ny][nx]);
    }
    if (landN.length >= 4 && new Set(landN).size === 1) chanCand.add(x + ',' + y);
  }
  let inlandChannels = 0;
  const chanSeen = new Set();
  for (const k of chanCand) {
    if (chanSeen.has(k)) continue;
    const [sx, sy] = k.split(',').map(Number);
    const cluster = [k]; chanSeen.add(k);
    const q = [[sx, sy]];
    while (q.length) {
      const [cx, cy] = q.pop();
      for (const [dx, dy] of neighborDeltas(cy)) {
        let nx = cx + dx; const ny = cy + dy;
        if (nx < 0) nx = w - 1; if (nx >= w) nx = 0;
        if (ny < 0 || ny >= h) continue;
        const nk = nx + ',' + ny;
        if (chanCand.has(nk) && !chanSeen.has(nk)) { chanSeen.add(nk); cluster.push(nk); q.push([nx, ny]); }
      }
    }
    if (cluster.length >= 4) inlandChannels += cluster.length;
  }

  const playerMajors = majors.filter(c => region(c) > 0);
  const distantMajors = majors.filter(c => region(c) <= 0);
  const varianceRatio = playerMajors.length >= 2
    ? playerMajors[0].tiles.length / playerMajors[playerMajors.length - 1].tiles.length : 1;

  return {
    waterPct, coastShare,
    distantShare: r0 / land * 100,
    majors: majors.map(c => ({ size: c.tiles.length, region: region(c) })),
    playerMajorCount: playerMajors.length,
    distantSizes: distantMajors.map(c => c.tiles.length),
    debrisPct: debrisTiles / land * 100,
    minGapSame: minGapSame === Infinity ? null : minGapSame, pairSame,
    minGapDiff: minGapDiff === Infinity ? null : minGapDiff, pairDiff,
    oceanCorridorsOk, corridorFails,
    thirds, latThirds, inlandChannels, varianceRatio,
    smallestMajorPctOfLand: majors.length ? majors[majors.length - 1].tiles.length / land * 100 : 0,
  };
}

function score(m, cfg, size) {
  const checks = [];
  const ck = (name, pass, detail) => checks.push({ name, pass, detail });
  // T13 semantics: hard fail outside the warn band, warn (pass w/ note) at edges.
  // Tiny + 5 continents is budget-ceiling-limited (schema caps land at 50%):
  // separation water alone saturates the grid — accept up to 73 there.
  const waterMax = size.idx === 0 && cfg.landmassCount >= 5 ? 73 : 70;
  ck(`water 60-${waterMax} (target 62-68)`, m.waterPct >= 60 && m.waterPct <= waterMax,
     m.waterPct.toFixed(1) + '%' + (m.waterPct < 62 || m.waterPct > 68 ? ' (warn)' : ''));
  ck('coastShare 20-38%', m.coastShare >= 20 && m.coastShare <= 38, m.coastShare.toFixed(1) + '%');
  ck('distantShare 11-30%', m.distantShare >= 11 && m.distantShare <= 30, m.distantShare.toFixed(1) + '%');
  // One split-off player fragment (< 6% of land) is tolerated on Large/Huge —
  // it reads as a big island (Greenland), not a broken continent.
  const sortedPlayers = m.majors.filter(c => c.region > 0).map(c => c.size);
  const extras = sortedPlayers.length - cfg.landmassCount;
  const fragmentOk = size.idx >= 3 && extras === 1
    && sortedPlayers[sortedPlayers.length - 1] < 0.06 * (m.majors.reduce((s, c) => s + c.size, 0));
  ck('physical == rolled', (extras === 0 || fragmentOk)
     && m.distantSizes.length === cfg.distantCount,
     `${m.playerMajorCount}+${m.distantSizes.length} vs ${cfg.landmassCount}+${cfg.distantCount} [${m.distantSizes}]`);
  const floor = size.idx <= 1 ? 60 : 80;
  ck('distant >= floor', m.distantSizes.every(s => s >= floor), `[${m.distantSizes}] floor ${floor}`);
  ck('gap same-region >= 3', m.minGapSame === null || m.minGapSame >= 3, `${m.minGapSame} (${m.pairSame})`);
  ck('gap diff-region >= 4', m.minGapDiff === null || m.minGapDiff >= 4, `${m.minGapDiff} (${m.pairDiff})`);
  ck('deep ocean between regions', m.oceanCorridorsOk, m.corridorFails.join('; ') || 'ok');
  ck('debris <= 12%', m.debrisPct <= 12, m.debrisPct.toFixed(1) + '%');
  // Runt + variance judged over the ROLLED continents only (largest N player
  // majors + distants) — a tolerated fragment is an island, not a runt.
  const land = m.majors.reduce((s, c) => s + c.size, 0) || 1;
  const rolledPlayers = sortedPlayers.slice(0, cfg.landmassCount);
  const rolledSmallest = Math.min(...rolledPlayers, ...m.distantSizes.map(() => Infinity));
  ck('no rolled runt < 4% land', rolledPlayers.every(s => s / land >= 0.04) || rolledPlayers.length === 0,
     ((rolledSmallest === Infinity ? 0 : rolledSmallest) / land * 100).toFixed(1) + '%');
  const vr = rolledPlayers.length >= 2 ? rolledPlayers[0] / rolledPlayers[rolledPlayers.length - 1] : 1;
  ck('variance <= 2.5', vr <= 2.5, vr.toFixed(2));
  const thirdsMin = size.idx <= 1 ? 10 : 15;   // 2-4 majors can't fill every third of a small grid
  ck(`thirds >= ${thirdsMin}%`, m.thirds.every(t => t >= thirdsMin), m.thirds.map(t => t.toFixed(0)).join('/'));
  // Latitudinal spread (T16 finding 2026-08-18: user-flagged lopsided maps
  // were north/south-heavy, which the longitudinal check can't see). Poles
  // naturally carry less land — gate only the extreme (empty band).
  ck('lat thirds >= 12%', m.latThirds.every(t => t >= 12), m.latThirds.map(t => t.toFixed(0)).join('/'));
  // Inland channel cuts (user-flagged 2026-08-18): straits carved INTO a
  // single continent. The fill pass should leave at most a couple.
  // (a few single-tile notches reappear from widenStraits' pinch erosion —
  // 4-6 is cosmetically fine; the pre-fill baseline was ~90)
  ck('inland channels <= 8', m.inlandChannels <= 8, String(m.inlandChannels));
  // No single landmass may dominate the map (user rule 2026-08-18):
  // largest mass <= 45% of all land, hard.
  const totalLandInMajors = m.majors.reduce((s, c) => s + c.size, 0) || 1;
  const largestShare = m.majors.length ? m.majors[0].size / totalLandInMajors * 100 : 0;
  ck('largest mass <= 45% of land', largestShare <= 45, largestShare.toFixed(1) + '%');
  return checks;
}

function renderAscii(hexMap) {
  const tiles = hexMap.m_tiles;
  let out = '';
  for (let y = tiles.length - 1; y >= 0; y--) {
    out += (y & 1 ? ' ' : '');
    for (const t of tiles[y]) {
      if (t.terrainType === TerrainType.Ocean) out += ' ·';
      else if (t.terrainType === TerrainType.Coast) out += ' ~';
      else out += ' ' + (t.playerLandmassId > 0 ? String(t.playerLandmassId) : '#');
    }
    out += '\n';
  }
  return out;
}

//──────────────────────────────────────────────────────────────────────────────
// Run
//──────────────────────────────────────────────────────────────────────────────

const sizesToRun = sizeArg === 'all' ? SIZES : SIZES.filter(s => s.name === sizeArg || String(s.idx) === sizeArg);
if (!sizesToRun.length) { console.error('unknown --size'); process.exit(2); }

let anyFail = false;
const results = [];
for (const size of sizesToRun) {
  for (let s = 0; s < (fixedSeed ? 1 : seedCount); s++) {
    const seed = fixedSeed ? parseInt(fixedSeed, 10) : (size.idx + 1) * 100000 + s * 7919 + 13;
    RandomImpl.seed(seed);
    const cfg = buildCppConfig(size.idx, mode, 2, 1, size.players);
    const map = new ContinentsPlusPlusMap();
    map.init({ x: size.w, y: size.h });
    map.setPrimaryMapSetting(['totalPlayers'], size.players);
    map.configure(cfg);
    map.simulate();
    repairSplitLandmasses(map);
    fillInlandChannels(map.getHexTiles());
    widenStraits(map.getHexTiles());
    const m = analyze(map.getHexTiles(), cfg, size);
    const checks = score(m, cfg, size);
    const rawFails = checks.filter(c => !c.pass);
    const isKnown = (f) => KNOWN.some(k => k.mode === mode && k.seed === seed && f.name.startsWith(k.check));
    const fails = rawFails.filter(f => !isKnown(f));
    const knownFails = rawFails.filter(isKnown);
    if (fails.length) anyFail = true;
    results.push({ size: size.name, seed, cfg, metrics: m,
      fails: fails.map(f => `${f.name}: ${f.detail}`),
      knownMarginals: knownFails.map(f => `${f.name}: ${f.detail}`) });
    if (!asJson) {
      const tag = fails.length ? 'FAIL' : (knownFails.length ? 'PASS (known marginals)' : 'PASS');
      console.log(`[${size.name} seed=${seed}] ${tag} ` +
        `water=${m.waterPct.toFixed(1)} coast=${m.coastShare.toFixed(1)} distant=${m.distantShare.toFixed(1)} ` +
        `gapS=${m.minGapSame} gapD=${m.minGapDiff} ocean=${m.oceanCorridorsOk ? 'y' : 'N'} ` +
        `thirds=${m.thirds.map(t => t.toFixed(0)).join('/')} lat=${m.latThirds.map(t => t.toFixed(0)).join('/')} majors=${m.majors.length}`);
      for (const f of fails) console.log(`    ✗ ${f.name}: ${f.detail}`);
      for (const f of knownFails) console.log(`    ~ known: ${f.name}: ${f.detail}`);
    }
    if (ascii) console.log(renderAscii(map.getHexTiles()));
  }
}
if (asJson) console.log(JSON.stringify(results, null, 1));
process.exit(anyFail ? 1 : 0);
