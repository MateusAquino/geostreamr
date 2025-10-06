const KV_BASE_URL = "https://geostreamer.mateusaqb.workers.dev";
const GEO_TAB_URL_MATCH = "*://*.geoguessr.com/*";
const QR_BASE_URL = "https://mateusaquino.github.io/geostreamr";
const STORAGE_KEYS = {
  hideMode: "geo-streamr-hide-mode",
};
const MIRROR_NODE_KEY_ATTR = "data-geo-streamr-key";
const MIRROR_MESSAGE_TYPES = ["geo-streamr/mirror-update"];
const MIRROR_EVENT_TYPES = ["click", "pointerdown", "pointerup"];
const PHONE_PAIRING_TIMEOUT_MS = 100000;
const HANDSHAKE_RETRY_DELAY_MS = 1500;

const ui = {};
const state = {
  connectedTabId: null,
  popupActive: false,
  peerConnection: null,
  dataChannel: null,
  sessionCode: null,
  manualDisconnect: false,
  pollingInterval: null,
  countdownInterval: null,
  expirationTime: null,
  sensitiveMode: false,
  mirrorAvailable: false,
  primaryTargetKey: null,
  primaryPathKeys: [],
  phoneStatusTone: "info",
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
  reconnectInProgress: false,
  successfulHandshake: true,
};

document.addEventListener("DOMContentLoaded", init);
browser.runtime.onMessage.addListener(handleRuntimeMessage);
browser.tabs.onRemoved.addListener(handleTabRemoved);

browser.tabs.onUpdated.addListener(() => {
  if (!state.successfulHandshake) connectToGeoGuessrTab();
});

async function init() {
  cacheElements();
  attachEventHandlers();
  initializeUiDefaults();
  await loadSensitivePreference();
  await connectToGeoGuessrTab();
  window.addEventListener("beforeunload", handlePopupUnload, { once: true });
}

function cacheElements() {
  ui.statusText = document.getElementById("status-text");
  ui.statusDetail = document.getElementById("status-detail");
  ui.sensitiveToggle = document.getElementById("sensitive-toggle");
  ui.phoneConnect = document.getElementById("phone-connect");
  ui.phoneDisconnect = document.getElementById("phone-disconnect");
  ui.phonePanel = document.getElementById("phone-panel");
  ui.phoneStatus = document.getElementById("phone-status");
  ui.phoneQrContainer = document.getElementById("phone-qr-container");
  ui.phoneQrImage = document.getElementById("phone-qr-image");
  ui.phoneOfferHint = document.getElementById("phone-offer-hint");
  ui.phoneCopyOffer = document.getElementById("phone-copy-offer");
  ui.phoneCancel = document.getElementById("phone-cancel");
  ui.mirrorContainer = document.getElementById("mirror-container");
  ui.conAlert = document.getElementById("con-alert");
  ui.conAlertBackdrop = document.getElementById("con-alert-backdrop");
  ui.placeholderMessage = document.getElementById("placeholder-message");
}

function attachEventHandlers() {
  if (ui.sensitiveToggle) {
    ui.sensitiveToggle.addEventListener("change", handleSensitiveToggleChange);
  }

  if (ui.phoneConnect) {
    ui.phoneConnect.addEventListener("click", startPhonePairing);
  }

  if (ui.phoneDisconnect) {
    ui.phoneDisconnect.addEventListener("click", () => disconnectPhone(true));
  }

  if (ui.phoneCancel) {
    ui.phoneCancel.addEventListener("click", cancelPhonePairing);
  }

  if (ui.phoneCopyOffer) {
    ui.phoneCopyOffer.addEventListener("click", copyPhoneOfferLink);
  }

  if (ui.mirrorContainer) {
    MIRROR_EVENT_TYPES.forEach((type) => {
      ui.mirrorContainer.addEventListener(
        type,
        (event) => handleMirrorInteraction(event, type),
        true
      );
    });
  }
}

