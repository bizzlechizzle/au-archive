# Media Viewer Implementation Plan

Version: 0.1.0
Created: 2025-11-23
Status: Planning Phase

---

## Overview

Implementation plan for built-in media viewer in AU Archive Desktop App. This document outlines the hybrid approach (Option E) for displaying images, RAW photos, and videos within Electron.

### Strategy: Hybrid Approach

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
| BPL | Browser rendering is eternal, ExifTool stable 20+ years |
| DRETW | ExifTool already extracts previews, Sharp already installed |
| LILBITS | Each viewer type is a separate, small module |
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

---

## Database Schema Changes

### File: packages/desktop/electron/main/database.types.ts

**MODIFY: ImgsTable**
```typescript
// Add to ImgsTable interface
thumb_path: string | null;           // Path to generated thumbnail
preview_path: string | null;         // Path to extracted preview (for RAW)
preview_extracted: number;           // 0 = not extracted, 1 = extracted
```

**MODIFY: VidsTable**
```typescript
// Add to VidsTable interface
thumb_path: string | null;           // Path to poster frame
poster_extracted: number;            // 0 = not extracted, 1 = extracted
```

### Migration SQL

```sql
-- Migration: Add thumbnail and preview columns
ALTER TABLE imgs ADD COLUMN thumb_path TEXT;
ALTER TABLE imgs ADD COLUMN preview_path TEXT;
ALTER TABLE imgs ADD COLUMN preview_extracted INTEGER DEFAULT 0;

ALTER TABLE vids ADD COLUMN thumb_path TEXT;
ALTER TABLE vids ADD COLUMN poster_extracted INTEGER DEFAULT 0;
```

---

## Archive Folder Structure Changes

```
[ARCHIVE_FOLDER]/
├── .thumbnails/                     # Generated thumbnails (256px)
│   └── [first2chars]/
│       └── [sha256].jpg             # e.g., a3/a3d5e8f9...jpg
├── .previews/                       # Extracted RAW previews (full size)
│   └── [first2chars]/
│       └── [sha256].jpg
├── .posters/                        # Video poster frames
│   └── [first2chars]/
│       └── [sha256].jpg
└── locations/...                    # Existing structure unchanged
```

---

## New Scripts

### 1. packages/desktop/electron/services/thumbnail-service.ts

**Purpose:** Generate thumbnails from images using Sharp

**Exports:**
```typescript
class ThumbnailService {
  generateThumbnail(
    sourcePath: string,
    hash: string,
    archivePath: string
  ): Promise<string | null>

  getThumbnailPath(hash: string, archivePath: string): string

  thumbnailExists(hash: string, archivePath: string): Promise<boolean>
}
```

**Dependencies:**
- sharp
- fs/promises
- path

**Estimated Lines:** ~80

---

### 2. packages/desktop/electron/services/preview-extractor-service.ts

**Purpose:** Extract embedded JPEG previews from RAW files using ExifTool

**Exports:**
```typescript
class PreviewExtractorService {
  extractPreview(
    sourcePath: string,
    hash: string,
    archivePath: string
  ): Promise<string | null>

  getPreviewPath(hash: string, archivePath: string): string

  previewExists(hash: string, archivePath: string): Promise<boolean>

  isRawFormat(extension: string): boolean
}
```

**ExifTool Command:**
```bash
exiftool -b -PreviewImage source.NEF > preview.jpg
# Fallback: -JpgFromRaw or -ThumbnailImage
```

**Dependencies:**
- exiftool-vendored
- fs/promises
- path

**Estimated Lines:** ~120

---

### 3. packages/desktop/electron/services/poster-frame-service.ts

**Purpose:** Generate video poster frames using FFmpeg

**Exports:**
```typescript
class PosterFrameService {
  generatePosterFrame(
    sourcePath: string,
    hash: string,
    archivePath: string,
    timestampSeconds?: number  // Default: 1 second
  ): Promise<string | null>

  getPosterPath(hash: string, archivePath: string): string

  posterExists(hash: string, archivePath: string): Promise<boolean>
}
```

**FFmpeg Command:**
```bash
ffmpeg -i source.mp4 -ss 00:00:01 -frames:v 1 poster.jpg
```

**Dependencies:**
- fluent-ffmpeg
- fs/promises
- path

**Estimated Lines:** ~90

---

### 4. packages/desktop/electron/services/media-path-service.ts

**Purpose:** Centralized path utilities for thumbnails, previews, posters

**Exports:**
```typescript
class MediaPathService {
  constructor(archivePath: string)

  // Directory paths
  getThumbnailDir(): string
  getPreviewDir(): string
  getPosterDir(): string

  // File paths (with hash bucketing)
  getThumbnailPath(hash: string): string
  getPreviewPath(hash: string): string
  getPosterPath(hash: string): string

  // Ensure directories exist
  ensureDirectories(): Promise<void>

  // Hash bucketing helper (a3d5... -> a3/a3d5...)
  private bucketPath(hash: string, baseDir: string, ext: string): string
}
```

**Dependencies:**
- fs/promises
- path

