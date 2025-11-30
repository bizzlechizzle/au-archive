# Lilbits - Script Registry

Canonical registry of scripts and utilities. Each script should be under 300 LOC and serve one focused function.

## Scripts

### `scripts/setup.sh`

**Purpose:** Full setup script for AU Archive - installs all dependencies including Research Browser

**Usage:**
```bash
./scripts/setup.sh              # Full setup
./scripts/setup.sh --skip-optional  # Skip libpostal, exiftool, ffmpeg
./scripts/setup.sh --skip-browser   # Skip Ungoogled Chromium download (~150MB)
./scripts/setup.sh --help           # Show all options
```

**Description:**
7-phase installation script:
1. Check required tools (Node.js, pnpm, git)
2. Install Node.js dependencies via pnpm
3. Build native modules (better-sqlite3, sharp) for Electron
4. Install optional dependencies (libpostal, exiftool, ffmpeg)
5. Download and install Research Browser (Ungoogled Chromium)
6. Build the application
7. Verify installation

Supports macOS (arm64/x64), Linux (x64), and Windows (manual browser install).

**Lines:** ~500 LOC

**Updated:** 2025-11-29 (Added Research Browser download)

---

### `scripts/test-region-gaps.ts`

**Purpose:** Test region gap coverage across all 50 states + DC + territories

**Usage:**
```bash
npx ts-node scripts/test-region-gaps.ts
```

**Description:**
Generates test locations for all 54 states/territories across 5 scenarios:
- Full Data (GPS + Address)
- GPS Only
- Address Only (State + County)
- State Only
- Minimal (Name Only)

Validates that all 8 region fields are populated without gaps. Reports failures with gap field details.

**Lines:** ~259 LOC

**Added:** 2024-11-28 (Region Gap Fix)

---

### `scripts/run-dedup.py`

**Purpose:** GPS-based deduplication for ref_map_points table

**Usage:**
```bash
python3 scripts/run-dedup.py
```

**Description:**
Migration 39 cleanup script. Finds and merges duplicate pins that exist at the same GPS location (within ~10m precision = 4 decimal places):

1. Creates a backup before modifications
2. Runs Migration 39 if needed (aka_names column)
3. Groups points by rounded GPS coordinates
4. Scores each name for quality (length, descriptiveness, proper nouns)
5. Keeps the best name, stores alternates in aka_names (pipe-separated)
6. Deletes duplicate points

Uses Python's built-in sqlite3 module (no native module issues with Electron's Node version).

**Lines:** ~235 LOC

**Added:** 2025-11-30 (Migration 39 - Ref Map Deduplication)
