# Media Viewer & Archive Metadata System

Version: 0.1.0
Created: 2025-11-23
Status: Planning Phase

---

## Overview

Complete implementation plan for:
1. Built-in media viewer (images, RAW photos, videos)
2. Performance optimizations (PhotoMechanic-level speed)
3. Metadata architecture (XMP sidecars as source of truth)
4. AI auto-tagging system

### Core Principle: True Archive

```
┌─────────────────────────────────────────┐
│           SOURCE OF TRUTH               │
│   Files + XMP Sidecars (portable)       │
│   - Ratings, labels, keywords           │
│   - AI-generated tags                   │
│   - All user metadata                   │
└─────────────────┬───────────────────────┘
                  │ read/index
                  ▼
┌─────────────────────────────────────────┐
│           SPEED LAYER                   │
│   SQLite Database (cache/index)         │
│   - Fast queries                        │
│   - Rebuildable from XMP sidecars       │
└─────────────────────────────────────────┘
```

**An archive isn't an archive if metadata is trapped in a database.**

---

## Media Viewer Strategy

### Hybrid Approach

| Format Type | Viewer Strategy | Tool |
|-------------|-----------------|------|
| Standard Images (JPG, PNG, WebP, GIF, BMP) | Native `<img>` tag | Browser |
| HEIC/HEIF | Convert to JPEG on import | Sharp |
| RAW Files (NEF, CR2, ARW, DNG, etc.) | Extract embedded JPEG preview | ExifTool |
| Video (H.264, WebM, VP8/VP9) | Native `<video>` tag | Browser |
| Unsupported Video Codecs | Poster frame + "Open External" | FFmpeg |

### Why This Approach

| Principle | Alignment |
|-----------|-----------|
| KISS | Uses native browser for 90% of cases |
| BPL | Browser rendering eternal, ExifTool stable 20+ years |
| DRETW | ExifTool already extracts previews, Sharp already installed |
| LILBITS | Each service is a separate, focused module |
| DAFIDFAF | No LibRaw, no custom RAW decoder |

---

## Phase Breakdown

### Phase 1: Thumbnails on Import
Generate thumbnails during file import for fast grid browsing.

### Phase 2: Native Image Viewer
Display standard images in lightbox using browser `<img>` tag.

### Phase 3: RAW Preview Extraction
Extract embedded JPEG from RAW files on import.

### Phase 4: EXIF Metadata Panel
Display extracted EXIF data in viewer sidebar.

### Phase 5: Video Playback
Native video playback for supported codecs.

### Phase 6: Video Poster Frames
Generate poster frames for video thumbnails.

### Phase 7: Performance Optimizations
Preloading, in-memory cache, virtualized scrolling for PhotoMechanic-level speed.

### Phase 8: XMP Sidecar System
Write all metadata to XMP sidecars (source of truth), SQLite as cache.

### Phase 9: Rating & Culling System
Star ratings, color labels, pick/reject flags with keyboard shortcuts.

### Phase 10: AI Auto-Tagging
Claude Vision API integration for automatic image analysis and tagging.

---

## Database Schema Changes

### File: packages/desktop/electron/main/database.types.ts

**MODIFY: ImgsTable**
```typescript
// Phase 1-3: Thumbnails and previews
thumb_path: string | null;
preview_path: string | null;
preview_extracted: number;           // 0 = not extracted, 1 = extracted

// Phase 9: Rating and culling
rating: number | null;               // 0-5 stars (0 = unrated)
color_label: string | null;          // 'red' | 'yellow' | 'green' | 'blue' | 'purple'
pick_status: string | null;          // 'approved' | 'rejected' | null
keywords: string | null;             // JSON array of keywords

// Phase 8: XMP sync status
xmp_synced: number;                  // 0 = needs sync, 1 = synced
xmp_modified_at: string | null;      // ISO8601 timestamp of last XMP write
```

**MODIFY: VidsTable**
```typescript
// Phase 6: Poster frames
thumb_path: string | null;
poster_extracted: number;

// Phase 9: Rating and culling (same as images)
rating: number | null;
color_label: string | null;
pick_status: string | null;
keywords: string | null;

// Phase 8: XMP sync
xmp_synced: number;
xmp_modified_at: string | null;
```

