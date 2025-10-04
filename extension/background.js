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

async function reloadMatchingTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: GEO_TAB_URL_MATCH });

    if (!tabs || tabs.length === 0) {
      console.log("No matching tabs to reload.");
      return;
    }

    console.log(`Reloading ${tabs.length} matching tab(s).`);
    for (const t of tabs) {
      if (!t.id) continue;
      try {
        await chrome.tabs.reload(t.id);
        console.log("Reloaded tab", t.id, t.url);
      } catch (err) {
        console.warn("Failed to reload tab", t.id, err);
      }
    }
  } catch (err) {
    console.error("reloadMatchingTabs error:", err);
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  console.log("onInstalled ->", details.reason);
  // Only reload on install/update, not on Chrome startup
  if (details.reason === "install" || details.reason === "update") {
    console.log("Reloading tabs for extension install/update");
    reloadMatchingTabs();
  }
});

/** Patch AudioContext for "Waiting for Opponent" audio cues when queueing */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "geo-streamr/kill-audio") {
    chrome.scripting.executeScript(
      {
        target: { tabId: sender.tab.id },
        world: "MAIN",
        func: () => {
          try {
            function setupAudioMonkey() {
              const AC = window.AudioContext || window.webkitAudioContext;
              const API = window.__GEO_STREAMR || {};

              // Add tracking store if absent
              API._tracked = API._tracked || {
                bufferSources: new Set(),
                oscillators: new Set(),
                contexts: new Set(),
                masterGainFor: new WeakMap(),
              };

              // helper: ensure a master gain for a context (create if missing)
              function ensureMasterGain(ctx) {
                if (!ctx) return null;
                const mg = API._tracked.masterGainFor.get(ctx);
                if (mg) return mg;
                try {
                  const g = ctx.createGain();
                  g.gain.value = 1;
                  g.connect(ctx.destination);
                  API._tracked.masterGainFor.set(ctx, g);
                  API._tracked.contexts.add(ctx);
                  return g;
                } catch (e) {
                  return null;
                }
              }

              // Patch/createBufferSource so we keep references to nodes created after injection
              try {
                if (
                  AC &&
                  AC.prototype &&
                  !AC.prototype.__geostreamr_patched_createBufferSource
                ) {
                  const proto = AC.prototype;
                  const origCreateBufferSource = proto.createBufferSource;
                  proto.createBufferSource = function (...a) {
                    const node = origCreateBufferSource.apply(this, a);
                    try {
                      API._tracked.bufferSources.add(node);
                      API._tracked.contexts.add(this);

                      // wrap stop to auto-remove from set
                      if (node.stop) {
                        const origStop = node.stop;
                        node.stop = function (...sArgs) {
                          try {
                            API._tracked.bufferSources.delete(node);
                          } catch (_) {}
                          return origStop.apply(this, sArgs);
                        };
                      }

                      // make it easy to disconnect it if needed
                      const origDisconnect = node.disconnect;
                      node.disconnect = function (...dArgs) {
                        try {
                          API._tracked.bufferSources.delete(node);
                        } catch (_) {}
                        return origDisconnect
                          ? origDisconnect.apply(this, dArgs)
                          : undefined;
                      };
                    } catch (e) {}
                    return node;
                  };
                  proto.createBufferSource.__geostreamr_patched = true;
                }
              } catch (e) {
                console.warn("failed to patch createBufferSource", e);
              }

              // Track oscillators when they connect (many pages create them and call connect/destination)
              try {
                if (
                  window.OscillatorNode &&
                  !OscillatorNode.prototype.__geostreamr_tracked_connect
                ) {
                  const origOscConnect = OscillatorNode.prototype.connect;
                  OscillatorNode.prototype.connect = function (...a) {
                    try {
                      API._tracked.oscillators.add(this);
                      if (this.context) API._tracked.contexts.add(this.context);
                    } catch (e) {}
                    return origOscConnect.apply(this, a);
                  };
                  OscillatorNode.prototype.connect.__geostreamr_tracked_connect = true;
                  // wrap stop similarly (if start was called)
                  if (OscillatorNode.prototype.stop) {
                    const origOscStop = OscillatorNode.prototype.stop;
                    OscillatorNode.prototype.stop = function (...s) {
                      try {
                        API._tracked.oscillators.delete(this);
                      } catch (_) {}
                      return origOscStop.apply(this, s);
                    };
                  }
                }
              } catch (e) {
                console.warn("failed to patch OscillatorNode.connect/start", e);
              }

              // Try to discover contexts reachable from window *now* (best-effort)
              try {
                if (AC) {
                  for (const k in window) {
                    try {
                      const v = window[k];
                      if (v instanceof AC) API._tracked.contexts.add(v);
                      else if (v && typeof v === "object") {
                        for (const kk in v) {
                          try {
                            if (v[kk] instanceof AC)
                              API._tracked.contexts.add(v[kk]);
                          } catch (_) {}
                        }
                      }
                    } catch (_) {}
                  }
                }
              } catch (e) {}

              API.killAudio = async () => {
                try {
                  API._tracked.contexts.forEach((ctx) => {
                    try {
                      const mg = ensureMasterGain(ctx);
                      if (mg) {
                        // immediate hard mute
                        try {
                          mg.gain.value = 0;
                        } catch (_) {}
                      }
                      if (ctx && typeof ctx.suspend === "function")
                        ctx.suspend().catch(() => {});
                    } catch (_) {}
                  });

                  return { ok: true };
                } catch (err) {
                  return { error: String(err) };
                }
              };

              // re-expose protected API (attempt to make non-configurable)
              try {
                Object.defineProperty(window, "__GEO_STREAMR", {
                  value: API,
                  writable: false,
                  configurable: false,
                  enumerable: false,
                });
              } catch (e) {
                window.__GEO_STREAMR = API;
              }
            }

            if (!window.__GEO_STREAMR) setupAudioMonkey();

            if (
              document.querySelector("[class^=center-content_dotsAnimation]")
            ) {
              return window.__GEO_STREAMR.killAudio();
            }
          } catch (e) {
            console.error(e);
            return { error: String(e) };
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