function initializeUiDefaults() {
  setStatus(
    "Linking to GeoGuessr…",
    "Switch to your GeoGuessr tab or open a new game.",
    "info"
  );

  if (ui.phonePanel) {
    ui.phonePanel.hidden = true;
  }

  if (ui.phoneDisconnect) {
    ui.phoneDisconnect.hidden = true;
  }

  if (ui.phoneCopyOffer) {
    ui.phoneCopyOffer.disabled = true;
  }

  if (ui.mirrorContainer) {
    ui.mirrorContainer.hidden = true;
  }

  window.currentConnectionUrl = "";
}

async function loadSensitivePreference() {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEYS.hideMode);
    const value =
      stored?.[STORAGE_KEYS.hideMode] !== undefined
        ? Boolean(stored[STORAGE_KEYS.hideMode])
        : true;
    state.sensitiveMode = value;
    if (ui.sensitiveToggle) {
      ui.sensitiveToggle.checked = value;
    }
  } catch (error) {
    console.debug("GeoStreamr sensitive preference load failed:", error);
  }
}

async function connectToGeoGuessrTab() {
  const tab = await findGeoGuessrTab();
  if (!tab) {
    setStatus(
      "Open GeoGuessr to begin",
      "We couldn't find a GeoGuessr tab. Open one and reload this popup.",
      "warn"
    );
    return;
  }

  state.connectedTabId = tab.id;
  await openPopupHandshake();
}

async function openPopupHandshake() {
  console.debug("Opening popup handshake");
  if (!state.connectedTabId) {
    return;
  }

  state.popupActive = true;
  setStatus("Linking to GeoGuessr…", "Preparing mirrored controls…", "info");

  const response = await sendTabMessage(state.connectedTabId, {
    type: "geo-streamr/popup-opened",
  });

  state.successfulHandshake = true;
  if (!response || response.ok !== true) {
    state.successfulHandshake = false;
    setStatus(
      "Waiting for GeoGuessr…",
      "If nothing appears, reload the GeoGuessr tab and try again.",
      "warn"
    );
    setTimeout(() => {
      if (state.popupActive && state.connectedTabId) {
        requestMirrorRefresh();
      }
    }, HANDSHAKE_RETRY_DELAY_MS);
    return;
  }

  applyMirrorUpdate({
    type: "geo-streamr/mirror-update",
    available: Boolean(response.hasButton && response.html),
    hiddenInPage: Boolean(response.hiddenInPage),
    disabled: Boolean(response.disabled),
    html: response.html,
    timestamp: Date.now(),
  });

  await propagateSensitiveMode();
}

function handlePopupUnload() {
  state.popupActive = false;
  if (state.connectedTabId) {
    browser.tabs
      .sendMessage(state.connectedTabId, {
        type: "geo-streamr/popup-closed",
      })
      .catch((error) =>
        console.debug("GeoStreamr popup unload message failed:", error)
      );
  }
  disconnectPhone();
}

async function findGeoGuessrTab() {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (activeTab && isGeoGuessrUrl(activeTab.url)) {
    return activeTab;
  }

  const candidates = await browser.tabs.query({ url: GEO_TAB_URL_MATCH });
  return candidates?.[0] ?? null;
}

function isGeoGuessrUrl(url) {
  return typeof url === "string" && /:\/\/(www\.)?geoguessr\.com/i.test(url);
}

function setStatus(text, detail, tone = "info") {
  if (ui.statusText) {
    ui.statusText.textContent = text;
    ui.statusText.dataset.tone = tone;
  }
  if (ui.statusDetail && typeof detail === "string") {
    ui.statusDetail.textContent = detail;
  }
  if (tone === "success") {
    ui.mirrorContainer.hidden = false;
  } else {
    ui.mirrorContainer.hidden = true;
  }
}

function handleSensitiveToggleChange(event) {
  const nextValue = Boolean(event.target.checked);
  state.sensitiveMode = nextValue;
  browser.storage.local
    .set({ [STORAGE_KEYS.hideMode]: nextValue })
    .catch((error) =>
      console.debug("GeoStreamr sensitive preference save failed:", error)
    );
  propagateSensitiveMode();
}

