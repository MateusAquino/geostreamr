// Background service worker for GeoStreamer extension

let popupWindowId = null;

// Handle extension icon click
chrome.action.onClicked.addListener(() => {
  const extensionPageUrl = chrome.runtime.getURL("popup.html");

  chrome.windows.create(
    {
      url: extensionPageUrl,
      type: "popup",
      focused: true,
      width: 550,
      height: 1100,
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

/** Patch AudioContext for "Waiting for Opponent" audio cues when queueing */

chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
  if (tab.url && GEO_TAB_URL_REGEX.test(tab.url)) {
    chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        if (!window.__GEO_STREAMR) {
          const API = (window.__GEO_STREAMR = window.__GEO_STREAMR || {});
          API._tracked = API._tracked || {};
          // capture originals immediately
          API._tracked.origConnect =
            API._tracked.origConnect || AudioNode.prototype.connect;
          API._tracked.origDisconnect =
            API._tracked.origDisconnect || AudioNode.prototype.disconnect;
          API._tracked.masterGains = API._tracked.masterGains || new WeakMap();
          API._tracked.contexts = API._tracked.contexts || new Set();
          // when true -> future connects bypass masterGain and go direct to destination
          API._tracked.bypassNewConnections = false;

          function ensureMasterGain(ctx) {
            if (!ctx) return null;
            if (API._tracked.masterGains.has(ctx))
              return API._tracked.masterGains.get(ctx);
            try {
              const g = ctx.createGain();
              g.gain.value = 1; // default audible
              // connect master gain to destination using original connect to avoid recursion
              try {
                API._tracked.origConnect.call(g, ctx.destination);
              } catch (_) {
                try {
                  g.connect(ctx.destination);
                } catch (_) {}
              }
              API._tracked.masterGains.set(ctx, g);
              return g;
            } catch (e) {
              return null;
            }
          }

          function registerContext(ctx) {
            if (!ctx) return;
            API._tracked.contexts.add(ctx);
            ensureMasterGain(ctx);
          }

          // Patch connect once (must run early)
          if (!API._tracked._patchedConnect) {
            const origConnect = API._tracked.origConnect;
            AudioNode.prototype.connect = function (...args) {
              try {
                const target = args[0];
                // only modify connects when the target is the raw context.destination
                if (
                  target &&
                  target.context &&
                  target === target.context.destination
                ) {
                  const ctx = target.context || this.context;
                  registerContext(ctx);
                  // If bypass flag is set, connect directly to destination (so new audio plays normally)
                  if (API._tracked.bypassNewConnections) {
                    return origConnect.call(this, target, ...args.slice(1));
                  }
                  // Otherwise route through the master gain
                  const mg = ensureMasterGain(ctx);
                  if (mg) return origConnect.call(this, mg, ...args.slice(1));
                  return origConnect.call(this, target, ...args.slice(1));
                }
              } catch (e) {
                /* swallow */
              }
              return origConnect.apply(this, args);
            };
            API._tracked._patchedConnect = true;
          }

          // discover contexts that may be created before handlers run (best-effort)
          try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) {
              for (const k in window) {
                try {
                  const v = window[k];
                  if (v instanceof AC) registerContext(v);
                  else if (v && typeof v === "object") {
                    for (const kk in v) {
                      try {
                        if (v[kk] instanceof AC) registerContext(v[kk]);
                      } catch (_) {}
                    }
                  }
                } catch (_) {}
              }
            }
          } catch (_) {}

          // Public API: mute current audio only, let new audio be normal
          API.muteCurrent = function () {
            try {
              // Ensure master gains exist for all seen contexts
              API._tracked.contexts.forEach((ctx) => ensureMasterGain(ctx));
              // Mute masterGains so existing nodes that are already routed through them go silent
              API._tracked.contexts.forEach((ctx) => {
                try {
                  const mg = API._tracked.masterGains.get(ctx);
                  if (mg) mg.gain.value = 0;
                } catch (_) {}
              });
              API._tracked.bypassNewConnections = true;
              return { ok: true };
            } catch (e) {
              return { error: String(e) };
            }
          };

          API.restoreCurrent = function () {
            try {
              // Restore masterGains so previously-muted routed nodes come back
              API._tracked.contexts.forEach((ctx) => {
                try {
                  const mg = API._tracked.masterGains.get(ctx);
                  if (mg) mg.gain.value = 1;
                } catch (_) {}
              });
              // Stop bypassing new connections if you want new nodes to also route through masterGain
              API._tracked.bypassNewConnections = false;
              return { ok: true };
            } catch (e) {
              return { error: String(e) };
            }
          };
        }
      },
    });
    return true;
  }
});

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
