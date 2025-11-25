<script lang="ts">
  /**
   * LocationHeader - Location name and edit button
   * Per LILBITS: ~40 lines, single responsibility
   * DECISION-014: Removed favorite button (now in LocationInfo)
   */
  import { router } from '../../stores/router';
  import type { Location } from '@au-archive/core';

  interface Props {
    location: Location;
    isEditing: boolean;
    onEditToggle: () => void;
  }

  let { location, isEditing, onEditToggle }: Props = $props();
</script>

<div class="mb-6">
  <button
    onclick={() => router.navigate('/locations')}
    class="text-sm text-accent hover:underline mb-2"
  >
    &larr; Back to Locations
  </button>
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <h1 class="text-3xl font-bold text-foreground drop-shadow-sm">{location.locnam}</h1>
    </div>
    <button
      onclick={onEditToggle}
      class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition"
    >
      {isEditing ? 'Cancel Edit' : 'Edit'}
    </button>
  </div>
  {#if location.akanam}
    <p class="text-gray-500 mt-1">Also Known As: {location.akanam}</p>
  {/if}
</div>
