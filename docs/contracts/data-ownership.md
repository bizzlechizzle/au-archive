# Data Ownership Guarantees

## Core Principles

- 100% of archive data (media, metadata, database, indexes) resides locally unless the user exports manually.
- No analytics, crash uploads, or background sync. Network calls are only to map/geocode services in Light mode.
- Every media file's provenance (hash, path, importer, timestamps) is auditable at any time.
- Users can relocate the archive folder; the app must update paths and continue functioning offline.
- Exports (CSV, GeoJSON, HTML) never contain hidden identifiers or AI references.

## Backups

Provide SQLite + media directory backup instructions; never compress without verifying integrity hashes.

## Restoration

Importers respect existing SHA records to avoid duplicates when restoring from backup.

## Privacy

Never auto-open external URLs or embed third-party iframes without explicit opt-in.

## Integrity Checks

Background job (optional) can re-hash random samples and compare against stored SHAs; log any mismatch and surface remediation steps.

## Logging Scope

All operational logs stay local (filesystem or developer console). No remote log aggregation.

## License Ledger

Track dependency licenses in build output so users understand what ships with their data.

## Consent

Every export prompts for destination and summarizes what data leaves the machine; nothing leaves silently.

## Attribution

Preserve original EXIF, captions, and credit metadata; never strip authorship information.

## Transparency

Settings page lists archive path, disk usage, and detected edition so users always know where data lives.

## Export Log

Maintain a local log of exports/backups (timestamp, scope, destination) for auditing; never upload it.
