# @au-archive/import-core

Framework-agnostic import pipeline for AU Archive.

## Overview

This package contains the core business logic for importing media files into the AU Archive system. It is designed to be used by CLI, Electron desktop, or cloud deployments without modification.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    @au-archive/import-core                   │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  Services   │  │  Adapters   │  │   Domain    │          │
│  │             │  │ (interfaces)│  │   Models    │          │
│  │ - fixity    │  │ - storage   │  │ - location  │          │
│  │             │  │ - database  │  │ - media     │          │
│  │             │  │ - metadata  │  │ - manifest  │          │
│  │             │  │             │  │ - provenance│          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                      Pipeline                        │    │
│  │  LOG IT → SERIALIZE IT → COPY & NAME IT → DUMP      │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Installation

```bash
pnpm add @au-archive/import-core
```

## Usage

```typescript
import { ImportOrchestrator } from '@au-archive/import-core';

// Create adapters (implementations from @au-archive/adapters-local)
const storage = new LocalStorageAdapter();
const database = new SQLiteAdapter('/path/to/db.sqlite');
const metadata = new ExifToolAdapter();

// Create orchestrator
const orchestrator = new ImportOrchestrator(
  {
    archivePath: '/path/to/archive',
    manifestPath: '/path/to/archive/imports',
  },
  { storage, database, metadata }
);

// Run import
const result = await orchestrator.import(
  {
    files: [
      { path: '/photos/DSC_0001.NEF', name: 'DSC_0001.NEF', size: 25000000 },
      { path: '/photos/DSC_0002.NEF', name: 'DSC_0002.NEF', size: 25000000 },
    ],
    locationId: 'loc-abc123',
    location: {
      locid: 'loc-abc123',
      locnam: 'Abandoned Hospital',
      slocnam: 'hospital',
      loc12: 'HOSP12345678',
      address_state: 'NY',
      type: 'Hospital',
      gps_lat: 42.0,
      gps_lng: -74.0,
    },
    options: {
      deleteOriginals: false,
      verifyChecksums: true,
    },
    authImp: 'username',
  },
  (progress) => {
    console.log(`${progress.phase}: ${progress.percent}%`);
  }
);

console.log(`Imported ${result.summary.imported} files`);
```

## Pipeline Phases

### Phase 1: LOG IT
- Validates location exists in database
- Validates all input files exist
- Creates manifest with file entries
- Saves manifest to disk

### Phase 2: SERIALIZE IT
- Classifies file types by extension
- Calculates SHA256 hashes (parallel)
- Checks for duplicates
- Extracts metadata (batch)

### Phase 3: COPY & NAME IT
- Creates folder structure
- Copies files with integrity verification
- Renames to SHA256.ext format
- Supports rsync optimization

### Phase 4: DUMP
- Single transaction for all DB operations
- Inserts media records
- Inserts provenance records
- Creates import record
- Appends to audit log

## Adapter Interfaces

### StorageAdapter
Abstracts file system operations for local/cloud portability.

```typescript
interface StorageAdapter {
  read(path: string): Promise<Buffer>;
  write(path: string, data: Buffer): Promise<void>;
  copy(source: string, dest: string, options?: CopyOptions): Promise<CopyResult>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
  mkdir(path: string, recursive?: boolean): Promise<void>;
  list(directory: string): Promise<FileInfo[]>;
  stat(path: string): Promise<FileStat>;
  // ... path utilities
}
```

### DatabaseAdapter
Abstracts database operations for SQLite/Postgres portability.

```typescript
interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  transaction<T>(fn: (trx: TransactionContext) => Promise<T>): Promise<T>;
  findLocation(id: string): Promise<Location | null>;
  insertMedia(trx: TransactionContext, data: MediaRecord): Promise<void>;
  insertProvenance(trx: TransactionContext, data: ProvenanceRecord): Promise<void>;
  appendAuditLog(entry: AuditEntry): Promise<void>;
  // ... more methods
}
```

### MetadataAdapter
Abstracts EXIF/video metadata extraction.

```typescript
interface MetadataAdapter {
  extract(filePath: string, type: MediaType): Promise<MetadataResult>;
  extractBatch(files: BatchMetadataInput[]): Promise<Map<string, MetadataResult>>;
  extractGPS(metadata: MediaMetadata): GPSCoordinates | null;
}
```

## Domain Models

- **Location**: Abandoned location with GPS, address, status
- **Media**: Image, video, document, map records
- **Provenance**: Chain of custody (WHO/WHAT/WHEN/WHERE/WHY)
- **Manifest**: Import state tracking for recovery/audit

## File Extensions

Supports 76+ file formats:
- **Images**: JPG, PNG, TIFF, RAW (NEF, CR2, ARW, DNG, etc.)
- **Videos**: MP4, MOV, MKV, AVI, WebM, etc.
- **Documents**: PDF, DOC, DOCX, TXT, etc.
- **Maps**: GPX, KML, KMZ, GeoJSON, Shapefile

## Resume Support

If an import is interrupted, it can be resumed from the last completed phase:

```typescript
const result = await orchestrator.resume('/path/to/manifest.json');
```

## Testing

```bash
pnpm test
```

## License

MIT