**Estimated Lines:** ~60

---

### 5. packages/desktop/src/components/MediaViewer.svelte

**Purpose:** Lightbox component for viewing images with EXIF panel

**Props:**
```typescript
{
  mediaPath: string;           // Full path to media file
  thumbnailPath?: string;      // Optional thumbnail for loading state
  previewPath?: string;        // Optional preview path (for RAW)
  mediaType: 'image' | 'video';
  exifData?: object;           // Parsed EXIF JSON
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}
```

**Features:**
- Dark overlay background
- Native `<img>` for standard images
- Native `<video>` for videos
- Uses preview path for RAW files
- EXIF metadata sidebar (collapsible)
- Keyboard navigation (Escape, Arrow keys)
- "Open in External App" button

**Dependencies:**
- Svelte 5

**Estimated Lines:** ~200

---

### 6. packages/desktop/src/components/MediaGrid.svelte

**Purpose:** Thumbnail grid component for gallery views

**Props:**
```typescript
{
  media: Array<{
    hash: string;
    thumbPath: string | null;
    originalPath: string;
    type: 'image' | 'video';
    width?: number;
    height?: number;
  }>;
  onSelect: (hash: string) => void;
  columns?: number;  // Default: 4
}
```

**Features:**
- Lazy loading thumbnails
- Placeholder for missing thumbnails
- Video badge overlay
- Click to open MediaViewer

**Dependencies:**
- Svelte 5

**Estimated Lines:** ~120

---

### 7. packages/desktop/src/components/ExifPanel.svelte

**Purpose:** Display EXIF metadata in a readable format

**Props:**
```typescript
{
  exifData: object | null;
  expanded?: boolean;
}
```

**Features:**
- Camera info (Make, Model)
- Date taken
- Dimensions
- GPS coordinates (with "View on Map" link)
- Exposure settings (ISO, Aperture, Shutter)
- Collapsible sections

**Dependencies:**
- Svelte 5

**Estimated Lines:** ~100

---

## Impacted Scripts (Modifications)

### 1. packages/desktop/electron/services/file-import-service.ts

**Current Lines:** ~817
**Changes Required:**

1. Inject ThumbnailService, PreviewExtractorService in constructor
2. After file copy (Step 6), call thumbnail generation
3. For RAW files, extract preview
4. Update database record with thumb_path, preview_path

**Modification Points:**
- Line ~154: Add new service dependencies to constructor
- Line ~506: After `importSingleFile` success, generate thumbnail
- Line ~678: Update `insertMediaRecordInTransaction` to include new fields

**Impact:** ~40 new lines (still under 300 rule for service)

---

### 2. packages/desktop/electron/services/exiftool-service.ts

**Current Lines:** ~107
**Changes Required:**

Add method to extract preview image:

```typescript
async extractPreviewImage(
  filePath: string,
  outputPath: string
): Promise<boolean>
```

**Impact:** ~30 new lines

---

### 3. packages/desktop/electron/services/ffmpeg-service.ts

**Current Lines:** ~71
**Changes Required:**

Add method to generate poster frame:

```typescript
async generatePosterFrame(
  filePath: string,
  outputPath: string,
  timestampSeconds?: number
): Promise<boolean>
```

**Impact:** ~25 new lines

---

### 4. packages/desktop/electron/main/database.types.ts

**Current Lines:** ~249
**Changes Required:**

- Add `thumb_path`, `preview_path`, `preview_extracted` to ImgsTable
- Add `thumb_path`, `poster_extracted` to VidsTable

**Impact:** ~10 new lines

---

### 5. packages/desktop/electron/main/ipc-handlers.ts

**Changes Required:**

Add new IPC handlers:

```typescript
// Get thumbnail/preview paths for media
'media:getThumbnail': (hash: string) => Promise<string | null>
'media:getPreview': (hash: string) => Promise<string | null>
'media:getPoster': (hash: string) => Promise<string | null>

// Regenerate missing thumbnails (batch)
'media:regenerateThumbnails': (locid: string) => Promise<{ success: number; failed: number }>

// Get file as base64 for display (security: within archive only)
'media:getFileBase64': (filePath: string) => Promise<string | null>
```

**Impact:** ~60 new lines

---

### 6. packages/desktop/electron/preload/index.ts

**Current Lines:** ~468
**Changes Required:**

Add to `media` object:

```typescript
getThumbnail: (hash: string): Promise<string | null> =>
  ipcRenderer.invoke('media:getThumbnail', hash),
getPreview: (hash: string): Promise<string | null> =>
  ipcRenderer.invoke('media:getPreview', hash),
getPoster: (hash: string): Promise<string | null> =>
  ipcRenderer.invoke('media:getPoster', hash),
getFileBase64: (filePath: string): Promise<string | null> =>
  ipcRenderer.invoke('media:getFileBase64', filePath),
regenerateThumbnails: (locid: string): Promise<{ success: number; failed: number }> =>
  ipcRenderer.invoke('media:regenerateThumbnails', locid),
```

**Impact:** ~15 new lines

---

### 7. packages/desktop/src/pages/LocationDetail.svelte