async function propagateSensitiveMode() {
  if (state.connectedTabId) {
    await sendTabMessage(state.connectedTabId, {
      type: "geo-streamr/apply-visibility",
      sensitive: state.sensitiveMode,
    });
  }
  sendPhoneMessage({
    type: "phone-visibility",
    sensitive: state.sensitiveMode,
  });
}

async function sendTabMessage(tabId, message) {
  if (!tabId) {
    return null;
  }

  try {
    return await browser.tabs.sendMessage(tabId, message);
  } catch (error) {
    console.debug("GeoStreamr tab message failed:", error);
    return null;
  }
}

function handleRuntimeMessage(message, sender) {
  if (!message || typeof message !== "object" || !message.type) {
    return undefined;
  }
  if (message.type === "geo-streamr/start-queue") {
    ui.placeholderMessage.textContent =
      "You are secretly in the queue, please wait...";
    ui.mirrorContainer.hidden = true;
    ui.queued = true;
    document.querySelector("main").classList.add("queueing");
    sendPhoneMessage({ type: "queue-started" });
    return { ok: true };
  }
  if (message.type === "geo-streamr/end-queue") {
    ui.placeholderMessage.textContent =
      "Searching for GeoGuessr duels controls…";
    ui.mirrorContainer.hidden = false;
    ui.queued = false;
    document.querySelector("main").classList.remove("queueing");
    sendPhoneMessage({ type: "queue-ended" });
    return { ok: true };
  }

  if (message.type === "geo-streamr/reconnect") {
    connectToGeoGuessrTab();
    return { ok: true };
  }
  if (!MIRROR_MESSAGE_TYPES.includes(message.type)) {
    return undefined;
  }

  if (!sender?.tab || sender.tab.id !== state.connectedTabId) {
    return { ok: false, reason: "tab-mismatch" };
  }

  applyMirrorUpdate(message);
  return { ok: true };
}

function handleTabRemoved(tabId) {
  if (tabId !== state.connectedTabId) {
    return;
  }
  state.connectedTabId = null;
  setStatus(
    "GeoGuessr tab closed",
    "Reopen GeoGuessr to keep using GeoStreamr.",
    "warn"
  );
  if (ui.mirrorContainer) {
    ui.mirrorContainer.innerHTML = "";
  }
  sendPhoneMessage({ type: "mirror-update", available: false, html: null });
  connectToGeoGuessrTab();
}

function applyMirrorUpdate(payload) {
  if (ui.queued) return;
  const available = Boolean(payload?.available && payload?.html);
  state.mirrorAvailable = available;

  if (available && ui.mirrorContainer) {
    ui.mirrorContainer.innerHTML = payload.html;
  }

  if (available) {
    const disabled = Boolean(payload?.disabled);
    const hiddenInPage = Boolean(payload?.hiddenInPage);
    const statusDetail = disabled
      ? "GeoGuessr disabled this control temporarily."
      : hiddenInPage
      ? "You're ready to play!"
      : "Click the control below to interact with GeoGuessr.";

    setStatus(
      disabled ? "Control paused" : "Controls ready",
      statusDetail,
      disabled ? "warn" : "success"
    );
  } else {
    setStatus(
      "Looking for controls…",
      "Open a GeoGuessr lobby to mirror the Join button.",
      "info"
    );
  }

  sendMirrorUpdateToPhone({
    available,
    html: available ? payload.html : null,
    disabled: Boolean(payload?.disabled),
    hiddenInPage: Boolean(payload?.hiddenInPage),
    timestamp: payload?.timestamp ?? Date.now(),
  });
}

function handleMirrorInteraction(event, eventType) {
  if (!state.connectedTabId) {
    return;
  }

  const keyInfo = extractKeyInfoFromEvent(event);
  if (!keyInfo) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  forwardMirrorInteraction(eventType, keyInfo);
}

