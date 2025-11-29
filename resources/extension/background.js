/**
 * background.js
 *
 * Extension service worker (background script) for AU Archive Clipper
 */

const API_BASE = 'http://localhost:47123';

// Check if AU Archive is running when extension loads
chrome.runtime.onInstalled.addListener(async () => {
  console.log('AU Archive Clipper installed');

  // Create context menu
  chrome.contextMenus.create({
    id: 'save-to-archive',
    title: 'Save to AU Archive',
    contexts: ['page', 'link'],
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-to-archive') {
    const url = info.linkUrl || info.pageUrl;

    try {
      const res = await fetch(`${API_BASE}/api/bookmark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url,
          title: tab?.title || url,
          locid: null,
        }),
      });

      const data = await res.json();

      if (data.success && tab?.id) {
        chrome.action.setBadgeText({ text: '!', tabId: tab.id });
        chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
        setTimeout(() => {
          chrome.action.setBadgeText({ text: '', tabId: tab.id });
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to save bookmark:', error);
    }
  }
});
