# Kanye4.md - RAW File Import/View Deep Analysis (Ultrathink)

**Created:** 2024-11-23
**Context:** Debugging why .NEF (Nikon RAW) files show "Cannot display this file format in browser"
**Branch:** `claude/debug-kanye-imports-01G5tCQcDnvuXMRajCARKrDC`

---

## Executive Summary

**THE ROOT CAUSE:** Preview extraction is NEVER called during import. The `PreviewExtractorService` exists but is orphaned - not wired into the import pipeline.

**Result:** RAW files import successfully but `preview_path` is always NULL, so MediaViewer tries to load the raw .nef file directly, which browsers cannot render.

---

## The Symptom

User imports a `.nef` file (Nikon RAW). When they try to view it:

```
Cannot display this file format in browser
2bdece4c4828a110b86a061ce6f7862fc6fb23012fe4a84e680a40d377d1418e.nef
```

The "Open in System Viewer" button works, proving the file exists. But inline viewing fails.

---

## Root Cause Analysis

### What SHOULD Happen (Per kanye.md Architecture)

```
1. User imports .nef file
2. FileImportService detects RAW format
3. PreviewExtractorService.extractPreview() called
   - ExifTool extracts embedded JPEG preview
   - Saves to .previews/a3/hash.jpg
4. ThumbnailService.generateThumbnail() called
   - Sharp creates 256px thumbnail from preview
   - Saves to .thumbnails/a3/hash.jpg
5. Database INSERT includes:
   - imgloc = /path/to/archive/hash.nef (original)
   - thumb_path = /path/to/.thumbnails/a3/hash.jpg
   - preview_path = /path/to/.previews/a3/hash.jpg
6. MediaViewer uses preview_path for display
```

### What ACTUALLY Happens (Current Code)

```
1. User imports .nef file
2. FileImportService detects RAW format (image type)
3. ExifTool extracts METADATA (width, height, camera, etc.) - WORKS
4. File copied to archive - WORKS
5. Database INSERT:
   - imgloc = /path/to/archive/hash.nef
   - thumb_path = NULL (never generated!)
   - preview_path = NULL (never generated!)
6. MediaViewer sees preview_path is null
7. Falls back to: media://path/to/hash.nef
8. Browser cannot render .nef -> ERROR
```

### The Missing Link

**File:** `packages/desktop/electron/services/file-import-service.ts`
**Lines:** 679-700 (insertMediaRecordInTransaction)

```typescript
// CURRENT CODE - NO THUMBNAIL OR PREVIEW
await trx.insertInto('imgs').values({
  imgsha: hash,
  imgnam: path.basename(archivePath),
  // ... other fields ...
  // MISSING: thumb_path
  // MISSING: preview_path
}).execute();
```

**The services exist but are never called:**
- `PreviewExtractorService.extractPreview()` - EXISTS, never called in import flow
- `ThumbnailService.generateThumbnail()` - EXISTS, never called in import flow
- `media:extractPreview` IPC handler - EXISTS, orphaned (only for manual use)
- `media:generateThumbnail` IPC handler - EXISTS, orphaned (only for manual use)

---

## Complete Flow Audit

### Backend (Electron Main Process)

| Component | Status | Issue |
|-----------|--------|-------|
| `file-import-service.ts` | BROKEN | No preview/thumbnail generation |
| `preview-extractor-service.ts` | ORPHANED | Never called during import |
| `thumbnail-service.ts` | ORPHANED | Never called during import |
| `media-processing.ts` IPC handlers | ORPHANED | Only exposed for manual calls |
| `exiftool-service.ts` | WORKS | Metadata extraction is fine |
| `media-path-service.ts` | WORKS | Path utilities work correctly |
| `sqlite-media-repository.ts` | WORKS | Has `updateImagePreviewPath` method |

### Frontend (Renderer Process)

| Component | Status | Issue |
|-----------|--------|-------|
| `MediaViewer.svelte` | PARTIAL | Has fallback logic but no RAW detection |
| `MediaGrid.svelte` | PARTIAL | Shows file extension icon when no thumbnail |
| `LocationDetail.svelte` | WORKS | Correctly maps preview_path from DB |

### Preload Bridge