function extractKeyInfoFromEvent(event) {
  if (!event || !event.target) {
    return null;
  }

  const path =
    typeof event.composedPath === "function"
      ? event.composedPath()
      : buildFallbackPath(event.target);

  const pathKeys = [];
  let targetKey = null;

  for (const node of path) {
    if (!node || typeof node.getAttribute !== "function") {
      continue;
    }
    const key = node.getAttribute(MIRROR_NODE_KEY_ATTR);
    if (!key) {
      continue;
    }
    if (!targetKey) {
      targetKey = key;
    }
    if (!pathKeys.includes(key)) {
      pathKeys.push(key);
    }
  }

  if (!targetKey && pathKeys.length > 0) {
    targetKey = pathKeys[0];
  }

  if (!targetKey) {
    return null;
  }

  return { targetKey, pathKeys };
}

function buildFallbackPath(node) {
  const path = [];
  let current = node;
  while (current && current !== document) {
    path.push(current);
    current = current.parentNode;
  }
  return path;
}

async function forwardMirrorInteraction(eventType, keyInfo) {
  if (!state.connectedTabId) {
    return;
  }

  const payload = {
    type: "geo-streamr/mirror-event",
    event: eventType,
    targetKey: keyInfo?.targetKey ?? null,
    pathKeys: keyInfo?.pathKeys ?? [],
  };

  const response = await sendTabMessage(state.connectedTabId, payload);
  sendPhoneMessage({
    type: "mirror-event-forwarded",
    event: eventType,
    ok: Boolean(response?.ok),
    reason: response?.reason ?? null,
  });
}

async function requestMirrorRefresh() {
  if (!state.connectedTabId) {
    return;
  }
  await sendTabMessage(state.connectedTabId, {
    type: "geo-streamr/request-mirror-refresh",
  });
}

function startPhonePairing() {
  if (state.peerConnection || state.sessionCode) {
    disconnectPhone();
  }

  state.manualDisconnect = false;
  state.sessionCode = generateSessionCode();
  preparePhonePanelForPairing();
  setPhoneStatus("Preparing secure link…", "info");

  initPeerConnection();
  createOffer().catch((error) => {
    console.error("GeoStreamr offer creation failed:", error);
    setPhoneStatus("Failed to create offer. Try again.", "error");
  });
}

function preparePhonePanelForPairing() {
  if (ui.phonePanel) {
    ui.phonePanel.hidden = false;
  }
  if (ui.phoneConnect) {
    ui.phoneConnect.disabled = true;
  }
  if (ui.phoneDisconnect) {
    ui.phoneDisconnect.hidden = true;
  }
  if (ui.phoneQrContainer) {
    ui.phoneQrContainer.hidden = false;
  }
  if (ui.phoneOfferHint) {
    ui.phoneOfferHint.hidden = false;
  }
  if (ui.phoneCopyOffer) {
    ui.phoneCopyOffer.disabled = true;
    ui.phoneCopyOffer.textContent = "Copy link";
  }
  if (ui.phoneQrImage) {
    ui.phoneQrImage.innerHTML = "";
  }
}

function setPhoneStatus(text, tone = "info") {
  state.phoneStatusTone = tone;
  if (ui.phoneStatus) {
    ui.phoneStatus.textContent = text;
    ui.phoneStatus.dataset.tone = tone;
  }
  sendPhoneMessage({ type: "phone-status", text, tone });
}

function copyPhoneOfferLink() {
  if (!window.currentConnectionUrl || !ui.phoneCopyOffer) {
    return;
  }

  navigator.clipboard
    .writeText(window.currentConnectionUrl)
    .then(() => {
      ui.phoneCopyOffer.textContent = "Copied!";
      setTimeout(() => {
        if (ui.phoneCopyOffer) {
          ui.phoneCopyOffer.textContent = "Copy link";
        }
      }, 1800);
    })
    .catch((error) => {
      console.error("GeoStreamr copy link failed:", error);
      ui.phoneCopyOffer.textContent = "Copy failed";
      setTimeout(() => {
        if (ui.phoneCopyOffer) {
          ui.phoneCopyOffer.textContent = "Copy link";
        }
      }, 1800);
    });
}