### Migration SQL

```sql
-- Phase 1-3: Thumbnails and previews
ALTER TABLE imgs ADD COLUMN thumb_path TEXT;
ALTER TABLE imgs ADD COLUMN preview_path TEXT;
ALTER TABLE imgs ADD COLUMN preview_extracted INTEGER DEFAULT 0;

ALTER TABLE vids ADD COLUMN thumb_path TEXT;
ALTER TABLE vids ADD COLUMN poster_extracted INTEGER DEFAULT 0;

-- Phase 8-9: Metadata and XMP sync
ALTER TABLE imgs ADD COLUMN rating INTEGER;
ALTER TABLE imgs ADD COLUMN color_label TEXT;
ALTER TABLE imgs ADD COLUMN pick_status TEXT;
ALTER TABLE imgs ADD COLUMN keywords TEXT;
ALTER TABLE imgs ADD COLUMN xmp_synced INTEGER DEFAULT 0;
ALTER TABLE imgs ADD COLUMN xmp_modified_at TEXT;

ALTER TABLE vids ADD COLUMN rating INTEGER;
ALTER TABLE vids ADD COLUMN color_label TEXT;
ALTER TABLE vids ADD COLUMN pick_status TEXT;
ALTER TABLE vids ADD COLUMN keywords TEXT;
ALTER TABLE vids ADD COLUMN xmp_synced INTEGER DEFAULT 0;
ALTER TABLE vids ADD COLUMN xmp_modified_at TEXT;

-- Indexes for fast filtering
CREATE INDEX idx_imgs_rating ON imgs(rating) WHERE rating IS NOT NULL;
CREATE INDEX idx_imgs_pick_status ON imgs(pick_status) WHERE pick_status IS NOT NULL;
CREATE INDEX idx_imgs_color_label ON imgs(color_label) WHERE color_label IS NOT NULL;
CREATE INDEX idx_imgs_xmp_synced ON imgs(xmp_synced) WHERE xmp_synced = 0;
```

---

## Archive Folder Structure

```
[ARCHIVE_FOLDER]/
├── .thumbnails/                     # Generated thumbnails (256px)
│   └── [first2chars]/
│       └── [sha256].jpg
├── .previews/                       # Extracted RAW previews (full size)
│   └── [first2chars]/
│       └── [sha256].jpg
├── .posters/                        # Video poster frames
│   └── [first2chars]/
│       └── [sha256].jpg
├── .cache/                          # In-memory cache spillover (Phase 7)
│   └── preload/
└── locations/
    └── [STATE]-[TYPE]/
        └── [SLOCNAM]-[LOC12]/
            ├── org-img-[LOC12]/
            │   ├── [sha256].nef     # Original RAW file
            │   └── [sha256].xmp     # XMP sidecar (Phase 8)
            ├── org-vid-[LOC12]/
            └── org-doc-[LOC12]/
```

---

## New Scripts

### Phase 1-6: Media Viewer

#### 1. packages/desktop/electron/services/media-path-service.ts

**Purpose:** Centralized path utilities for thumbnails, previews, posters, XMP sidecars

**Exports:**
```typescript
class MediaPathService {
  constructor(archivePath: string)

  getThumbnailDir(): string
  getPreviewDir(): string
  getPosterDir(): string

  getThumbnailPath(hash: string): string
  getPreviewPath(hash: string): string
  getPosterPath(hash: string): string
  getXmpSidecarPath(originalPath: string): string

  ensureDirectories(): Promise<void>
  private bucketPath(hash: string, baseDir: string, ext: string): string
}
```

**Estimated Lines:** ~70

---

#### 2. packages/desktop/electron/services/thumbnail-service.ts

**Purpose:** Generate thumbnails from images using Sharp

**Exports:**
```typescript
class ThumbnailService {
  generateThumbnail(
    sourcePath: string,
    hash: string,
    archivePath: string,
    size?: number              // Default: 256
  ): Promise<string | null>

  generateFromHeic(
    sourcePath: string,
    hash: string,
    archivePath: string
  ): Promise<string | null>

  thumbnailExists(hash: string, archivePath: string): Promise<boolean>
}
```

**Estimated Lines:** ~90

---

#### 3. packages/desktop/electron/services/preview-extractor-service.ts

