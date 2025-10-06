// Background script for GeoStreamr Firefox extension

let popupWindowId = null;
let popupTabId = null;

const POPUP_DIMENSIONS = {
  width: 550,
  height: 1150,
  top: 100,
  left: 100,
};

const AUDIO_BRIDGE_URL = browser.runtime.getURL("audio-bridge.js");
const AUDIO_BRIDGE_ELEMENT_ID = "geo-streamr-audio-bridge";

const actionApi = browser.browserAction ?? browser.action;

async function focusExistingPopupWindow() {
  if (popupWindowId === null) {
    return false;
  }

  try {
    await browser.windows.update(popupWindowId, { focused: true });
    if (popupTabId !== null) {
      try {
        await browser.tabs.update(popupTabId, { active: true });
      } catch (error) {
        console.debug("GeoStreamr popup tab focus failed:", error);
      }
    }
    return true;
  } catch (_err) {
    popupWindowId = null;
    popupTabId = null;
    return false;
  }
}

async function ensurePopupTab(windowInfo, extensionPageUrl) {
  const ensureUrl = async (tabId) => {
    if (!tabId) return null;
    try {
      const tab = await browser.tabs.get(tabId);
      if (!tab?.url || tab.url === "about:blank") {
        await browser.tabs.update(tabId, {
          url: extensionPageUrl,
          active: true,
        });
      }
      return tabId;
    } catch (error) {
      console.debug("GeoStreamr popup tab retrieval failed:", error);
      return null;
    }
  };

  const candidateTab = windowInfo?.tabs?.find((tab) => tab?.id);
  if (candidateTab?.id) {
    const tabId = await ensureUrl(candidateTab.id);
    if (tabId) return tabId;
  }

  if (windowInfo?.id) {
    try {
      const tabs = await browser.tabs.query({ windowId: windowInfo.id });
      const existing = tabs.find((tab) => tab?.id);
      if (existing?.id) {
        const tabId = await ensureUrl(existing.id);
        if (tabId) return tabId;
      }
    } catch (error) {
      console.debug("GeoStreamr popup tab query failed:", error);
    }
  }

  if (!windowInfo?.id) {
    return null;
  }

  try {
    const created = await browser.tabs.create({
      windowId: windowInfo.id,
      url: extensionPageUrl,
      active: true,
    });
    return created?.id ?? null;
  } catch (error) {
    console.warn("GeoStreamr popup tab creation failed:", error);
    return null;
  }
}

actionApi.onClicked.addListener(async () => {
  const extensionPageUrl = browser.runtime.getURL("popup.html");

  if (await focusExistingPopupWindow()) {
    return;
  }

  try {
    const windowInfo = await browser.windows.create({
      url: extensionPageUrl,
      type: "popup",
      focused: true,
      allowScriptsToClose: true,
      ...POPUP_DIMENSIONS,
    });

    popupWindowId = windowInfo?.id ?? null;
    popupTabId = await ensurePopupTab(windowInfo, extensionPageUrl);
  } catch (error) {
    console.warn("Popup creation error:", error);
  }
});