| Method | Status | Issue |
|--------|--------|-------|
| `media.extractPreview` | EXPOSED | Never called automatically |
| `media.generateThumbnail` | EXPOSED | Never called automatically |
| `media.findByLocation` | WORKS | Returns preview_path (but it's always null) |

---

## What Would You Do Differently (WWYDD)

### 1. Add Preview/Thumbnail Generation to Import Pipeline

**Location:** `file-import-service.ts` after Step 5 (metadata extraction)

```typescript
// PROPOSED: Step 5b - Generate preview for RAW files
if (type === 'image' && this.previewService.isRawFormat(file.filePath)) {
  console.log('[FileImport] Step 5b: Extracting RAW preview...');
  const previewPath = await this.previewService.extractPreview(file.filePath, hash);
  if (previewPath) {
    metadata.previewPath = previewPath;
  }
}

// PROPOSED: Step 5c - Generate thumbnail
console.log('[FileImport] Step 5c: Generating thumbnail...');
const sourceForThumb = metadata.previewPath || file.filePath;
const thumbPath = await this.thumbnailService.generateThumbnail(sourceForThumb, hash);
if (thumbPath) {
  metadata.thumbPath = thumbPath;
}
```

### 2. Track Preview Generation Status

**Database Change:** Add `preview_status` column to `imgs` table

```sql
ALTER TABLE imgs ADD COLUMN preview_status TEXT DEFAULT 'pending';
-- Values: 'pending', 'success', 'failed', 'not_applicable'
```

**Why:** Allows UI to show meaningful states:
- `pending` -> Show spinner + "Generating preview..."
- `success` -> Show the preview
- `failed` -> Show "Preview unavailable" + retry button
- `not_applicable` -> Standard image, no preview needed

### 3. Better Error UX in MediaViewer

**Current:** Shows generic "Cannot display this file format in browser"

**Proposed:**
```svelte
{:else if isRawFile && !currentMedia.previewPath}
  <div class="text-center text-white">
    <CameraIcon class="w-24 h-24 mx-auto mb-4 text-gray-500" />
    <p class="text-xl mb-2">RAW File - No Preview Available</p>
    <p class="text-gray-400 mb-4">{currentMedia.name}</p>
    <div class="flex gap-4 justify-center">
      <button onclick={retryPreviewExtraction} class="btn-primary">
        Generate Preview
      </button>
      <button onclick={openInSystemViewer} class="btn-secondary">
        Open in Photo Editor
      </button>
    </div>
  </div>
{/if}
```

### 4. Add RAW File Detection to Frontend

```typescript
// utils/file-types.ts
export const RAW_EXTENSIONS = new Set([
  '.nef', '.nrw', '.cr2', '.cr3', '.arw', '.dng', '.orf',
  '.raf', '.rw2', '.pef', '.raw', '.srw', '.x3f', '.3fr'
]);

export function isRawFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return RAW_EXTENSIONS.has(ext);
}
```

### 5. Implement Preview Retry Mechanism

**New IPC Handler:** `media:retryPreviewExtraction`

```typescript
ipcMain.handle('media:retryPreviewExtraction', async (_event, imgsha: string) => {
  // 1. Look up image record
  const img = await mediaRepo.findImageBySha(imgsha);
  if (!img) return { success: false, error: 'Image not found' };

  // 2. Check if it's a RAW file
  if (!previewService.isRawFormat(img.imgloc)) {
    return { success: false, error: 'Not a RAW file' };
  }

  // 3. Try to extract preview
  const previewPath = await previewService.extractPreview(img.imgloc, imgsha);

  // 4. Update database
  if (previewPath) {
    await mediaRepo.updateImagePreviewPath(imgsha, previewPath);
    return { success: true, previewPath };
  }

  return { success: false, error: 'No embedded preview found' };
});
```

### 6. Add Background Preview Generation Job

For bulk imports or fixing existing data:

```typescript
// services/background-preview-job.ts
export async function regenerateMissingPreviews(
  onProgress?: (current: number, total: number) => void
): Promise<{ processed: number; succeeded: number; failed: number }> {
  // 1. Find all RAW images without previews
  const rawImages = await db
    .selectFrom('imgs')
    .select(['imgsha', 'imgloc'])
    .where('preview_path', 'is', null)
    .where(sql`LOWER(imgloc) LIKE '%.nef'
           OR LOWER(imgloc) LIKE '%.cr2'
           OR LOWER(imgloc) LIKE '%.arw'
           -- ... other RAW formats`)
    .execute();

  // 2. Process each one
  let succeeded = 0, failed = 0;
  for (let i = 0; i < rawImages.length; i++) {
    const img = rawImages[i];
    const previewPath = await previewService.extractPreview(img.imgloc, img.imgsha);

    if (previewPath) {
      await mediaRepo.updateImagePreviewPath(img.imgsha, previewPath);
      succeeded++;
    } else {
      failed++;
    }

    onProgress?.(i + 1, rawImages.length);
  }

  return { processed: rawImages.length, succeeded, failed };
}
```

---

## Premium User Experience Requirements

For an ARCHIVE APP, viewing imported files is the core value proposition. Here's the premium UX:

### Import Flow UX

1. **Progress Indicator Shows Phases**
   ```
   [============================] 75%
   Phase: Extracting RAW preview (3 of 4)
   File: DSC_1234.nef
   ```

2. **Post-Import Summary**
   ```
   Import Complete
   - 42 images imported
   - 38 thumbnails generated
   - 4 RAW previews extracted
   - 2 RAW files had no embedded preview (will show in system viewer)
   ```

3. **Warnings for Failed Previews**
   ```
   WARNING: 2 RAW files imported without previews
   These files can still be opened in your photo editor.
   [View Files] [Dismiss]
   ```

### Grid View UX

| Scenario | Display |
|----------|---------|
| Image with thumbnail | Thumbnail image |
| RAW with preview | Preview thumbnail |
| RAW without preview | Camera icon + "RAW" badge |
| Video with poster | Poster frame + play icon |
| Video without poster | Film icon + duration |
| Document | Document icon + file type |

### Lightbox View UX

| Scenario | Display |
|----------|---------|
| Standard image | Full image via `media://` |
| RAW with preview | Preview JPEG via `media://` |
| RAW without preview | Placeholder + "Open in Editor" CTA |
| Unsupported format | Clear message + system viewer button |

### Keyboard Shortcuts (Premium Feel)

| Key | Action |
|-----|--------|
| Arrow Left/Right | Navigate |
| Escape | Close lightbox |
| i | Toggle info panel |
| o | Open in system viewer |
| r | Retry preview extraction (for RAW) |
| f | Toggle fullscreen |
| 1-5 | Set rating (future XMP feature) |

---

## Implementation Plan for Inexperienced Coder

### Phase 1: Wire Preview Extraction to Import (CRITICAL)

**Goal:** RAW files get previews extracted during import

**Files to Modify:**
1. `file-import-service.ts` - Add preview extraction step
2. `media-import.ts` - Pass preview service to FileImportService

**Step-by-Step:**

1. Open `packages/desktop/electron/main/ipc-handlers/media-import.ts`
2. Find where `FileImportService` is constructed (around line 116)
3. Add imports for preview and thumbnail services
4. Pass them to FileImportService constructor
5. Open `packages/desktop/electron/services/file-import-service.ts`
6. Add constructor parameters for PreviewExtractorService and ThumbnailService
7. After metadata extraction (around line 470), add preview extraction call
8. Before database insert (around line 680), add thumb_path and preview_path

### Phase 2: Update Database Insert

**Goal:** Save preview_path and thumb_path to database

**Files to Modify:**
1. `file-import-service.ts` - Include paths in INSERT

**Look for this code block (lines 679-700):**
```typescript
await trx.insertInto('imgs').values({
  // ... existing fields
})
```

**Add these fields:**
```typescript
thumb_path: metadata.thumbPath || null,
preview_path: metadata.previewPath || null,
```

### Phase 3: Add Retry Mechanism (Nice to Have)

**Goal:** Users can regenerate failed previews

**Files to Create/Modify:**
1. Create new IPC handler `media:retryPreview`
2. Add button to MediaViewer error state
3. Wire up preload bridge

### Phase 4: Bulk Regeneration (Nice to Have)

**Goal:** Fix all existing RAW files missing previews

**Files to Create:**
1. `background-preview-job.ts` - Background processor
2. Settings page button to trigger regeneration

---

## Testing Checklist

After implementation, verify:

- [ ] Import a .nef file
- [ ] Check console for "[PreviewExtractor] Extracted PreviewImage from..."
- [ ] Check `.previews/` folder for extracted JPEG
- [ ] Check database: `SELECT preview_path FROM imgs WHERE imgsha = '...'`
- [ ] Open MediaViewer - should display preview JPEG
- [ ] Check grid view shows thumbnail
- [ ] Import a JPG - should still work (no preview extraction needed)
- [ ] Import a RAW file with no embedded preview - should show graceful error

---

## Files Reference

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| `file-import-service.ts` | 817 | Main import logic | NEEDS FIX |
| `preview-extractor-service.ts` | 125 | RAW preview extraction | ORPHANED |
| `thumbnail-service.ts` | 107 | Thumbnail generation | ORPHANED |
| `media-import.ts` | 258 | IPC handlers for import | NEEDS FIX |
| `media-processing.ts` | 203 | IPC handlers for media ops | OK |
| `MediaViewer.svelte` | 259 | Lightbox display | NEEDS ENHANCEMENT |
| `MediaGrid.svelte` | 92 | Grid display | NEEDS ENHANCEMENT |
| `sqlite-media-repository.ts` | 300+ | DB operations | HAS updateImagePreviewPath |

---

## Previous Session Fixes (Kanye3.md)

- [x] Fixed `file://` protocol blocked -> Implemented `media://` protocol
- [x] Fixed preload script sync issues
- [x] Split IPC handlers for LILBITS compliance

---

## Summary

**Problem:** Preview extraction services exist but are never called during import.

**Solution:** Wire `PreviewExtractorService.extractPreview()` and `ThumbnailService.generateThumbnail()` into the `FileImportService.importSingleFile()` method.

**Estimated Effort:** 2-3 hours for Phase 1-2 (critical fix), 4-6 hours for Phase 3-4 (nice to have).

**Risk:** Low - services are already tested and working, just need to be called.

---

## Next Steps

1. **STOP** - Do not implement until this document is reviewed
2. Review this analysis for accuracy
3. Decide on Phase 1-2 vs full implementation
4. Create implementation branch
5. Implement, test, commit
6. Update this document with results