**Purpose:** Extract embedded JPEG previews from RAW files using ExifTool

**Exports:**
```typescript
class PreviewExtractorService {
  extractPreview(
    sourcePath: string,
    hash: string,
    archivePath: string
  ): Promise<string | null>

  isRawFormat(extension: string): boolean

  // Fallback chain: PreviewImage -> JpgFromRaw -> ThumbnailImage
  private tryExtractTag(filePath: string, tag: string, outputPath: string): Promise<boolean>
}
```

**ExifTool Command:**
```bash
exiftool -b -PreviewImage source.NEF > preview.jpg
```

**Estimated Lines:** ~120

---

#### 4. packages/desktop/electron/services/poster-frame-service.ts

**Purpose:** Generate video poster frames using FFmpeg

**Exports:**
```typescript
class PosterFrameService {
  generatePosterFrame(
    sourcePath: string,
    hash: string,
    archivePath: string,
    timestampSeconds?: number  // Default: 1
  ): Promise<string | null>

  posterExists(hash: string, archivePath: string): Promise<boolean>
}
```

**Estimated Lines:** ~90

---

#### 5. packages/desktop/src/components/MediaViewer.svelte

**Purpose:** Lightbox component for viewing images with EXIF panel

**Props:**
```typescript
{
  mediaPath: string;
  thumbnailPath?: string;
  previewPath?: string;
  mediaType: 'image' | 'video';
  exifData?: object;
  rating?: number;
  colorLabel?: string;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onRatingChange?: (rating: number) => void;
  onLabelChange?: (label: string) => void;
}
```

**Features:**
- Dark overlay background
- Native `<img>` for standard images
- Native `<video>` for videos
- Uses preview path for RAW files
- EXIF metadata sidebar (collapsible)
- Keyboard navigation (Escape, Arrow keys, 1-5 for rating)
- "Open in External App" button
- Rating stars display
- Color label indicator

**Estimated Lines:** ~220

---

#### 6. packages/desktop/src/components/MediaGrid.svelte

**Purpose:** Thumbnail grid component with virtualization

**Props:**
```typescript
{
  media: Array<{
    hash: string;
    thumbPath: string | null;
    originalPath: string;
    type: 'image' | 'video';
    rating?: number;
    colorLabel?: string;
    pickStatus?: string;
  }>;
  onSelect: (hash: string) => void;
  columns?: number;            // Default: 4
  virtualized?: boolean;       // Default: true for 100+ items
}
```

**Features:**
- Lazy loading thumbnails
- Virtualized scrolling (only render visible rows)
- Placeholder for missing thumbnails
- Video badge overlay
- Rating stars overlay
- Color label border
- Rejected items dimmed
- Click to open MediaViewer

**Estimated Lines:** ~180

---

#### 7. packages/desktop/src/components/ExifPanel.svelte

**Purpose:** Display EXIF metadata in a readable format

**Estimated Lines:** ~100

---

### Phase 7: Performance Optimizations

#### 8. packages/desktop/electron/services/media-cache-service.ts

**Purpose:** In-memory LRU cache for recently viewed images

**Exports:**
```typescript
class MediaCacheService {
  constructor(maxSizeMB: number = 100)

  get(hash: string): Buffer | null
  set(hash: string, data: Buffer): void
  preload(hashes: string[]): Promise<void>
  clear(): void
  getStats(): { size: number; count: number; hits: number; misses: number }
}
```

**Features:**
- LRU eviction when cache exceeds maxSizeMB
- Preload next/previous images in background
- Cache hits/misses tracking

**Estimated Lines:** ~80

---

#### 9. packages/desktop/electron/services/preload-service.ts

**Purpose:** Preload adjacent images when viewing in lightbox

**Exports:**
```typescript
class PreloadService {
  constructor(cacheService: MediaCacheService)

  setCurrentIndex(index: number, mediaList: string[]): void
  preloadAdjacent(count?: number): Promise<void>  // Default: 3 ahead, 1 behind
  cancelPreload(): void
}
```

**Estimated Lines:** ~60

---

### Phase 8: XMP Sidecar System

#### 10. packages/desktop/electron/services/xmp-service.ts

**Purpose:** Read and write XMP sidecar files

