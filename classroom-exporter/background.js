// background.js (Manifest V3 service worker)

// Fires once when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log("Classroom Exporter extension installed.");
});

// Optional: listen for messages if you ever want background logic.
// For now, popup and content talk to each other directly, so nothing here.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // placeholder — not used in this MVP
  if (msg.action === "ping") {
    sendResponse({ ok: true });
  }
});
