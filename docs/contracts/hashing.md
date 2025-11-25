# File/Hash Contract

## Hashing

- SHA256 computed before any metadata extraction or moves.
- Hash collisions are treated as duplicates; reuse metadata links instead of duplicating bytes.

## Naming

- Each file retains `original_name` and `organized_name` (hash + extension).
- Organized paths live under the managed archive folder selected in Settings.

## Storage + Linking

- Media tables reference files by SHA (primary key) plus location/sub-location IDs.
- Imports remain idempotent; rerunning import on same directory only adds links, not bytes.
- Deletions mark records inactive but never delete bytes without user command.

## Audit Trail

- Capture importer username, timestamps, and source paths for every record.
- Provide export/report ability to map SHA → organized path → metadata.

## Import Sequence Checklist

1. User selects files/folders; renderer sends absolute paths through preload.
2. Main process validates permissions and checks available disk space.
3. Hash service streams file, computes SHA256, and writes organized file name.
4. File copies into archive folder; metadata extraction runs afterward.
5. Repository upserts media record keyed by SHA and links to selected location/sub-location (if provided).
6. Import queue stores status (`pending`, `processing`, `complete`, `error`) for UI progress bars.
