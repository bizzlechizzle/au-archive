# Import Workflow

## Import Spine

Watcher scans drop zone, hashes every file, copies into archive folder, and links to locations via SHA primary keys **before metadata extraction**.

## Import Sequence

1. **User selects files/folders** — Renderer sends absolute paths through preload
2. **Main process validates** — Check permissions, available disk space
3. **Hash service computes SHA256** — Stream file, compute hash, assign organized name `<sha>.<ext>`
4. **File copied to archive folder** — Organized by location structure
5. **Metadata extraction runs** — ExifTool/FFmpeg/sharp extract metadata in background
6. **Repository upserts** — Media record keyed by SHA, linked to location/sub-location (if provided)
7. **Import queue updates** — Status: pending → processing → complete/error

## Folder Organization

User-selected base folder → `locations/[STATE]-[TYPE]/[SLOCNAM]-[LOC12]/`

Subfolders:
- `org-img-[LOC12]/` — Images
- `org-vid-[LOC12]/` — Videos
- `org-doc-[LOC12]/` — Documents

## Idempotency

Imports are idempotent. Rerunning import on same directory only adds links, not duplicate bytes. Hash collisions reuse existing files.

## Status Tracking

Import queue stores status for UI progress bars:
- `pending` — Queued, not started
- `processing` — Currently importing
- `complete` — Successfully imported
- `error` — Failed with reason

## Error Handling

- **SHA256 mismatch** — File corrupted, reject import
- **Permission denied** — Show error, suggest folder permissions fix
- **Disk space** — Check before import, warn user if insufficient
- **Duplicate file** — Prompt: skip or overwrite

## Progress Indicators

- Real-time progress bars in UI
- Background job for metadata extraction (doesn't block)
- Progress events emitted via IPC (`media:import:progress`)

## Audit Trail

Every import captures:
- Importer username
- Timestamps (import_date)
- Source paths (original_name)
- SHA256 hash (organized_name)
