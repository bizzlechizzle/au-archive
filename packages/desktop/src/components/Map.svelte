<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Map as LeafletMap, TileLayer, LayerGroup } from 'leaflet';
  import type { Location } from '@au-archive/core';
  import Supercluster from 'supercluster';

  interface Props {
    locations?: Location[];
    onLocationClick?: (location: Location) => void;
    onMapClick?: (lat: number, lng: number) => void;
  }

  let { locations = [], onLocationClick, onMapClick }: Props = $props();

  let mapContainer: HTMLDivElement;
  let map: LeafletMap | null = null;
  let markersLayer: LayerGroup | null = null;
  let cluster: Supercluster | null = null;

  onMount(async () => {
    const L = await import('leaflet');
    await import('leaflet/dist/leaflet.css');

    if (!map && mapContainer) {
      map = L.map(mapContainer, {
        center: [40.7128, -74.0060],
        zoom: 6,
      });

      const baseLayers: { [key: string]: TileLayer } = {
        'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          attribution: 'Tiles &copy; Esri',
          maxZoom: 19,
        }),
        'Street': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }),
        'Topo': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
          attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap',
          maxZoom: 17,
        }),
      };

      const overlayLayers: { [key: string]: TileLayer } = {
        'Labels': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; CartoDB',
          maxZoom: 19,
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

      map.on('zoomend moveend', () => {
        updateClusters(L);
      });

      initCluster();
      updateClusters(L);
    }
  });

  function initCluster() {
    cluster = new Supercluster({
      radius: 60,
      maxZoom: 16,
    });

    const points = locations
      .filter(loc => loc.gps)
      .map(loc => ({
        type: 'Feature' as const,
        properties: { location: loc },
        geometry: {
          type: 'Point' as const,
          coordinates: [loc.gps!.lng, loc.gps!.lat],
        },
      }));

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
            17
          );
          map!.setView([lat, lng], expansionZoom);
        });

        markersLayer.addLayer(marker);
      } else {
        const location = feature.properties.location;
        const marker = L.marker([lat, lng]);

        marker.bindPopup(`
          <div>
            <strong>${location.locnam}</strong><br/>
            ${location.type || 'Unknown Type'}<br/>
            ${location.address?.city ? `${location.address.city}, ` : ''}${location.address?.state || ''}
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

    if (locations.length > 0 && locations[0].gps && zoom === 6) {
      map.setView([locations[0].gps.lat, locations[0].gps.lng], 10);
    }
  }

  $effect(() => {
    if (map && markersLayer && locations) {
      initCluster();
      import('leaflet').then((L) => updateClusters(L.default));
    }
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
    background-color: #b9975c;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 14px;
    border: 3px solid rgba(255, 255, 255, 0.8);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }
</style>