**Exports:**
```typescript
class XmpService {
  // Write operations (source of truth)
  writeRating(mediaPath: string, rating: number): Promise<void>
  writeColorLabel(mediaPath: string, label: string): Promise<void>
  writeKeywords(mediaPath: string, keywords: string[]): Promise<void>
  writePickStatus(mediaPath: string, status: 'approved' | 'rejected' | null): Promise<void>

  // Read operations (for rebuild)
  readSidecar(mediaPath: string): Promise<XmpData | null>
  sidecarExists(mediaPath: string): Promise<boolean>

  // Batch operations
  syncToSidecar(mediaPath: string, data: XmpData): Promise<void>
  rebuildFromSidecars(archivePath: string): Promise<{ synced: number; errors: number }>
}

interface XmpData {
  rating?: number;             // xmp:Rating
  label?: string;              // xmp:Label
  keywords?: string[];         // dc:subject
  pickStatus?: string;         // Custom: auarchive:pickStatus
  aiTags?: AiTagData;          // Custom: auarchive:aiTags (Phase 10)
}
```

**XMP Structure:**
```xml
<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:auarchive="http://abandonedupstate.com/xmp/1.0/">
      <xmp:Rating>5</xmp:Rating>
      <xmp:Label>Red</xmp:Label>
      <dc:subject>
        <rdf:Bag>
          <rdf:li>abandoned</rdf:li>
          <rdf:li>factory</rdf:li>
          <rdf:li>textile mill</rdf:li>
        </rdf:Bag>
      </dc:subject>
      <auarchive:pickStatus>approved</auarchive:pickStatus>
      <auarchive:buildingType>factory</auarchive:buildingType>
      <auarchive:condition>3</auarchive:condition>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
```

**Dependencies:**
- fast-xml-parser (or similar lightweight XML library)

**Estimated Lines:** ~200

---

#### 11. packages/desktop/electron/services/xmp-sync-service.ts

**Purpose:** Background sync between SQLite and XMP sidecars

**Exports:**
```typescript
class XmpSyncService {
  constructor(xmpService: XmpService, mediaRepo: SQLiteMediaRepository)

  // Triggered on rating/label/keyword change
  queueSync(hash: string, type: 'image' | 'video'): void

  // Process queue (runs in background)
  processQueue(): Promise<void>

  // Manual full sync
  syncAll(): Promise<{ synced: number; errors: number }>

  // Rebuild SQLite from XMP (disaster recovery)
  rebuildDatabase(): Promise<{ imported: number; errors: number }>
}
```

**Estimated Lines:** ~120

---

### Phase 9: Rating & Culling System

#### 12. packages/desktop/src/components/RatingWidget.svelte

**Purpose:** Star rating input component

**Props:**
```typescript
{
  value: number;               // 0-5
  readonly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onChange?: (rating: number) => void;
}
```

**Estimated Lines:** ~60

---

#### 13. packages/desktop/src/components/ColorLabelPicker.svelte

**Purpose:** Color label selection component

**Props:**
```typescript
{
  value: string | null;
  onChange?: (label: string | null) => void;
}
```

**Colors:** red, yellow, green, blue, purple (PhotoMechanic standard)

**Estimated Lines:** ~50

---

#### 14. packages/desktop/src/components/CullingToolbar.svelte

**Purpose:** Toolbar for rating, labeling, approving/rejecting

**Features:**
- Star rating buttons
- Color label buttons
- Approve (checkmark) / Reject (X) buttons
- Filter dropdown (show: all, approved, rejected, unrated, by rating, by color)
- Keyboard shortcut hints

**Keyboard Shortcuts (PhotoMechanic-compatible):**
```
1-5     Set star rating
6       Red label
7       Yellow label
8       Green label
9       Blue label
0       Clear label
T       Toggle approved
X       Toggle rejected
U       Clear pick status
←/→     Previous/Next image
```

**Estimated Lines:** ~150

---

### Phase 10: AI Auto-Tagging

#### 15. packages/desktop/electron/services/ai-tagging-service.ts

**Purpose:** AI-powered image analysis using Claude Vision API

