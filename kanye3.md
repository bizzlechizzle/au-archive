# KANYE3: What Would You Do Differently - Premium Archive Vision

**Version:** 3.0.0
**Created:** 2025-11-23
**Status:** ULTRATHINK - COMPLETE REIMAGINING
**Focus:** What programs/tools are needed? What makes a PREMIUM experience?

---

## THE REAL QUESTION

> "What program/app do I need? What would you do differently?"
> "How can this be a high quality archive program if I can't even see the images?"

**ANSWER:** 256px thumbnails are TINY. Professional archives don't use 256px thumbnails - they use MULTIPLE resolution tiers.

---

## WHAT PROFESSIONAL ARCHIVE APPS DO

### PhotoMechanic (Industry Standard - $139)
- **Grid thumbnails**: 400-600px
- **Preview mode**: Full screen preview from embedded JPEG (instant)
- **Loupe**: 100% crop from embedded or cached preview
- **Full resolution**: Loads on demand

### Adobe Lightroom
- **Thumbnails**: Smart Previews (compressed DNG, ~1MB each)
- **Standard Previews**: 1440px or 2048px
- **1:1 Previews**: Full resolution cached
- **Generates previews on import** (like we planned)

### Adobe Bridge
- **High Quality Thumbnails**: User-configurable 256px to 1024px
- **Preview Panel**: Large preview, resizable
- **Full Screen Preview**: Instant from cache

### Apple Photos
- **Thumbnails**: 256px (1x), 512px (2x HiDPI)
- **Grid sizes**: Small, Medium, Large (user choice)
- **Full screen**: Loads original or optimized version

---

## WHAT AU ARCHIVE CURRENTLY HAS vs NEEDS

| Feature | Current | Premium Standard | Gap |
|---------|---------|------------------|-----|
| **Grid Thumbnail** | 256px JPEG (80%) | 400-600px JPEG (85%) | TOO SMALL |
| **HiDPI Support** | None | 2x resolution (srcset) | MISSING |
| **Preview Image** | None | 1920px for lightbox | MISSING |
| **Full Resolution** | Original file | Original file | OK |
| **Grid Size Options** | Fixed | S/M/L user preference | MISSING |
| **Thumbnail Quality** | 80% JPEG | 85-90% JPEG | LOW |

---

## THE MULTI-TIER IMAGE SYSTEM

### What We Need to Generate on Import

```
ORIGINAL FILE (NEF, JPG, PNG, etc.)
       |
       v
┌──────────────────────────────────────────────────────────┐
│                    IMPORT PIPELINE                        │
│                                                          │
│  1. THUMBNAIL (grid browsing)                            │
│     - Size: 400px (short edge)                           │
│     - HiDPI: 800px version for 2x displays               │
│     - Format: JPEG 85%                                   │
│     - Storage: ~/.au-archive/.thumbnails/[hash]_400.jpg  │
│                ~/.au-archive/.thumbnails/[hash]_800.jpg  │
│                                                          │
│  2. PREVIEW (lightbox/detail view)                       │
│     - Size: 1920px (long edge)                           │
│     - Format: JPEG 90%                                   │
│     - Storage: ~/.au-archive/.previews/[hash]_1920.jpg   │
│     - Use: MediaViewer lightbox, detail page hero        │
│                                                          │
│  3. ORIGINAL (full quality access)                       │
│     - No processing                                      │
│     - Storage: Archive folder                            │
│     - Use: Download, external editor, print              │
└──────────────────────────────────────────────────────────┘
```

### Database Schema Update Needed

```sql
-- Current (inadequate)
thumb_path TEXT;     -- 256px only

-- Proposed (premium)
thumb_path_sm TEXT;  -- 400px (1x displays, compact grid)
thumb_path_lg TEXT;  -- 800px (2x HiDPI, large grid)
preview_path TEXT;   -- 1920px (lightbox, detail view)
```

---

## TOOLS/PROGRAMS ALREADY IN USE

| Tool | Purpose | Already Installed? |
|------|---------|-------------------|
| **Sharp** | Image resizing, JPEG generation | YES |
| **ExifTool** | Metadata extraction, RAW preview extraction | YES |
| **FFmpeg** | Video poster frames | YES |
| **SQLite** | Database | YES |
| **Electron** | Desktop app | YES |

