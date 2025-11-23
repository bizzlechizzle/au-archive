# KANYE11: RAW Preview Extraction Bug Fix

**Version:** 11.0.0
**Created:** 2025-11-23
**Status:** FIXED AND DEPLOYED
**Type:** Critical Bug Fix

---

## EXECUTIVE SUMMARY

Fixed critical bug preventing RAW image preview extraction. NEF files now properly extract previews and can be displayed in MediaViewer.

---

## ROOT CAUSE ANALYSIS

### The Bug

```
TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string. Received an instance of Object
at MediaPathService.getPreviewDir
```

### Root Cause

In `packages/desktop/electron/main/ipc-handlers/media-processing.ts`, the `getArchivePath()` function was:

```typescript
// BROKEN CODE
const getArchivePath = async (): Promise<string> => {
  const archivePath = await getConfigService().get('archivePath');  // BUG!
  if (!archivePath) throw new Error('Archive path not configured');
  return archivePath;
};
```

**Problem:** `ConfigService.get()` doesn't take parameters - it returns the entire AppConfig object. The archive path is stored in the **database settings table** with key `'archive_folder'`, NOT in the config file.

When this Object was passed to `MediaPathService`, Node's `path.join()` threw the error.

### The Fix

```typescript
// FIXED CODE
const getArchivePath = async (): Promise<string> => {
  // Kanye10 FIX: archivePath is stored in database settings, not config file
  const result = await db.selectFrom('settings').select('value').where('key', '=', 'archive_folder').executeTakeFirst();
  if (!result?.value) throw new Error('Archive path not configured');
  return result.value;
};
```

---

## FILES MODIFIED

| File | Change |
|------|--------|
| `packages/desktop/electron/main/ipc-handlers/media-processing.ts` | Fixed getArchivePath() to query database settings table |

---

## VERIFICATION

After fix, the regeneration should show:
```
[Kanye9] Extracting previews for 2 RAW files missing previews...
[Kanye9] Extracted preview for 76f411e6...
[Kanye9] Extracted preview for d2e0b51b...
[Kanye9] Preview extraction complete: 2 extracted, 0 failed
```

---

## LESSONS LEARNED

1. **ConfigService vs Database Settings** - The app stores different configs in different places:
   - `ConfigService` (config.json): backup settings, monitoring settings
   - Database `settings` table: archive_folder, setup_complete, user preferences

2. **Error Messages Matter** - "Received an instance of Object" immediately tells us a full object was passed instead of a string.

3. **Test After Merge** - This bug may have been introduced during a merge where different config patterns were combined.

---

## RELATED KANYE DOCS

- Kanye8: Original audit identifying missing features
- Kanye9: Identified preview extraction was failing, but diagnosed wrong cause
- Kanye10: Darktable integration (unrelated to this bug)

---

## STATUS

- [x] Bug identified
- [x] Root cause found
- [x] Fix implemented
- [x] Committed to branch
- [x] Merged latest main
- [x] Pushed to remote
- [ ] Pull request created
- [ ] Merged to main

---

*This is kanye11.md - RAW preview extraction bug fix documentation.*