**Exports:**
```typescript
class AiTaggingService {
  constructor(apiKey: string)

  analyzeImage(imagePath: string): Promise<AiTagResult>
  analyzeBatch(imagePaths: string[], onProgress?: (current: number, total: number) => void): Promise<AiTagResult[]>

  // Prompt customization
  setPrompt(prompt: string): void
  getDefaultPrompt(): string
}

interface AiTagResult {
  buildingType: string | null;       // factory, hospital, school, asylum, etc.
  architecturalStyle: string | null; // Victorian, Art Deco, Mid-Century, etc.
  era: string | null;                // 1920s, 1950s, etc.
  condition: number;                 // 1-5 (1=intact, 5=collapsed)
  features: string[];                // graffiti, machinery, debris, etc.
  safetyNotes: string[];             // structural damage, floor holes, etc.
  keywords: string[];                // All extracted keywords
  confidence: number;                // 0-1 confidence score
  rawResponse: string;               // Full API response for debugging
}
```

**Default Prompt:**
```
Analyze this abandoned building photograph. Return a JSON object with:
- buildingType: The type of building (factory, hospital, school, church, asylum, warehouse, etc.)
- architecturalStyle: Architectural style if identifiable (Victorian, Art Deco, Mid-Century Modern, Industrial, etc.)
- era: Estimated construction era (1890s, 1920s, 1950s, etc.)
- condition: Decay level 1-5 (1=mostly intact, 2=minor decay, 3=moderate decay, 4=severe decay, 5=partial/full collapse)
- features: Array of notable features (graffiti, machinery, debris, water damage, nature reclamation, broken windows, etc.)
- safetyNotes: Array of visible safety concerns (structural damage, floor holes, exposed wiring, asbestos warning signs, etc.)
- keywords: Array of descriptive keywords for search

Be specific and accurate. If uncertain, indicate lower confidence.
```

**Rate Limiting:**
- Max 10 requests per minute (configurable)
- Queue system for batch processing
- Cost tracking (~$0.01-0.05 per image)

**Estimated Lines:** ~180

---

#### 16. packages/desktop/electron/services/ai-tag-cache-service.ts

**Purpose:** Cache AI results to avoid re-analyzing same images

**Exports:**
```typescript
class AiTagCacheService {
  hasAnalysis(hash: string): Promise<boolean>
  getAnalysis(hash: string): Promise<AiTagResult | null>
  saveAnalysis(hash: string, result: AiTagResult): Promise<void>
  invalidate(hash: string): Promise<void>
}
```

**Storage:** SQLite table `ai_tags`

**Estimated Lines:** ~60

---

#### 17. packages/desktop/src/components/AiTagPanel.svelte

**Purpose:** Display and edit AI-generated tags

**Features:**
- Show building type, style, era, condition
- Editable keywords (add/remove)
- Safety warnings display
- "Re-analyze" button
- Confidence indicator
- Push to XMP button

**Estimated Lines:** ~140

---

## Impacted Scripts (Modifications)

### 1. packages/desktop/electron/services/file-import-service.ts

**Changes:**
- Inject ThumbnailService, PreviewExtractorService
- After file copy, call thumbnail generation
- For RAW files, extract preview
- Create empty XMP sidecar stub (Phase 8)
- Update database with new fields

**Impact:** ~50 new lines

---

### 2. packages/desktop/electron/services/exiftool-service.ts

**Changes:**
- Add `extractPreviewImage()` method
- Add `extractPreviewTag()` with fallback chain

**Impact:** ~40 new lines

---

### 3. packages/desktop/electron/services/ffmpeg-service.ts

**Changes:**
- Add `generatePosterFrame()` method

**Impact:** ~30 new lines

---

### 4. packages/desktop/electron/main/database.types.ts

**Changes:**
- Add new columns to ImgsTable and VidsTable
- Add AiTagsTable interface

**Impact:** ~30 new lines

---

### 5. packages/desktop/electron/main/ipc-handlers.ts

**Changes:**
Add handlers for:
```typescript
// Media viewer
'media:getThumbnail'
'media:getPreview'
'media:getPoster'
'media:getFileBase64'
'media:regenerateThumbnails'

// Rating and culling
'media:setRating'
'media:setColorLabel'
'media:setPickStatus'
'media:addKeyword'
'media:removeKeyword'
'media:getByFilter'         // Filter by rating/label/pick status

// XMP sync
'xmp:syncNow'
'xmp:rebuildDatabase'
'xmp:getSyncStatus'

// AI tagging
'ai:analyzeImage'
'ai:analyzeBatch'
'ai:getAnalysis'
'ai:setApiKey'
'ai:getUsageStats'
```