**Changes Required:**

1. Replace skeleton lightbox with MediaViewer component
2. Use thumbnail grid for image display
3. Pass EXIF data to viewer

**Impact:** Refactor ~50 lines in lightbox section

---

### 8. packages/desktop/electron/repositories/sqlite-media-repository.ts

**Changes Required:**

Add methods:

```typescript
updateThumbnailPath(hash: string, type: 'image' | 'video', thumbPath: string): Promise<void>
updatePreviewPath(hash: string, previewPath: string): Promise<void>
findImagesWithoutThumbnails(locid?: string): Promise<Array<{ imgsha: string; imgloc: string }>>
findVideosWithoutPosters(locid?: string): Promise<Array<{ vidsha: string; vidloc: string }>>
```

**Impact:** ~40 new lines

---

## IPC Security

All file access must be restricted to the archive folder:

```typescript
// In ipc-handlers.ts
function validateArchivePath(filePath: string, archivePath: string): boolean {
  const resolved = path.resolve(filePath);
  const archiveResolved = path.resolve(archivePath);
  return resolved.startsWith(archiveResolved);
}
```

For `media:getFileBase64`:
1. Validate path is within archive
2. Check file exists
3. Read and return as base64 data URL
4. Limit file size (e.g., 50MB max)

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
| NEF (Nikon) | Extract preview via ExifTool |
| CR2/CR3 (Canon) | Extract preview via ExifTool |
| ARW (Sony) | Extract preview via ExifTool |
| DNG | Extract preview via ExifTool |
| RAF (Fuji) | Extract preview via ExifTool |
| ORF (Olympus) | Extract preview via ExifTool |
| RW2 (Panasonic) | Extract preview via ExifTool |
| PEF (Pentax) | Extract preview via ExifTool |

### Video Native Playback
| Format | Support |
|--------|---------|
| MP4 (H.264) | Yes |
| WebM (VP8/VP9) | Yes |
| MOV (H.264) | Yes |
| MKV (H.264) | Yes |
| OGG/OGV | Yes |

### Video External Only
| Format | Reason |
|--------|--------|
| ProRes | No browser support |
| DNxHD | No browser support |
| H.265/HEVC | Partial, OS-dependent |
| AVI (legacy codecs) | No browser support |

---

## Testing Strategy

### Unit Tests
- thumbnail-service.test.ts
- preview-extractor-service.test.ts
- poster-frame-service.test.ts
- media-path-service.test.ts

### Integration Tests
- Import flow generates thumbnails
- RAW import extracts preview
- Video import generates poster

### Manual Testing
- Open lightbox for JPG, PNG, GIF
- Open lightbox for RAW file (should show preview)
- Video playback (MP4, WebM)
- EXIF panel displays correctly
- Keyboard navigation works

---

## Performance Considerations

### Thumbnail Generation
- Run in background after file copy completes
- Use Sharp with quality 80, width 256
- Non-blocking: don't fail import if thumbnail fails

### Preview Extraction
- ExifTool preview extraction is fast (<1s per file)
- Store full-size preview (camera-generated, high quality)
- Fallback chain: PreviewImage -> JpgFromRaw -> ThumbnailImage

### Memory
- Lazy load thumbnails in grid
- Don't load all images at once
- Use virtualization for large galleries (future)

---

## Implementation Order

1. **media-path-service.ts** - Foundation for all paths
2. **thumbnail-service.ts** - Thumbnail generation
3. **Database migration** - Add new columns
4. **file-import-service.ts** - Integration with import
5. **preview-extractor-service.ts** - RAW preview extraction
6. **MediaViewer.svelte** - Basic image viewer
7. **MediaGrid.svelte** - Thumbnail grid
8. **LocationDetail.svelte** - Integration
9. **ExifPanel.svelte** - Metadata display
10. **poster-frame-service.ts** - Video posters
11. **IPC handlers** - API endpoints

---

## LILBITS Compliance Checklist

| Script | Purpose | Est. Lines | Under 300 |
|--------|---------|------------|-----------|
| media-path-service.ts | Path utilities | 60 | Yes |
| thumbnail-service.ts | Thumbnail generation | 80 | Yes |
| preview-extractor-service.ts | RAW preview extraction | 120 | Yes |
| poster-frame-service.ts | Video poster frames | 90 | Yes |
| MediaViewer.svelte | Lightbox component | 200 | Yes |
| MediaGrid.svelte | Thumbnail grid | 120 | Yes |
| ExifPanel.svelte | EXIF display | 100 | Yes |

---

## Dependencies

### Already Installed
- sharp (^0.33.x) - Image processing
- exiftool-vendored (^33.2.0) - EXIF/preview extraction
- fluent-ffmpeg (^2.1.x) - Video processing

### No New Dependencies Required

---

## Notes

- All thumbnail/preview generation is non-blocking
- Import succeeds even if thumbnail generation fails
- RAW files without embedded preview fall back to "Open External"
- Video poster generation can be deferred (not blocking)
- HEIC conversion should be added to Phase 1 thumbnail service

---

End of Plan
