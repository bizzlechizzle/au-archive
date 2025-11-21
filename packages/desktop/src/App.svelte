<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from './stores/router';
  import Layout from './components/Layout.svelte';
  import Dashboard from './pages/Dashboard.svelte';
  import Locations from './pages/Locations.svelte';
  import Atlas from './pages/Atlas.svelte';
  import Imports from './pages/Imports.svelte';
  import Settings from './pages/Settings.svelte';
  import Search from './pages/Search.svelte';
  import LocationDetail from './pages/LocationDetail.svelte';

  let currentRoute = $state({ path: '/dashboard', params: {} });

  onMount(() => {
    router.init();
  });

  $effect(() => {
    const unsubscribe = router.subscribe((route) => {
      currentRoute = route;
    });
    return () => unsubscribe();
  });
</script>

<Layout>
  {#snippet children()}
    {#if currentRoute.path === '/dashboard'}
      <Dashboard />
    {:else if currentRoute.path === '/locations'}
      <Locations />
    {:else if currentRoute.path === '/atlas'}
      <Atlas />
    {:else if currentRoute.path === '/imports'}
      <Imports />
    {:else if currentRoute.path === '/search'}
      <Search />
    {:else if currentRoute.path === '/settings'}
      <Settings />
    {:else if currentRoute.path === '/location/:id'}
      <LocationDetail locationId={currentRoute.params?.id || ''} />
    {:else}
      <Dashboard />
    {/if}
  {/snippet}
</Layout>
