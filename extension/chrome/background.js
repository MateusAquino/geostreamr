// Background service worker for GeoStreamer extension

let popupWindowId = null;

// Handle extension icon click
chrome.action.onClicked.addListener(async () => {
  const extensionPageUrl = chrome.runtime.getURL("popup.html");

  // Close existing popup window if it exists
  if (popupWindowId !== null) {
    try {
      await chrome.windows.remove(popupWindowId);
    } catch (error) {
      // Window might already be closed, ignore error
      console.debug("Failed to close existing popup:", error);
    }
    popupWindowId = null;
  }

  chrome.windows.create(
    {
      url: extensionPageUrl,
      type: "popup",
      focused: true,
      width: 550,
      height: 1150,
      top: 100,
      left: 100,
    },
    (windowInfo) => {
      if (chrome.runtime.lastError) {
        console.warn("Popup creation error:", chrome.runtime.lastError);
        return;
      }

      popupWindowId = windowInfo?.id ?? null;
    }
  );
});

// Clean up when popup window is closed
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === popupWindowId) {
    popupWindowId = null;
  }
});

const GEO_TAB_URL_MATCH = "*://*.geoguessr.com/*";
const GEO_TAB_URL_REGEX = /^https:\/\/(www\.)?geoguessr\.com\/.*/;

async function reloadMatchingTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: GEO_TAB_URL_MATCH });

    if (!tabs || tabs.length === 0) {
      console.debug("No matching tabs to reload.");
      return;
    }

    console.debug(`Reloading ${tabs.length} matching tab(s).`);
    for (const t of tabs) {
      if (!t.id) continue;
      try {
        await chrome.tabs.reload(t.id);
        console.debug("Reloaded tab", t.id, t.url);
      } catch (err) {
        console.warn("Failed to reload tab", t.id, err);
      }
    }
  } catch (err) {
    console.error("reloadMatchingTabs error:", err);
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  console.debug("onInstalled ->", details.reason);
  // Only reload on install/update, not on Chrome startup
  if (details.reason === "install" || details.reason === "update") {
    console.debug("Reloading tabs for extension install/update");
    reloadMatchingTabs();
  }
});

/**
 * Audio bridge is now injected via content script at document_start.
 * This listener is kept as a backup for already-loaded tabs when extension is installed/updated.
 * Note: The audio-bridge.js content script handles all new page loads automatically.
 */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (
    msg?.type === "geo-streamr/kill-audio-loop" ||
    msg?.type === "geo-streamr/restore-audio"
  ) {
    chrome.scripting.executeScript(
      {
        target: { tabId: sender.tab.id },
        world: "MAIN",
        args: [msg],
        func: (msg) => {
          if (msg.type === "geo-streamr/kill-audio-loop") {
            if (window.__GEO_STREAMR.muteInterval)
              clearInterval(window.__GEO_STREAMR.muteInterval);
            window.__GEO_STREAMR.muteCurrent();
            window.__GEO_STREAMR.muteInterval = setInterval(() => {
              if (
                document.querySelector("[class^=center-content_dotsAnimation]")
              )
                window.__GEO_STREAMR.muteCurrent();
            }, 20);
            return true;
          }
          if (msg.type === "geo-streamr/restore-audio") {
            if (window.__GEO_STREAMR.muteInterval)
              clearInterval(window.__GEO_STREAMR.muteInterval);
            return window.__GEO_STREAMR.restoreCurrent();
          }
        },
      },
      (results) => {
        sendResponse({ ok: true, results });
      }
    );
    return true;
  }
});