browser.windows.onRemoved.addListener((windowId) => {
  if (windowId === popupWindowId) {
    popupWindowId = null;
    popupTabId = null;
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  if (tabId === popupTabId) {
    popupTabId = null;
    popupWindowId = null;
  }
});

const GEO_TAB_URL_MATCH = "*://*.geoguessr.com/*";
const GEO_TAB_URL_REGEX = /^https:\/\/(www\.)?geoguessr\.com\/.*/;

async function injectAudioBridgeIntoTab(tabId) {
  try {
    const [result] = await browser.tabs.executeScript(tabId, {
      code: `
        (function (scriptUrl, elementId) {
          try {
            const doc = document;
            const root = doc.documentElement;
            const DATA_KEY = "geoStreamrAudioBridge";
            if (root && root.dataset && root.dataset[DATA_KEY] === "ready") {
              try {
                window.dispatchEvent(new CustomEvent("geo-streamr:audio-bootstrap"));
              } catch (dispatchError) {
                console.warn("GeoStreamr audio bootstrap dispatch failed:", dispatchError);
              }
              return { ok: true, already: true };
            }

            if (doc.getElementById(elementId)) {
              return { ok: true, pending: true };
            }

            const script = doc.createElement("script");
            script.id = elementId;
            script.type = "text/javascript";
            script.src = scriptUrl;
            script.dataset.geoStreamrAudio = "bridge";
            script.addEventListener("load", () => {
              try {
                window.dispatchEvent(new CustomEvent("geo-streamr:audio-bootstrap"));
              } catch (dispatchError) {
                console.warn("GeoStreamr audio bootstrap dispatch failed:", dispatchError);
              }
              script.remove();
            });
            script.addEventListener("error", (error) => {
              console.warn("GeoStreamr audio bridge failed to load:", error);
            });
            (doc.head || root || doc.body || doc).appendChild(script);
            return { ok: true, injected: true };
          } catch (error) {
            console.warn("GeoStreamr audio bridge injection error:", error);
            return { ok: false, error: String(error) };
          }
        })(${JSON.stringify(AUDIO_BRIDGE_URL)}, ${JSON.stringify(
        AUDIO_BRIDGE_ELEMENT_ID
      )});
      `,
      runAt: "document_start",
    });
    return result;
  } catch (error) {
    if (error && /Missing host permission/i.test(String(error))) {
      console.warn("GeoStreamr audio bridge blocked: missing host permission");
    } else {
      console.warn("Failed to inject audio bridge:", error);
    }
    return { ok: false, error: String(error) };
  }
}

async function dispatchAudioControl(tabId, message) {
  const payloadLiteral = JSON.stringify(message || {});
  try {
    const [result] = await browser.tabs.executeScript(tabId, {
      code: `
        (function (payload) {
          try {
            const pageWindow = window.wrappedJSObject || window;
            const clone = typeof cloneInto === "function" ? cloneInto : null;
            const eventDetail = clone ? clone(payload, pageWindow) : payload;
            const options = new pageWindow.Object();
            options.detail = eventDetail;
            const CustomEvt = pageWindow.CustomEvent || CustomEvent;
            const event = new CustomEvt("geo-streamr:audio-control", options);
            pageWindow.dispatchEvent(event);
            return { ok: true };
          } catch (error) {
            console.warn("GeoStreamr audio control dispatch failed:", error);
            return { ok: false, error: String(error) };
          }
        })(${payloadLiteral});
      `,
    });
    return result;
  } catch (error) {
    console.warn("GeoStreamr audio control execution failed:", error);
    return { ok: false, error: String(error) };
  }
}

async function reloadMatchingTabs() {
  try {
    const tabs = await browser.tabs.query({ url: GEO_TAB_URL_MATCH });

    if (!tabs || tabs.length === 0) {
      console.debug("No matching tabs to reload.");
      return;
    }

    console.debug(`Reloading ${tabs.length} matching tab(s).`);
    for (const t of tabs) {
      if (!t.id) continue;
      try {
        await browser.tabs.reload(t.id);
        console.debug("Reloaded tab", t.id, t.url);
      } catch (err) {
        console.warn("Failed to reload tab", t.id, err);
      }
    }
  } catch (err) {
    console.error("reloadMatchingTabs error:", err);
  }
}

browser.runtime.onInstalled.addListener((details) => {
  console.debug("onInstalled ->", details.reason);
  if (details.reason === "install" || details.reason === "update") {
    console.debug("Reloading tabs for extension install/update");
    reloadMatchingTabs();
  }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "loading" &&
    tab.url &&
    GEO_TAB_URL_REGEX.test(tab.url)
  ) {
    injectAudioBridgeIntoTab(tabId);
  }
});

browser.runtime.onMessage.addListener((msg, sender) => {
  if (
    msg?.type === "geo-streamr/kill-audio-loop" ||
    msg?.type === "geo-streamr/restore-audio"
  ) {
    if (!sender.tab?.id) {
      return Promise.resolve({ ok: false, reason: "missing-tab" });
    }
    return injectAudioBridgeIntoTab(sender.tab.id)
      .then(() => dispatchAudioControl(sender.tab.id, msg))
      .then((results) => ({ ok: true, results }))
      .catch((error) => ({ ok: false, error: String(error) }));
  }

  return undefined;
});
