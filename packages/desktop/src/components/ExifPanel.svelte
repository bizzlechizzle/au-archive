<script lang="ts">
  /**
   * ExifPanel - Display EXIF metadata for selected image
   *
   * Features:
   * - Shows camera info (make, model)
   * - Shows image dimensions
   * - Shows date taken
   * - Shows GPS coordinates (if available)
   * - Expandable raw EXIF view
   */

  interface ExifData {
    width?: number | null;
    height?: number | null;
    dateTaken?: string | null;
    cameraMake?: string | null;
    cameraModel?: string | null;
    gpsLat?: number | null;
    gpsLng?: number | null;
    rawExif?: string | null;
  }

  interface Props {
    exif: ExifData | null;
    filename?: string;
    hash?: string;
  }

  let { exif, filename, hash }: Props = $props();

  let showRawExif = $state(false);

  function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return 'Unknown';
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  }

  function formatResolution(width?: number | null, height?: number | null): string {
    if (!width || !height) return 'Unknown';
    return `${width} × ${height}`;
  }

  function formatGps(lat?: number | null, lng?: number | null): string {
    if (lat == null || lng == null) return '';
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }

  function openInMaps(lat: number, lng: number) {
    window.electronAPI?.shell?.openExternal(`https://www.google.com/maps?q=${lat},${lng}`);
  }
</script>

<div class="bg-white rounded-lg shadow p-4">
  <h3 class="text-lg font-semibold text-foreground mb-4">Image Details</h3>

  {#if !exif}
    <p class="text-gray-400 text-sm">No metadata available</p>
  {:else}
    <dl class="space-y-3 text-sm">
      {#if filename}
        <div>
          <dt class="text-gray-500 text-xs uppercase">Filename</dt>
          <dd class="text-gray-900 break-all">{filename}</dd>
        </div>
      {/if}

      {#if exif.width && exif.height}
        <div>
          <dt class="text-gray-500 text-xs uppercase">Resolution</dt>
          <dd class="text-gray-900">{formatResolution(exif.width, exif.height)}</dd>
        </div>
      {/if}

      {#if exif.dateTaken}
        <div>
          <dt class="text-gray-500 text-xs uppercase">Date Taken</dt>
          <dd class="text-gray-900">{formatDate(exif.dateTaken)}</dd>
        </div>
      {/if}

      {#if exif.cameraMake || exif.cameraModel}
        <div>
          <dt class="text-gray-500 text-xs uppercase">Camera</dt>
          <dd class="text-gray-900">
            {[exif.cameraMake, exif.cameraModel].filter(Boolean).join(' ')}
          </dd>
        </div>
      {/if}

      {#if exif.gpsLat != null && exif.gpsLng != null}
        <div>
          <dt class="text-gray-500 text-xs uppercase">GPS Location</dt>
          <dd class="text-gray-900">
            <button
              onclick={() => openInMaps(exif.gpsLat!, exif.gpsLng!)}
              class="text-accent hover:underline font-mono text-xs"
            >
              {formatGps(exif.gpsLat, exif.gpsLng)}
            </button>
          </dd>
        </div>
      {/if}

      {#if hash}
        <div>
          <dt class="text-gray-500 text-xs uppercase">SHA256</dt>
          <dd class="text-gray-900 font-mono text-xs break-all">{hash}</dd>
        </div>
      {/if}

      {#if exif.rawExif}
        <div class="pt-2 border-t border-gray-200">
          <button
            onclick={() => showRawExif = !showRawExif}
            class="text-accent hover:underline text-xs"
          >
            {showRawExif ? 'Hide' : 'Show'} Raw EXIF Data
          </button>

          {#if showRawExif}
            <pre class="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto max-h-64 overflow-y-auto">{exif.rawExif}</pre>
          {/if}
        </div>
      {/if}
    </dl>
  {/if}
</div>
