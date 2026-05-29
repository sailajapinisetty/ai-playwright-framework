// background service worker placeholder for extension
// Currently no background tasks required; reserved for future API calls
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Open extension UI in a new browser tab when the action icon is clicked
if (typeof chrome !== 'undefined' && chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(() => {
    const url = chrome.runtime.getURL('popup.html');
    // open as a regular tab in the current window
    chrome.tabs.create({ url });
  });
}
