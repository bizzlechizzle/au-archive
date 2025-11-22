# @au-archive/cli

Command line interface for AU Archive - manage your abandoned urbex photo archive from the terminal.

## Overview

The CLI provides headless access to the AU Archive system, enabling:

- Automated imports via scripts or cron jobs
- Archive integrity verification
- Status monitoring for server deployments
- Integration with backup systems

```
┌─────────────────────────────────────────────────────────────┐
│                        @au-archive/cli                       │
├─────────────────────────────────────────────────────────────┤
│  import   │   verify   │   status   │   init               │
│  command  │   command  │   command  │   command            │
├─────────────────────────────────────────────────────────────┤
│                    import-core + adapters-local              │
└─────────────────────────────────────────────────────────────┘
```

## Installation

```bash
# From workspace root
pnpm add @au-archive/cli

# Or install globally
pnpm add -g @au-archive/cli
```

## Commands

### init

Initialize a new archive:

```bash
au-archive init
au-archive init --path /data/archive --database /data/archive.db
```

### import

Import files into the archive:

```bash
# Import single file
au-archive import photo.jpg -l ABC123DEF456

# Import multiple files
au-archive import *.jpg *.png -l ABC123DEF456

# Import entire directory
au-archive import ./photos/ -l ABC123DEF456

# Import with options
au-archive import photos/ -l ABC123DEF456 --delete --hardlink

# Dry run (show what would be imported)
au-archive import photos/ -l ABC123DEF456 --dry-run
```

Options:
- `-l, --location <id>` - Target location ID (UUID or loc12) **(required)**
- `-d, --delete` - Delete originals after successful import
- `--hardlink` - Use hardlinks instead of copying
- `--no-verify` - Skip checksum verification
- `--dry-run` - Show what would be imported
- `--resume <manifest>` - Resume interrupted import
- `-v, --verbose` - Show detailed progress

### verify

Verify archive integrity:

```bash
# Verify all files
au-archive verify --all

# Verify specific location
au-archive verify -l ABC123DEF456

# Verify random sample
au-archive verify --sample 100

# Verify files not checked in 7 days
au-archive verify --since 7
```

Options:
- `-l, --location <id>` - Verify specific location
- `-a, --all` - Verify entire archive
- `-s, --sample <n>` - Verify random sample of n files
- `--since <days>` - Only verify files not checked in n days
- `-v, --verbose` - Show detailed progress

### status

Show archive status and statistics:

```bash
# Basic status
au-archive status

# JSON output for scripts
au-archive status --json

# Status for specific location
au-archive status -l ABC123DEF456
```

## Configuration

The CLI loads configuration from multiple sources (highest priority first):

1. Environment variables
2. Config file
3. Default values

### Environment Variables

```bash
export AU_ARCHIVE_DATABASE_PATH=/path/to/archive.db
export AU_ARCHIVE_PATH=/path/to/media
export AU_ARCHIVE_DELETE_ORIGINALS=false
export AU_ARCHIVE_USE_RSYNC=true
```

### Config File

Create `.au-archiverc.json` or `au-archive.config.js`:

```json
{
  "databasePath": "/data/archive.db",
  "archivePath": "/data/media",
  "import": {
    "deleteOriginals": false,
    "useHardlinks": false,
    "verifyChecksums": true,
    "useRsync": true
  },
  "verify": {
    "intervalDays": 30,
    "onStartup": false
  }
}
```

### Default Paths

- Database: `~/.au-archive/archive.db`
- Archive: `~/.au-archive/media/`

## Examples

### Automated Import Script

```bash
#!/bin/bash
# import-from-camera.sh

IMPORT_DIR="/media/camera/DCIM"
LOCATION_ID="ABC123DEF456"

if [ -d "$IMPORT_DIR" ]; then
  au-archive import "$IMPORT_DIR" -l "$LOCATION_ID" --delete
  echo "Import complete"
else
  echo "Camera not mounted"
fi
```

### Cron Job for Verification

```bash
# Run verification weekly
0 3 * * 0 /usr/local/bin/au-archive verify --all >> /var/log/au-archive-verify.log 2>&1
```

### Backup Integration

```bash
# Verify before backup
au-archive verify --all
if [ $? -eq 0 ]; then
  rsync -av ~/.au-archive/ /backup/au-archive/
fi
```

## Exit Codes

- `0` - Success
- `1` - Error (see stderr for details)

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Run CLI directly
pnpm start --help
```

## License

MIT