**Impact:** ~150 new lines

---

### 6. packages/desktop/electron/preload/index.ts

**Changes:**
Expose all new IPC handlers to renderer.

**Impact:** ~60 new lines

---

### 7. packages/desktop/src/pages/LocationDetail.svelte

**Changes:**
- Replace skeleton lightbox with MediaViewer
- Use MediaGrid with virtualization
- Add CullingToolbar
- Add AiTagPanel integration

**Impact:** Refactor ~100 lines

---

### 8. packages/desktop/electron/repositories/sqlite-media-repository.ts

**Changes:**
Add methods:
```typescript
updateRating(hash: string, type: 'image' | 'video', rating: number): Promise<void>
updateColorLabel(hash: string, type: 'image' | 'video', label: string): Promise<void>
updatePickStatus(hash: string, type: 'image' | 'video', status: string): Promise<void>
updateKeywords(hash: string, type: 'image' | 'video', keywords: string[]): Promise<void>
findByFilter(filter: MediaFilter): Promise<MediaItem[]>
findUnsynced(): Promise<MediaItem[]>
markSynced(hash: string, type: 'image' | 'video'): Promise<void>
```

**Impact:** ~80 new lines

---

## New Database Table

### ai_tags

```sql
CREATE TABLE ai_tags (
  tag_id TEXT PRIMARY KEY,
  media_sha TEXT NOT NULL,
  media_type TEXT NOT NULL,          -- 'image' | 'video'
  building_type TEXT,
  architectural_style TEXT,
  era TEXT,
  condition INTEGER,
  features TEXT,                      -- JSON array
  safety_notes TEXT,                  -- JSON array
  keywords TEXT,                      -- JSON array
  confidence REAL,
  raw_response TEXT,
  analyzed_at TEXT,
  api_cost REAL,
  UNIQUE(media_sha, media_type)
);

CREATE INDEX idx_ai_tags_media ON ai_tags(media_sha, media_type);
CREATE INDEX idx_ai_tags_building_type ON ai_tags(building_type);
```

---

## IPC Security

All file access restricted to archive folder:
```typescript
function validateArchivePath(filePath: string, archivePath: string): boolean {
  const resolved = path.resolve(filePath);
  const archiveResolved = path.resolve(archivePath);
  return resolved.startsWith(archiveResolved);
}
```

AI API key stored in:
- Electron safeStorage (encrypted)
- Never exposed to renderer process
- Never logged

---

## Format Support Matrix

### Native Browser Display
| Format | Support |
|--------|---------|
| JPEG | Yes |
| PNG | Yes |
| GIF | Yes |
| WebP | Yes |
| AVIF | Yes (Electron 28+) |
| BMP | Yes |
| SVG | Yes |
| TIFF | Partial |

### Requires Conversion/Extraction
| Format | Strategy |
|--------|----------|
| HEIC/HEIF | Convert to JPEG via Sharp |
| NEF, CR2, CR3, ARW, DNG, RAF, ORF, RW2, PEF | Extract preview via ExifTool |

### Video Native Playback
| Format | Support |
|--------|---------|
| MP4 (H.264) | Yes |
| WebM (VP8/VP9) | Yes |
| MOV (H.264) | Yes |
| MKV (H.264) | Yes |

### Video External Only
| Format | Reason |
|--------|--------|
| ProRes, DNxHD | No browser support |
| H.265/HEVC | Partial, OS-dependent |

---

## Keyboard Shortcuts

### Viewer Navigation
| Key | Action |
|-----|--------|
| Escape | Close viewer |
| Left Arrow | Previous image |
| Right Arrow | Next image |
| Space | Toggle play/pause (video) |
| F | Toggle fullscreen |
| I | Toggle EXIF panel |