function cancelPhonePairing() {
  if (state.sessionCode) {
    getFromKV(`${state.sessionCode}-offer`).catch((error) =>
      console.debug("GeoStreamr offer cleanup failed:", error)
    );
  }
  state.manualDisconnect = true;
  setPhoneStatus("Connection cancelled.", "warn");
  disconnectPhone();
  resetPhoneUi();
}

function disconnectPhone(isManual = false) {
  if (isManual) {
    state.manualDisconnect = true;
  }

  clearPhoneTimers();

  if (state.dataChannel) {
    try {
      state.dataChannel.close();
    } catch (error) {
      console.debug("GeoStreamr data channel close failed:", error);
    }
    state.dataChannel = null;
  }

  if (state.peerConnection) {
    try {
      state.peerConnection.close();
    } catch (error) {
      console.debug("GeoStreamr peer connection close failed:", error);
    }
    state.peerConnection = null;
  }

  state.sessionCode = null;
  resetPhoneUi();
}

function resetPhoneUi() {
  if (ui.phonePanel) {
    ui.phonePanel.hidden = true;
  }
  if (ui.phoneConnect) {
    ui.phoneConnect.disabled = false;
    ui.phoneConnect.textContent = "Connect remotely";
  }
  if (ui.phoneDisconnect) {
    ui.phoneDisconnect.hidden = true;
  }
  if (ui.phoneQrImage) {
    ui.phoneQrImage.innerHTML = "";
  }
  if (ui.phoneCopyOffer) {
    ui.phoneCopyOffer.disabled = true;
    ui.phoneCopyOffer.textContent = "Copy link";
  }
  window.currentConnectionUrl = "";
}

function clearPhoneTimers() {
  if (state.pollingInterval) {
    clearInterval(state.pollingInterval);
    state.pollingInterval = null;
  }
  if (state.countdownInterval) {
    clearInterval(state.countdownInterval);
    state.countdownInterval = null;
  }
  state.expirationTime = null;
}

function initPeerConnection() {
  if (state.peerConnection) {
    console.debug("GeoStreamr: peerConnection already exists — skipping init");
    return;
  }

  const config = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  const peerConnection = new RTCPeerConnection(config);
  state.peerConnection = peerConnection;

  const dataChannel = peerConnection.createDataChannel("geo-streamr-channel");
  state.dataChannel = dataChannel;

  dataChannel.onopen = handleDataChannelOpen;
  dataChannel.onclose = handleDataChannelClose;
  dataChannel.onmessage = handleDataChannelMessage;

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.debug(
        "GeoStreamr ICE candidate:",
        event.candidate.type,
        event.candidate.protocol
      );
    }
  };

  peerConnection.onconnectionstatechange = () => {
    const { connectionState } = peerConnection;
    console.debug("GeoStreamr connection state:", connectionState);
    if (connectionState === "failed" && !state.manualDisconnect) {
      showConAlert();
      scheduleReconnect();
    }
    if (connectionState === "disconnected" && !state.manualDisconnect) {
      console.debug("GeoStreamr: connection lost -> schedule reconnect");
      scheduleReconnect();
    }
  };
}

function showConAlert() {
  ui.conAlert.style.display = "flex";
  ui.conAlertBackdrop.style.display = "block";

  ui.conAlertBackdrop.onclick = () => {
    ui.conAlert.style.display = "none";
    ui.conAlertBackdrop.style.display = "none";
  };

  ui.conAlert.onclick = () => {
    ui.conAlert.style.display = "none";
    ui.conAlertBackdrop.style.display = "none";
  };
}

