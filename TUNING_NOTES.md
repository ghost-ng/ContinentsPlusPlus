# Tuning Notes: Preview Tool Learnings vs. Mod Configuration

This document tracks insights from the preview tool that may inform future mod tuning.

## ⚠️ Important Distinction

**Preview Tool** uses custom Voronoi implementation (Raymond Hill's Fortune algorithm)
**Actual Mod** uses game's built-in `VoronoiContinents` class (different algorithm)

**DO NOT blindly copy parameters from preview to mod!** Instead, use preview learnings to guide **in-game testing priorities**.

---

## Current Mod Configuration

From [continents-plus-plus.js:87-107](modules/maps/continents-plus-plus.js#L87-L107):

```javascript
{
  mapConfig: {
    totalLandmassSize: 30-54 (scales with map size),
    minLandmassSize: 12-20 (scales with map size)
  },
  generatorConfig: {
    plate: { plateRotationMultiple: 5 },
    landmass: [
      { variance: 5, erosionPercent: 4, coastalIslands: 6-18 },
      { variance: 5, erosionPercent: 4, coastalIslands: 6-18 }
    ],
    island: {
      totalSize: 3.5-7.5,
      variance: 1,
      meridianDistance: 3,
      landmassDistance: 5,
      erosionPercent: 15
    },
    mountain: { percent: 12, randomize: 35 }
  }
}
```

---

## Preview Tool Learnings

### 1. Erosion Percentage

**Preview Tool Finding:**
- Original: `erosionPercent: 4` → Too much coastal erosion
- Improved: `erosionPercent: 2.5` → Better coastline preservation
- Result: More organic coastlines without over-erosion

**Potential Mod Change (REQUIRES TESTING):**
```javascript
landmass: [
  { variance: 5, erosionPercent: 3, coastalIslands: config.coastalIslands }, // Reduced from 4
  { variance: 5, erosionPercent: 3, coastalIslands: config.coastalIslands }
],
```

**Testing Priority:** 🔴 HIGH
- Test in-game with erosion 2.5, 3, 3.5
- Visually inspect coastline quality
- Check if continents look too blocky or too irregular

---

### 2. Land/Water Ratio

**Preview Tool Finding:**
- Target: 68% water (Earth-like)
- Achieved: 67-70% water across most sizes
- Method: Select 60% of plates as land (after Lloyd relaxation)

**Mod Configuration:**
- Uses `totalLandmassSize` parameter
- Current values: 30 (TINY) → 54 (HUGE)

**Analysis:**
- The game's VoronoiContinents likely handles land percentage differently
- Our current values target ~68% water (as noted in comment on line 89)
- **NO CHANGE RECOMMENDED** - current values appear correct

**Testing Priority:** 🟡 MEDIUM
- Verify in-game water coverage is 65-72%
- If not, adjust `totalLandmassSize` up/down by 2-3

---

### 3. Plate Rotation Iterations

**Current Mod Value:**
```javascript
plate: { plateRotationMultiple: 5 }
```

**Preview Tool:** Also uses 5 iterations for growth simulation

**Analysis:**
- Values already match
- **NO CHANGE NEEDED**

---

### 4. Lloyd Relaxation

**Preview Tool:** Applies 3 iterations of Lloyd relaxation for even plate distribution

**Mod Status:**
- Game's `VoronoiContinents` may or may not include Lloyd relaxation
- We cannot add it - it's part of the engine

**Action:** ✅ NONE (engine-controlled)

---

### 5. Coastal Islands

**Current Mod Values:** 6 (TINY) → 18 (HUGE)

**Preview Tool Finding:**
- Coastal island probability: `coastalIslands / 1000` per tile
- Works well with current scaling

**Analysis:**
- Current values scale appropriately with map size
- **NO CHANGE RECOMMENDED**

---

### 6. Island Erosion

**Current Mod Value:**
```javascript
island: { erosionPercent: 15 }
```

**Analysis:**
- Islands should be more eroded than continents (more irregular)
- 15% seems appropriate
- **NO CHANGE RECOMMENDED**

**Testing Priority:** 🟢 LOW

---

## Testing Checklist

When testing the mod in-game, verify:

### Water Coverage
- [ ] TINY: 65-72% water ✓ (target: 68%)
- [ ] SMALL: 65-72% water ✓
- [ ] STANDARD: 65-72% water ✓
- [ ] LARGE: 65-72% water ✓
- [ ] HUGE: 65-72% water ✓

### Continental Shapes
- [ ] 2-4 major continents (not 1 supercontinent)
- [ ] Organic, irregular coastlines (not too blocky)
- [ ] No vertical "sliver" continents
- [ ] Reasonable continent sizes (no tiny fragments)

### Coastal Features
- [ ] Archipelagos present in ocean regions
- [ ] Coastal islands near continents
- [ ] Not too much erosion (continents shouldn't be Swiss cheese)

### Polar Regions
- [ ] Polar water rows present (no land at extreme north/south)
- [ ] Snow/ice coverage appropriate

---

## Recommended Experiments

If in-game testing shows issues:

### If Coastlines Too Irregular
Try reducing erosion:
```javascript
landmass: [
  { variance: 5, erosionPercent: 3, ... }, // Down from 4
  { variance: 5, erosionPercent: 3, ... }
]
```

### If Coastlines Too Blocky
Try increasing erosion:
```javascript
landmass: [
  { variance: 5, erosionPercent: 5, ... }, // Up from 4  { variance: 5, erosionPercent: 5, ... }
]
```

### If Too Much Water
Increase land:
```javascript
totalLandmassSize: 32, // Up from 30 (TINY example)
```

### If Too Little Water
Decrease land:
```javascript
totalLandmassSize: 28, // Down from 30 (TINY example)
```

---

## Preview Tool vs. Reality

Remember: The preview tool is a **simplified approximation**. Key differences:

| Feature | Preview Tool | Actual Mod |
|---------|-------------|------------|
| Algorithm | Raymond Hill's Fortune | Game's TypeScript-Voronoi |
| Lloyd Relaxation | ✅ Yes (3 iterations) | ❓ Unknown (engine-controlled) |
| Plate Physics | Simplified growth model | Full physics simulation |
| Land Assignment | 60% of plates | `totalLandmassSize` parameter |
| Erosion | Per-tile probability | Engine-controlled algorithm |

**Bottom line:** Use preview tool to understand general patterns, but always validate with in-game testing.

---

## Change Log

### 2026-01-24
- Initial document created
- Documented preview tool learnings
- Identified erosion as highest-priority testing point
- **NO CHANGES MADE TO MOD** (pending in-game testing)