### Rating & Culling (PhotoMechanic-compatible)
| Key | Action |
|-----|--------|
| 1-5 | Set star rating |
| 0 | Clear rating |
| 6 | Red label |
| 7 | Yellow label |
| 8 | Green label |
| 9 | Blue label |
| ` (backtick) | Clear label |
| T | Toggle approved |
| X | Toggle rejected |
| U | Clear pick status |

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Thumbnail grid load (100 images) | < 200ms |
| Thumbnail grid load (1000 images) | < 500ms (virtualized) |
| Image switch in viewer | < 50ms (cached) |
| RAW preview display | < 100ms (pre-extracted) |
| XMP write | < 50ms |
| AI analysis (single image) | 2-5 seconds (API dependent) |

---

## Dependencies

### Already Installed
- sharp (^0.33.x)
- exiftool-vendored (^33.2.0)
- fluent-ffmpeg (^2.1.x)

### New Dependencies
| Package | Purpose | Phase |
|---------|---------|-------|
| fast-xml-parser | XMP read/write | 8 |
| @anthropic-ai/sdk | Claude Vision API | 10 |

---

## Implementation Order

### Phase 1-6: Media Viewer (Core)
1. media-path-service.ts
2. thumbnail-service.ts
3. Database migration (thumbnails)
4. file-import-service.ts integration
5. preview-extractor-service.ts
6. poster-frame-service.ts
7. MediaViewer.svelte
8. MediaGrid.svelte
9. ExifPanel.svelte
10. LocationDetail.svelte integration
11. IPC handlers

### Phase 7: Performance
12. media-cache-service.ts
13. preload-service.ts
14. MediaGrid virtualization

### Phase 8: XMP System
15. xmp-service.ts
16. xmp-sync-service.ts
17. Database migration (XMP fields)
18. IPC handlers

### Phase 9: Rating & Culling
19. RatingWidget.svelte
20. ColorLabelPicker.svelte
21. CullingToolbar.svelte
22. Keyboard shortcuts
23. Filter integration

### Phase 10: AI Tagging
24. ai-tagging-service.ts
25. ai-tag-cache-service.ts
26. Database migration (ai_tags table)
27. AiTagPanel.svelte
28. Settings UI for API key

---

## LILBITS Compliance

| Script | Purpose | Est. Lines | Under 300 |
|--------|---------|------------|-----------|
| media-path-service.ts | Path utilities | 70 | Yes |
| thumbnail-service.ts | Thumbnail generation | 90 | Yes |
| preview-extractor-service.ts | RAW preview extraction | 120 | Yes |
| poster-frame-service.ts | Video poster frames | 90 | Yes |
| media-cache-service.ts | In-memory LRU cache | 80 | Yes |
| preload-service.ts | Adjacent image preload | 60 | Yes |
| xmp-service.ts | XMP read/write | 200 | Yes |
| xmp-sync-service.ts | Background sync | 120 | Yes |
| ai-tagging-service.ts | Claude Vision integration | 180 | Yes |
| ai-tag-cache-service.ts | AI result caching | 60 | Yes |
| MediaViewer.svelte | Lightbox component | 220 | Yes |
| MediaGrid.svelte | Virtualized grid | 180 | Yes |
| ExifPanel.svelte | EXIF display | 100 | Yes |
| RatingWidget.svelte | Star rating input | 60 | Yes |
| ColorLabelPicker.svelte | Color label picker | 50 | Yes |
| CullingToolbar.svelte | Rating/culling toolbar | 150 | Yes |
| AiTagPanel.svelte | AI tag display/edit | 140 | Yes |

---

## Testing Strategy

### Unit Tests
- thumbnail-service.test.ts
- preview-extractor-service.test.ts
- xmp-service.test.ts
- ai-tagging-service.test.ts (mocked API)

### Integration Tests
- Import flow generates thumbnails
- RAW import extracts preview
- Rating change writes to XMP
- XMP rebuild populates database
- AI analysis stores results

### Manual Testing
- Open lightbox for JPG, PNG, RAW
- Video playback
- Keyboard shortcuts
- XMP interop with PhotoMechanic
- AI tagging accuracy

---

## Notes

- All thumbnail/preview generation is non-blocking
- Import succeeds even if thumbnail generation fails
- XMP is source of truth; SQLite is rebuildable cache
- AI tagging is optional (requires API key)
- PhotoMechanic compatibility is a priority
- XMP custom namespace for AU Archive-specific fields

---

End of Plan