function scheduleReconnect() {
  if (state.manualDisconnect) return;
  if (state.reconnectInProgress) {
    console.debug("GeoStreamr: reconnect already scheduled/in progress");
    return;
  }

  state.reconnectAttempts = (state.reconnectAttempts || 0) + 1;
  if (state.reconnectAttempts > state.maxReconnectAttempts) {
    setPhoneStatus("Unable to reconnect after multiple attempts.", "error");
    return;
  }

  state.reconnectInProgress = true;
  const delay = Math.min(
    16000,
    1000 * Math.pow(2, state.reconnectAttempts - 1)
  );
  setPhoneStatus(
    `Reconnecting in ${delay / 1000}s (attempt ${state.reconnectAttempts})`,
    "warn"
  );

  setTimeout(() => {
    try {
      recreateOffer();
    } finally {
      state.reconnectInProgress = false;
    }
  }, delay);
}

function handleDataChannelOpen() {
  setPhoneStatus("Phone connected!", "success");
  clearPhoneTimers();
  if (ui.phoneConnect) {
    ui.phoneConnect.disabled = false;
    ui.phoneConnect.textContent = "Reconnect phone";
  }
  if (ui.phoneDisconnect) {
    ui.phoneDisconnect.hidden = false;
  }
  if (ui.phoneQrContainer) {
    ui.phoneQrContainer.hidden = true;
  }
  if (ui.phoneOfferHint) {
    ui.phoneOfferHint.hidden = true;
  }
  if (ui.phoneCopyOffer) {
    ui.phoneCopyOffer.disabled = true;
  }
  sendMirrorUpdateToPhone({
    available: state.mirrorAvailable,
    html:
      state.mirrorAvailable && ui.mirrorContainer
        ? ui.mirrorContainer.innerHTML
        : null,
    disabled: false,
    hiddenInPage: false,
    timestamp: Date.now(),
  });
  propagateSensitiveMode();
}

function handleDataChannelClose() {
  if (state.manualDisconnect) {
    setPhoneStatus("Disconnected.", "warn");
    return;
  }
  setPhoneStatus("Phone disconnected. Attempting to reconnect…", "warn");
  scheduleReconnect();
}

function handleDataChannelMessage(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch (error) {
    console.debug("GeoStreamr data channel parse failed:", error);
    return;
  }

  if (!message || typeof message.type !== "string") {
    return;
  }

  if (message.type === "mirror-event") {
    forwardMirrorInteraction(message.event || "click", {
      targetKey: message.targetKey || null,
      pathKeys: Array.isArray(message.pathKeys) ? message.pathKeys : [],
    });
  } else if (message.type === "request-mirror-refresh") {
    requestMirrorRefresh();
  }
}

async function createOffer() {
  if (!state.peerConnection) {
    return;
  }

  try {
    const offer = await state.peerConnection.createOffer();
    await state.peerConnection.setLocalDescription(offer);

    await waitForIceGathering(state.peerConnection);

    const payload = JSON.stringify(state.peerConnection.localDescription);
    const stored = await storeInKV(`${state.sessionCode}-offer`, payload);

    if (!stored) {
      throw new Error("Failed to store offer in KV");
    }

    renderPhoneLink();
    pollForAnswer();
  } catch (error) {
    console.error("GeoStreamr createOffer error:", error);
    setPhoneStatus("Failed to create offer. Try again.", "error");
  }
}

function renderPhoneLink() {
  if (!state.sessionCode || !ui.phoneQrImage) {
    return;
  }
  const qrUrl = `${QR_BASE_URL}?session=${state.sessionCode}`;
  window.currentConnectionUrl = qrUrl;
  ui.phoneQrImage.innerHTML = "";
  new QRCode(ui.phoneQrImage, {
    text: qrUrl,
    width: 200,
    height: 200,
    colorDark: "#ffffff",
    colorLight: "#0c0d1c",
    correctLevel: QRCode.CorrectLevel.H,
  });
  if (ui.phoneCopyOffer) {
    ui.phoneCopyOffer.disabled = false;
  }
  setPhoneStatus("Scan the QR code to connect to another device.", "info");
}

async function waitForIceGathering(peerConnection) {
  if (peerConnection.iceGatheringState === "complete") {
    return;
  }

  await new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    }, 3000);

    peerConnection.addEventListener(
      "icecandidate",
      (event) => {
        if (event.candidate && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve();
        }
      },
      { once: true }
    );
  });
}