**YOU DON'T NEED NEW TOOLS** - Sharp can do everything. The problem is we're only generating ONE tiny size.

---

## WHAT I WOULD DO DIFFERENTLY

### 1. Generate Multiple Sizes on Import (Not Just 256px)

**Current thumbnail-service.ts:**
```typescript
// CURRENT - ONE SIZE (TOO SMALL)
async generateThumbnail(sourcePath: string, hash: string): Promise<string | null> {
  await sharp(sourcePath)
    .resize(256, 256, { fit: 'cover' })  // <-- 256px is TINY
    .jpeg({ quality: 80 })
    .toFile(thumbPath);
}
```

**What I would do differently:**
```typescript
// PREMIUM - MULTIPLE SIZES
interface ThumbnailSet {
  thumbnail_sm: string;  // 400px - grid view (1x)
  thumbnail_lg: string;  // 800px - grid view (2x HiDPI)
  preview: string;       // 1920px - lightbox/detail
}

async generateAllSizes(sourcePath: string, hash: string): Promise<ThumbnailSet> {
  const image = sharp(sourcePath);
  const metadata = await image.metadata();

  // Calculate dimensions maintaining aspect ratio
  const aspect = (metadata.width || 1) / (metadata.height || 1);

  // 1. Small thumbnail (400px short edge) - for grid
  const sm = aspect > 1
    ? { height: 400 }
    : { width: 400 };
  await sharp(sourcePath)
    .resize(sm)
    .jpeg({ quality: 85 })
    .toFile(this.getPath(hash, '400'));

  // 2. Large thumbnail (800px short edge) - for HiDPI grid
  const lg = aspect > 1
    ? { height: 800 }
    : { width: 800 };
  await sharp(sourcePath)
    .resize(lg)
    .jpeg({ quality: 85 })
    .toFile(this.getPath(hash, '800'));

  // 3. Preview (1920px long edge) - for lightbox
  const preview = aspect > 1
    ? { width: 1920 }
    : { height: 1920 };
  await sharp(sourcePath)
    .resize(preview)
    .jpeg({ quality: 90 })
    .toFile(this.getPath(hash, '1920'));

  return {
    thumbnail_sm: this.getPath(hash, '400'),
    thumbnail_lg: this.getPath(hash, '800'),
    preview: this.getPath(hash, '1920'),
  };
}
```

### 2. Use srcset for HiDPI Displays

**Current LocationDetail.svelte (if fixed):**
```svelte
<!-- CURRENT - Single size, blurry on Retina -->
<img src={`media://${thumb_path}`} />
```

**What I would do differently:**
```svelte
<!-- PREMIUM - Automatic HiDPI support -->
<img
  src={`media://${thumb_path_sm}`}
  srcset={`
    media://${thumb_path_sm} 1x,
    media://${thumb_path_lg} 2x
  `}
  alt={image.imgnam}
  loading="lazy"
/>
```

### 3. Grid Size Options (User Preference)

**What I would add:**
```svelte
<script>
  let gridSize = localStorage.getItem('gridSize') || 'medium';

  const GRID_SIZES = {
    small: 'grid-cols-6 md:grid-cols-8',      // Many small thumbnails
    medium: 'grid-cols-4 md:grid-cols-6',     // Balanced (default)
    large: 'grid-cols-2 md:grid-cols-4',      // Fewer, larger thumbnails
  };
</script>

<!-- Grid size selector -->
<div class="flex gap-2 mb-4">
  <button onclick={() => gridSize = 'small'} class:active={gridSize === 'small'}>
    <SmallGridIcon />
  </button>
  <button onclick={() => gridSize = 'medium'} class:active={gridSize === 'medium'}>
    <MediumGridIcon />
  </button>
  <button onclick={() => gridSize = 'large'} class:active={gridSize === 'large'}>
    <LargeGridIcon />
  </button>
</div>

