// background service worker placeholder for extension
// Currently no background tasks required; reserved for future API calls
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Open extension UI in a new browser tab when the action icon is clicked
if (typeof chrome !== 'undefined' && chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(async () => {
    const serverUrl = 'http://localhost:4173/';
    const fallback = chrome.runtime.getURL('index.html');

    // try to reach local UI server with short timeout
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);
      const resp = await fetch(serverUrl, { method: 'GET', signal: controller.signal });
      clearTimeout(timeout);
      if (resp && resp.ok) {
        chrome.tabs.create({ url: serverUrl });
        return;
      }
    } catch (err) {
      // ignore and fall back to packaged UI
    }

    chrome.tabs.create({ url: fallback });
  });
}