function pollForAnswer() {
  clearPhoneTimers();
  state.expirationTime = Date.now() + PHONE_PAIRING_TIMEOUT_MS;
  updatePhoneCountdown();
  state.countdownInterval = setInterval(updatePhoneCountdown, 1000);

  setTimeout(() => {
    state.pollingInterval = setInterval(async () => {
      const now = Date.now();
      if (state.expirationTime && now >= state.expirationTime) {
        setPhoneStatus("Connection expired. Try again.", "error");
        ui.phoneQrImage.innerHTML = "";
        clearPhoneTimers();
        return;
      }

      const answer = await getFromKV(`${state.sessionCode}-answer`);
      if (!answer) {
        return;
      }

      clearPhoneTimers();

      try {
        const description = JSON.parse(answer);
        await state.peerConnection.setRemoteDescription(
          new RTCSessionDescription(description)
        );
        setPhoneStatus("Answer received. Finalizing…", "info");
      } catch (error) {
        console.error("GeoStreamr setRemoteDescription failed:", error);
        setPhoneStatus("Failed to finish pairing.", "error");
      }
    }, 3000);
  }, 8000);
}

function updatePhoneCountdown() {
  if (!state.expirationTime) {
    return;
  }
  const remaining = Math.max(
    0,
    Math.ceil((state.expirationTime - Date.now()) / 1000)
  );
  if (remaining <= 0) {
    setPhoneStatus("Connection expired. Try again.", "error");
    ui.phoneQrImage.innerHTML = "";
    clearPhoneTimers();
    return;
  }
  setPhoneStatus(`Waiting for device… ${remaining}s`, "info");
}

async function recreateOffer() {
  if (!state.sessionCode) {
    return;
  }

  clearPhoneTimers();
  safeClosePeerConnection();

  try {
    initPeerConnection();
    await createOffer();
    state.reconnectAttempts = 0;
  } catch (error) {
    console.error("GeoStreamr recreateOffer failed:", error);
    scheduleReconnect();
  }
}

function safeClosePeerConnection() {
  if (state.dataChannel) {
    try {
      state.dataChannel.onopen = null;
      state.dataChannel.onclose = null;
      state.dataChannel.onmessage = null;
      state.dataChannel.close();
    } catch (e) {
      console.debug("GeoStreamr dataChannel close error:", e);
    }
    state.dataChannel = null;
  }

  if (state.peerConnection) {
    try {
      try {
        const senders = state.peerConnection.getSenders
          ? state.peerConnection.getSenders()
          : [];
        senders.forEach((s) => {
          if (s.track) {
            try {
              s.track.stop();
            } catch (e) {
              /* ignore */
            }
          }
        });
      } catch (e) {
        console.debug("GeoStreamr stopping senders failed:", e);
      }

      state.peerConnection.onicecandidate = null;
      state.peerConnection.onconnectionstatechange = null;
      state.peerConnection.ontrack = null;

      state.peerConnection.close();
    } catch (e) {
      console.debug("GeoStreamr peerConnection close failed:", e);
    }
    state.peerConnection = null;
  }
}

function sendMirrorUpdateToPhone(payload) {
  sendPhoneMessage({
    type: "mirror-update",
    payload,
  });
}

function sendPhoneMessage(data) {
  if (!state.dataChannel || state.dataChannel.readyState !== "open") {
    return;
  }
  try {
    state.dataChannel.send(JSON.stringify(data));
  } catch (error) {
    console.debug("GeoStreamr phone message failed:", error);
  }
}

function generateSessionCode() {
  const chars = "ABCDEFGHIJLMOPQRTUVWYZ0123456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function storeInKV(session, data) {
  if (!session) return false;
  const response = await fetch(`${KV_BASE_URL}/store`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session, answer: data }),
  });
  return response.ok;
}

async function getFromKV(session) {
  if (!session) return null;
  const response = await fetch(`${KV_BASE_URL}/get?session=${session}`);
  if (response.status === 200) {
    return response.text();
  }
  return null;
}