<div class="grid {GRID_SIZES[gridSize]} gap-2">
  {#each images as image}
    <img
      src={gridSize === 'large' ? thumb_path_lg : thumb_path_sm}
      srcset={...}
    />
  {/each}
</div>
```

### 4. Lightbox Uses Preview, Not Thumbnail

**Current MediaViewer:**
```svelte
<!-- BROKEN - Uses 256px thumbnail in lightbox = BLURRY -->
<img src={`media://${item.thumbPath}`} />
```

**What I would do differently:**
```svelte
<!-- PREMIUM - Uses 1920px preview in lightbox = CRISP -->
<img
  src={`media://${item.previewPath || item.path}`}
  class="max-h-screen max-w-screen object-contain"
/>
```

### 5. Preview Generation is NON-BLOCKING

**What I would do:**
- Generate thumbnail_sm FIRST (fast, small)
- User sees grid immediately
- Generate thumbnail_lg and preview in BACKGROUND
- Update UI when ready (progressive enhancement)

```typescript
async importFile(file: File) {
  // Phase 1: Quick import (thumbnail_sm only)
  const thumbSm = await this.generateQuickThumbnail(file, 400);
  await this.saveToDb({ ...file, thumb_path_sm: thumbSm });

  // Phase 2: Background quality pass (non-blocking)
  this.backgroundQueue.add(async () => {
    const thumbLg = await this.generateThumbnail(file, 800);
    const preview = await this.generatePreview(file, 1920);
    await this.updateDb({ thumb_path_lg: thumbLg, preview_path: preview });
  });
}
```

---

## STORAGE IMPACT ANALYSIS

### Current (256px only)
```
Per image: ~15-30KB
1000 images: ~15-30MB
```

### Premium (400px + 800px + 1920px)
```
400px thumbnail: ~40-80KB
800px thumbnail: ~100-200KB
1920px preview: ~300-600KB
Total per image: ~450-900KB

1000 images: ~450-900MB
10000 images: ~4.5-9GB
```

**IS THIS ACCEPTABLE?**
- For an archive app on desktop: YES
- Hard drives are cheap, image quality is priceless
- Can add "Generate previews" toggle in settings for users with storage constraints

---

## GPS + ADDRESS: USE EVERYTHING YOU HAVE

### Current Problem
1. Photo has no EXIF GPS
2. Location has address "99 Myrtle Avenue, Cambridge, NY"
3. Forward geocoding EXISTS but NOT CALLED
4. User sees "No GPS available"
5. Map is HIDDEN

### What I Would Do Differently

**Principle: SHOW SOMETHING. Always.**

```
DATA PRIORITY CHAIN:
1. EXIF GPS from photo          → Show exact location     (green marker)
2. GPS from location record     → Show exact location     (green marker)
3. Forward geocode from address → Show geocoded location  (yellow marker)
4. State centroid fallback      → Show state center       (gray marker)
5. No data at all               → Show "Add Location"     (prompt)

NEVER show "No GPS available" if address exists.
```

**Implementation:**
```typescript
// On location detail load
async function getMapCoordinates(location: Location): Promise<Coordinates> {
  // 1. Has GPS? Use it
  if (location.gps?.lat && location.gps?.lng) {
    return { ...location.gps, confidence: 'exact' };
  }

  // 2. Has address? Forward geocode it
  if (location.address?.street || location.address?.city) {
    const geocoded = await geocodingService.forwardGeocode(
      buildAddressString(location.address)
    );
    if (geocoded) {
      // Save it for next time
      await locationRepo.update(location.locid, {
        gps_lat: geocoded.lat,
        gps_lng: geocoded.lng,
        gps_source: 'geocoded_address'
      });
      return { lat: geocoded.lat, lng: geocoded.lng, confidence: 'geocoded' };
    }
  }

  // 3. Has state? Use centroid
  if (location.address?.state) {
    const centroid = STATE_CENTROIDS[location.address.state];
    if (centroid) {
      return { ...centroid, confidence: 'approximate' };
    }
  }

  // 4. Nothing
  return null;
}
```

---

## ADDRESS DISPLAY: PROFESSIONAL FORMATTING

### Current (Sloppy)
```
Address
99 Myrtle Avenue Village Of Cambridge, NY 12816
Washington County
```

### Premium Archive Standard
```
┌──────────────────────────────────────────────────────┐
│ Address                                    [Copy] [Map] │
├──────────────────────────────────────────────────────┤
│ 99 Myrtle Avenue                                      │
│ Cambridge, NY 12816                                   │
│ Washington County                                     │
└──────────────────────────────────────────────────────┘
```

**Features:**
- Street on its own line (bold/primary)
- City, State, ZIP on one line (standard format)
- County as secondary info (gray, smaller)
- Copy button (copies full formatted address)
- Map button (opens map centered on this address)
- All elements consistently styled

---

## CLI/GUI/IPC VERIFICATION

### Question: Is each script set up to talk with CLI, GUI, etc?

**Current IPC Flow:**
```
FRONTEND (Svelte)
    |
    | window.electronAPI.media.xxx()
    v
PRELOAD (preload/index.ts)
    |
    | ipcRenderer.invoke('media:xxx')
    v
MAIN PROCESS (ipc-handlers/*.ts)
    |
    | Calls services
    v
SERVICES (services/*.ts)
    |
    | Returns data
    v
BACK UP THE CHAIN
```

**What's Missing:**

| IPC Endpoint | Status | Notes |
|--------------|--------|-------|
| `media:import` | EXISTS | Calls file-import-service |
| `media:generateThumbnail` | EXISTS | Only generates 256px |
| `media:generateAllSizes` | MISSING | Should generate 400/800/1920 |
| `location:forwardGeocode` | MISSING | Should geocode address to GPS |
| `location:ensureGps` | MISSING | Should auto-geocode on load |

**CLI Support:**
- Currently NO CLI - app is GUI only
- For CLI support, would need to expose services as commands
- Not critical for v0.1.0, but useful for batch operations later

---

## IMPLEMENTATION ROADMAP

### Phase 1: Fix What's Broken (2 hours)
1. Wire up thumb_path in LocationDetail.svelte
2. Always show map (use fallbacks)
3. Clean address display

### Phase 2: Premium Thumbnails (4 hours)
1. Update thumbnail-service.ts to generate 3 sizes
2. Add database columns (thumb_path_sm, thumb_path_lg, preview_path)
3. Create migration
4. Update frontend to use srcset

### Phase 3: Forward Geocoding (2 hours)
1. Create location-geocode-service.ts
2. Add IPC handler
3. Call on location detail load
4. Background process for existing locations

### Phase 4: User Preferences (2 hours)
1. Grid size selector (S/M/L)
2. Store in localStorage
3. Settings page option for "Generate high-quality previews"

---

## WHAT TOOLS DO YOU NEED TO INSTALL?

**NOTHING NEW.** You already have everything:

| Tool | What It Does | You Have It? |
|------|--------------|--------------|
| **Sharp** | Resizes images, generates JPEG | YES (npm package) |
| **ExifTool** | Extracts metadata, RAW previews | YES (bundled binary) |
| **FFmpeg** | Video processing | YES (bundled binary) |
| **SQLite** | Database | YES (better-sqlite3) |
| **Leaflet** | Maps | YES (npm package) |
| **Nominatim** | Geocoding API | YES (free, no API key) |

The problem isn't missing tools - it's that we're:
1. Only generating 256px thumbnails (too small)
2. Not using forward geocoding (address → GPS)
3. Not showing the map when we have address data

---

## SUMMARY: WHAT I WOULD DO DIFFERENTLY

| Area | Current Approach | What I'd Do Differently |
|------|------------------|------------------------|
| **Thumbnail Size** | 256px single size | 400px + 800px + 1920px multi-tier |
| **HiDPI Support** | None | srcset with 2x resolution |
| **Grid Display** | Fixed small grid | User-selectable S/M/L |
| **Lightbox Image** | Uses tiny thumbnail | Uses 1920px preview |
| **GPS Handling** | Hide map if no GPS | ALWAYS show something (geocode/fallback) |
| **Address Display** | Sloppy text blob | Clean formatted card with actions |
| **Forward Geocoding** | Not used | Auto-geocode on location load |

---

## NEXT STEPS

1. **DECISION NEEDED:** Do you want multi-tier thumbnails now or fix the wiring first?
   - Option A: Fix wiring (show 256px thumbnails) → Then add larger sizes
   - Option B: Update thumbnail service to 400/800/1920 → Then fix wiring

2. **DECISION NEEDED:** Regenerate existing thumbnails?
   - If we change to multi-tier, need to regenerate for all existing imports
   - Can add "Regenerate Thumbnails" button in settings

3. **DECISION NEEDED:** Storage budget?
   - Multi-tier uses ~500KB per image vs ~25KB current
   - Is 500MB per 1000 images acceptable?

---

**This is kanye3.md - addressing "What would you do differently" for a premium archive experience.**
