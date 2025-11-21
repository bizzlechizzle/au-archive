<script lang="ts">
  import { onMount } from 'svelte';

  let browserUrl = $state('https://www.google.com');
  let currentUrl = $state('');
  let webviewRef: HTMLWebViewElement | null = null;
  let searchQuery = $state('');
  let showBookmarks = $state(false);

  let recentPages = $state<Array<{ url: string; title: string; date: string }>>([]);
  let bookmarks = $state<Array<{ url: string; title: string; locid?: string }>>([]);

  function loadUrl() {
    if (webviewRef) {
      let url = browserUrl;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      webviewRef.src = url;
    }
  }

  function goBack() {
    webviewRef?.goBack();
  }

  function goForward() {
    webviewRef?.goForward();
  }

  function reload() {
    webviewRef?.reload();
  }

  async function saveBookmark() {
    if (webviewRef) {
      const url = webviewRef.getURL();
      const title = webviewRef.getTitle();
      bookmarks = [...bookmarks, { url, title, date: new Date().toISOString() }];
    }
  }

  function openBookmark(url: string) {
    browserUrl = url;
    loadUrl();
  }

  onMount(() => {
    webviewRef = document.querySelector('webview');
    if (webviewRef) {
      webviewRef.addEventListener('did-navigate', (e: any) => {
        currentUrl = e.url;
        browserUrl = e.url;
      });

      webviewRef.addEventListener('page-title-updated', (e: any) => {
        const url = webviewRef?.getURL() || '';
        const title = e.title;
        recentPages = [{ url, title, date: new Date().toISOString() }, ...recentPages.slice(0, 4)];
      });
    }
  });
</script>

<div class="h-full flex">
  <div class="flex-1 flex flex-col">
    <div class="bg-white border-b border-gray-200 p-3 flex items-center gap-2">
      <button
        onclick={goBack}
        class="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
      >
        &larr;
      </button>
      <button
        onclick={goForward}
        class="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
      >
        &rarr;
      </button>
      <button
        onclick={reload}
        class="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
      >
        Reload
      </button>

      <input
        type="text"
        bind:value={browserUrl}
        onkeydown={(e) => e.key === 'Enter' && loadUrl()}
        placeholder="Enter URL..."
        class="flex-1 px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
      />

      <button
        onclick={loadUrl}
        class="px-4 py-1 bg-accent text-white rounded hover:opacity-90"
      >
        Go
      </button>

      <button
        onclick={saveBookmark}
        class="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
      >
        Save
      </button>
    </div>

    <div class="flex-1 relative">
      <webview
        src={browserUrl}
        class="absolute inset-0 w-full h-full"
        nodeintegration="false"
        disablewebsecurity="false"
      ></webview>
    </div>
  </div>

  <aside class="w-80 bg-gray-50 border-l border-gray-200 overflow-y-auto">
    <div class="p-4">
      <h2 class="text-lg font-semibold mb-4 text-foreground">Research Tools</h2>

      <div class="mb-6">
        <h3 class="text-sm font-medium text-gray-700 mb-2">Search Locations</h3>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search database..."
          class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <div class="mb-6">
        <h3 class="text-sm font-medium text-gray-700 mb-2">Recent Pages</h3>
        {#if recentPages.length > 0}
          <ul class="space-y-2">
            {#each recentPages.slice(0, 5) as page}
              <li>
                <button
                  onclick={() => openBookmark(page.url)}
                  class="w-full text-left px-3 py-2 text-sm bg-white rounded hover:bg-gray-100 truncate"
                >
                  {page.title || page.url}
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-sm text-gray-400">No recent pages</p>
        {/if}
      </div>

      <div class="mb-6">
        <h3 class="text-sm font-medium text-gray-700 mb-2">Saved Bookmarks</h3>
        <button
          onclick={() => showBookmarks = !showBookmarks}
          class="w-full px-3 py-2 text-sm bg-white rounded hover:bg-gray-100 text-left"
        >
          {showBookmarks ? 'Hide' : 'Show'} Bookmarks ({bookmarks.length})
        </button>

        {#if showBookmarks && bookmarks.length > 0}
          <ul class="mt-2 space-y-2">
            {#each bookmarks as bookmark}
              <li>
                <button
                  onclick={() => openBookmark(bookmark.url)}
                  class="w-full text-left px-3 py-2 text-sm bg-white rounded hover:bg-gray-100 truncate"
                >
                  {bookmark.title || bookmark.url}
                </button>
              </li>
            {/each}
          </ul>
        {:else if showBookmarks}
          <p class="text-sm text-gray-400 mt-2">No bookmarks saved</p>
        {/if}
      </div>

      <div class="mb-6">
        <h3 class="text-sm font-medium text-gray-700 mb-2">Quick Actions</h3>
        <div class="space-y-2">
          <button
            onclick={() => {
              browserUrl = 'https://maps.google.com';
              loadUrl();
            }}
            class="w-full px-3 py-2 text-sm bg-white rounded hover:bg-gray-100 text-left"
          >
            Google Maps
          </button>
          <button
            onclick={() => {
              browserUrl = 'https://www.historicaerials.com';
              loadUrl();
            }}
            class="w-full px-3 py-2 text-sm bg-white rounded hover:bg-gray-100 text-left"
          >
            Historic Aerials
          </button>
          <button
            onclick={() => {
              browserUrl = 'https://www.google.com/search?q=';
              loadUrl();
            }}
            class="w-full px-3 py-2 text-sm bg-white rounded hover:bg-gray-100 text-left"
          >
            Google Search
          </button>
        </div>
      </div>
    </div>
  </aside>
</div>

<style>
  webview {
    display: flex;
    flex: 1;
  }
</style>
