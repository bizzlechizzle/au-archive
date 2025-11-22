<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Map as LeafletMap, TileLayer, LayerGroup } from 'leaflet';
  import type { Location } from '@au-archive/core';
  import Supercluster from 'supercluster';
  import { MAP_CONFIG, TILE_LAYERS, THEME, GPS_CONFIG } from '@/lib/constants';

  // US State centroids for fallback positioning when GPS is unavailable
  // Allows locations with city+state to appear on map approximately
  const STATE_CENTROIDS: Record<string, { lat: number; lng: number }> = {
    'AL': { lat: 32.806671, lng: -86.791130 },
    'AK': { lat: 61.370716, lng: -152.404419 },
    'AZ': { lat: 33.729759, lng: -111.431221 },
    'AR': { lat: 34.969704, lng: -92.373123 },
    'CA': { lat: 36.116203, lng: -119.681564 },
    'CO': { lat: 39.059811, lng: -105.311104 },
    'CT': { lat: 41.597782, lng: -72.755371 },
    'DE': { lat: 39.318523, lng: -75.507141 },
    'FL': { lat: 27.766279, lng: -81.686783 },
    'GA': { lat: 33.040619, lng: -83.643074 },
    'HI': { lat: 21.094318, lng: -157.498337 },
    'ID': { lat: 44.240459, lng: -114.478828 },
    'IL': { lat: 40.349457, lng: -88.986137 },
    'IN': { lat: 39.849426, lng: -86.258278 },
    'IA': { lat: 42.011539, lng: -93.210526 },
    'KS': { lat: 38.526600, lng: -96.726486 },
    'KY': { lat: 37.668140, lng: -84.670067 },
    'LA': { lat: 31.169546, lng: -91.867805 },
    'ME': { lat: 44.693947, lng: -69.381927 },
    'MD': { lat: 39.063946, lng: -76.802101 },
    'MA': { lat: 42.230171, lng: -71.530106 },
    'MI': { lat: 43.326618, lng: -84.536095 },
    'MN': { lat: 45.694454, lng: -93.900192 },
    'MS': { lat: 32.741646, lng: -89.678696 },
    'MO': { lat: 38.456085, lng: -92.288368 },
    'MT': { lat: 46.921925, lng: -110.454353 },
    'NE': { lat: 41.125370, lng: -98.268082 },
    'NV': { lat: 38.313515, lng: -117.055374 },
    'NH': { lat: 43.452492, lng: -71.563896 },
    'NJ': { lat: 40.298904, lng: -74.521011 },
    'NM': { lat: 34.840515, lng: -106.248482 },
    'NY': { lat: 42.165726, lng: -74.948051 },
    'NC': { lat: 35.630066, lng: -79.806419 },
    'ND': { lat: 47.528912, lng: -99.784012 },
    'OH': { lat: 40.388783, lng: -82.764915 },
    'OK': { lat: 35.565342, lng: -96.928917 },
    'OR': { lat: 44.572021, lng: -122.070938 },
    'PA': { lat: 40.590752, lng: -77.209755 },
    'RI': { lat: 41.680893, lng: -71.511780 },
    'SC': { lat: 33.856892, lng: -80.945007 },
    'SD': { lat: 44.299782, lng: -99.438828 },
    'TN': { lat: 35.747845, lng: -86.692345 },
    'TX': { lat: 31.054487, lng: -97.563461 },
    'UT': { lat: 40.150032, lng: -111.862434 },
    'VT': { lat: 44.045876, lng: -72.710686 },
    'VA': { lat: 37.769337, lng: -78.169968 },
    'WA': { lat: 47.400902, lng: -121.490494 },
    'WV': { lat: 38.491226, lng: -80.954453 },
    'WI': { lat: 44.268543, lng: -89.616508 },
    'WY': { lat: 42.755966, lng: -107.302490 },
    'DC': { lat: 38.897438, lng: -77.026817 },
  };

  /**
   * Get coordinates for a location - uses GPS if available, otherwise state centroid
   */
  function getLocationCoordinates(location: Location): { lat: number; lng: number; isApproximate: boolean } | null {
    // Has precise GPS coordinates
    if (location.gps?.lat && location.gps?.lng) {
      return { lat: location.gps.lat, lng: location.gps.lng, isApproximate: false };
    }

    // Fallback to state centroid if we have a state
    const state = location.address?.state?.toUpperCase();
    if (state && STATE_CENTROIDS[state]) {
      return { ...STATE_CENTROIDS[state], isApproximate: true };
    }

    return null;
  }

  /**
   * Determine GPS confidence level based on location data
   * Per spec: verified > high > medium > low > none
   */
  function getGpsConfidence(location: Location, isApproximate: boolean = false): keyof typeof THEME.GPS_CONFIDENCE_COLORS {
    // State centroid fallback = none confidence (approximate)
    if (isApproximate) return 'none';

    if (!location.gps) return 'none';

    // Verified on map is highest confidence
    if (location.gps.verifiedOnMap) return 'verified';

    // High accuracy from device GPS
    if (location.gps.accuracy && location.gps.accuracy <= GPS_CONFIG.HIGH_ACCURACY_THRESHOLD_METERS) {
      return 'high';
    }

    // Medium accuracy
    if (location.gps.accuracy && location.gps.accuracy <= GPS_CONFIG.GPS_MISMATCH_THRESHOLD_METERS) {
      return 'medium';
    }

    // Low confidence if no accuracy data or high accuracy value
    return 'low';
  }

  /**
   * Create a colored circle marker icon based on GPS confidence
   */
  function createConfidenceIcon(L: any, confidence: keyof typeof THEME.GPS_CONFIDENCE_COLORS): any {
    const color = THEME.GPS_CONFIDENCE_COLORS[confidence];
    return L.divIcon({
      html: `<div class="confidence-marker" style="background-color: ${color};"></div>`,
      className: 'confidence-icon',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }

  interface Props {
    locations?: Location[];
    onLocationClick?: (location: Location) => void;
    onMapClick?: (lat: number, lng: number) => void;
    onMapRightClick?: (lat: number, lng: number) => void;
    // FIX 6.8: Enable heat map visualization
    showHeatMap?: boolean;
  }

  let { locations = [], onLocationClick, onMapClick, onMapRightClick, showHeatMap = false }: Props = $props();

  /**
   * Escape HTML to prevent XSS attacks
   */
  function escapeHtml(unsafe: string | null | undefined): string {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  let mapContainer: HTMLDivElement;
  let map: LeafletMap | null = null;
  let markersLayer: LayerGroup | null = null;
  // FIX 6.8: Heat map layer
  let heatLayer: any = null;
  let cluster: Supercluster | null = null;
  let lastLocationsLength = $state(0);

  /**
   * FIX 6.8: Simple canvas-based heat map implementation
   * Uses a custom Leaflet layer to render density visualization
   */
  function createHeatLayer(L: any, locations: Location[]): any {
    // Extract coordinates with weights (media count if available, else 1)
    const points = locations
      .map(loc => {
        const coords = getLocationCoordinates(loc);
        if (!coords) return null;
        return {
          lat: coords.lat,
          lng: coords.lng,
          // Weight could be based on media count or other metrics
          weight: 1,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    if (points.length === 0) return null;

    // Create a custom canvas layer for heat visualization
    const HeatLayer = L.Layer.extend({
      onAdd: function(map: any) {
        this._map = map;
        this._canvas = L.DomUtil.create('canvas', 'leaflet-heat-layer');
        const pane = map.getPane('overlayPane');
        pane.appendChild(this._canvas);
        map.on('moveend', this._update, this);
        map.on('zoomend', this._update, this);
        this._update();
      },

      onRemove: function(map: any) {
        L.DomUtil.remove(this._canvas);
        map.off('moveend', this._update, this);
        map.off('zoomend', this._update, this);
      },

      _update: function() {
        if (!this._map) return;

        const size = this._map.getSize();
        const bounds = this._map.getBounds();
        const zoom = this._map.getZoom();
        const topLeft = this._map.containerPointToLayerPoint([0, 0]);

        L.DomUtil.setPosition(this._canvas, topLeft);
        this._canvas.width = size.x;
        this._canvas.height = size.y;

        const ctx = this._canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, size.x, size.y);

        // Calculate radius based on zoom level
        const radius = Math.max(20, Math.min(80, zoom * 6));

        // Draw heat points
        points.forEach(point => {
          if (!bounds.contains([point.lat, point.lng])) return;

          const containerPoint = this._map.latLngToContainerPoint([point.lat, point.lng]);
          const x = containerPoint.x;
          const y = containerPoint.y;

          // Create radial gradient for each point
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
          gradient.addColorStop(0, 'rgba(255, 100, 100, 0.6)');
          gradient.addColorStop(0.4, 'rgba(255, 200, 100, 0.4)');
          gradient.addColorStop(0.7, 'rgba(100, 200, 255, 0.2)');
          gradient.addColorStop(1, 'rgba(0, 100, 255, 0)');

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();
        });
      },
    });

    return new HeatLayer();
  }

  onMount(async () => {
    const L = await import('leaflet');
    await import('leaflet/dist/leaflet.css');

    if (!map && mapContainer) {
      map = L.map(mapContainer, {
        center: [MAP_CONFIG.DEFAULT_CENTER.lat, MAP_CONFIG.DEFAULT_CENTER.lng],
        zoom: MAP_CONFIG.DEFAULT_ZOOM,
      });

      const baseLayers: { [key: string]: TileLayer } = {
        'Satellite': L.tileLayer(TILE_LAYERS.SATELLITE, {
          attribution: 'Tiles &copy; Esri',
          maxZoom: MAP_CONFIG.MAX_ZOOM,
        }),
        'Street': L.tileLayer(TILE_LAYERS.STREET, {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: MAP_CONFIG.MAX_ZOOM,
        }),
        'Topo': L.tileLayer(TILE_LAYERS.TOPO, {
          attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap',
          maxZoom: 17,
        }),
      };

      const overlayLayers: { [key: string]: TileLayer } = {
        'Labels': L.tileLayer(TILE_LAYERS.LABELS, {
          attribution: '&copy; CartoDB',
          maxZoom: MAP_CONFIG.MAX_ZOOM,
          subdomains: 'abcd',
        }),
      };

      baseLayers['Satellite'].addTo(map);

      L.control.layers(baseLayers, overlayLayers).addTo(map);

      markersLayer = L.layerGroup().addTo(map);

      map.on('click', (e) => {
        if (onMapClick) {
          onMapClick(e.latlng.lat, e.latlng.lng);
        }
      });

      map.on('contextmenu', (e) => {
        if (onMapRightClick) {
          onMapRightClick(e.latlng.lat, e.latlng.lng);
        }
      });

      map.on('zoomend moveend', () => {
        updateClusters(L);
      });

      initCluster();
      updateClusters(L);
    }
  });

  function initCluster() {
    cluster = new Supercluster({
      radius: MAP_CONFIG.CLUSTER_RADIUS,
      maxZoom: MAP_CONFIG.CLUSTER_MAX_ZOOM,
      minPoints: MAP_CONFIG.CLUSTER_MIN_POINTS,
    });

    // Include all locations that have coordinates (GPS or state centroid fallback)
    const points = locations
      .map(loc => {
        const coords = getLocationCoordinates(loc);
        if (!coords) return null;
        return {
          type: 'Feature' as const,
          properties: { location: loc, isApproximate: coords.isApproximate },
          geometry: {
            type: 'Point' as const,
            coordinates: [coords.lng, coords.lat],
          },
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    cluster.load(points);
  }

  function updateClusters(L: any) {
    if (!map || !markersLayer || !cluster) return;

    markersLayer.clearLayers();

    const bounds = map.getBounds();
    const bbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];
    const zoom = map.getZoom();

    const clusters = cluster.getClusters(bbox, Math.floor(zoom));

    clusters.forEach((feature: any) => {
      const [lng, lat] = feature.geometry.coordinates;

      if (feature.properties.cluster) {
        const count = feature.properties.point_count;
        const marker = L.marker([lat, lng], {
          icon: L.divIcon({
            html: `<div class="cluster-marker">${count}</div>`,
            className: 'cluster-icon',
            iconSize: [40, 40],
          }),
        });

        marker.on('click', () => {
          const expansionZoom = Math.min(
            cluster!.getClusterExpansionZoom(feature.properties.cluster_id),
            MAP_CONFIG.CLUSTER_EXPANSION_MAX_ZOOM
          );
          map!.setView([lat, lng], expansionZoom);
        });

        markersLayer.addLayer(marker);
      } else {
        const location = feature.properties.location;
        const isApproximate = feature.properties.isApproximate || false;
        const confidence = getGpsConfidence(location, isApproximate);
        const icon = createConfidenceIcon(L, confidence);
        const marker = L.marker([lat, lng], { icon });

        // Build confidence label - show "Approximate (State)" for state centroid fallback
        const confidenceLabel = isApproximate
          ? 'Approximate (State)'
          : String(confidence).charAt(0).toUpperCase() + String(confidence).slice(1) + ' GPS';

        marker.bindPopup(`
          <div>
            <strong>${escapeHtml(location.locnam)}</strong><br/>
            ${escapeHtml(location.type) || 'Unknown Type'}<br/>
            ${location.address?.city ? `${escapeHtml(location.address.city)}, ` : ''}${escapeHtml(location.address?.state) || ''}
            <br/><span style="color: ${THEME.GPS_CONFIDENCE_COLORS[confidence]};">● ${confidenceLabel}</span>
          </div>
        `);

        marker.on('click', () => {
          if (onLocationClick) {
            onLocationClick(location);
          }
        });

        markersLayer.addLayer(marker);
      }
    });

    if (locations.length > 0 && locations[0].gps && zoom === MAP_CONFIG.DEFAULT_ZOOM) {
      map.setView([locations[0].gps.lat, locations[0].gps.lng], MAP_CONFIG.DETAIL_ZOOM);
    }
  }

  $effect(() => {
    // Only reinitialize cluster if locations array length changed
    if (map && markersLayer && locations.length !== lastLocationsLength) {
      lastLocationsLength = locations.length;
      initCluster();
      import('leaflet').then((L) => updateClusters(L.default));
    }
  });

  // FIX 6.8: Toggle heat map layer based on showHeatMap prop
  $effect(() => {
    if (!map) return;

    import('leaflet').then((L) => {
      // Remove existing heat layer if any
      if (heatLayer) {
        map!.removeLayer(heatLayer);
        heatLayer = null;
      }

      // Add heat layer if enabled
      if (showHeatMap && locations.length > 0) {
        heatLayer = createHeatLayer(L.default, locations);
        if (heatLayer) {
          heatLayer.addTo(map);
        }
      }
    });
  });

  onDestroy(() => {
    if (map) {
      map.remove();
      map = null;
    }
  });
</script>

<div bind:this={mapContainer} class="w-full h-full"></div>

<style>
  :global(.leaflet-container) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
      'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
  }

  :global(.cluster-icon) {
    background: transparent;
    border: none;
  }

  :global(.cluster-marker) {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background-color: var(--color-accent, #b9975c);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 14px;
    border: 3px solid rgba(255, 255, 255, 0.8);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  :global(.confidence-icon) {
    background: transparent;
    border: none;
  }

  :global(.confidence-marker) {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }
</style>
