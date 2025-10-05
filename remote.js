const KV_BASE_URL = "https://geostreamer.mateusaqb.workers.dev";
const SESSION_EXPIRY_HOURS = 6;
const OFFER_POLL_INTERVAL_MS = 3000;
const OFFER_POLL_MAX_ATTEMPTS = 100;
const MAX_TRIES = 8;
const MIRROR_NODE_KEY_ATTR = "data-geo-streamr-key";
const MIRROR_EVENT_TYPES = ["click", "pointerdown", "pointerup"];
const SESSION_STORAGE_KEYS = {
  persistent: "geostreamer_session",
  active: "geostreamer_active",
};
let tries = 0;
const ui = {};
const state = {
  peerConnection: null,
  dataChannel: null,
  sessionCode: null,
  manualDisconnect: false,
  pollingInterval: null,
  mirrorAvailable: false,
  primaryTargetKey: null,
  primaryPathKeys: [],
  toastTimer: null,
  hiddenInPage: false,
  sensitiveMode: false,
  statusDetail: "Keep this tab open to steer GeoGuessr.",
};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  attachEventListeners();
  initializeUiDefaults();
  initializeSession();
});

function cacheElements() {
  ui.statusText = document.getElementById("status-text");
  ui.statusDetail = document.getElementById("status-detail");
  ui.sessionCode = document.getElementById("session-code");
  ui.mirrorContainer = document.getElementById("mirror-container");
  ui.mirrorFrame = document.getElementById("mirror-frame");
  ui.directInfo = document.getElementById("direct-info");
  ui.disconnectBtn = document.getElementById("disconnect-btn");
  ui.visibilityIndicator = document.getElementById("visibility-indicator");
  ui.toast = document.getElementById("toast");
  ui.placeholderMessage = document.getElementById("placeholder-message");
}

function attachEventListeners() {
  if (ui.disconnectBtn) {
    ui.disconnectBtn.addEventListener("click", handleDisconnectClick);
  }

  if (ui.mirrorContainer) {
    MIRROR_EVENT_TYPES.forEach((eventType) => {
      ui.mirrorContainer.addEventListener(
        eventType,
        (event) => handleMirrorInteraction(event, eventType),
        true
      );
    });
  }

  window.addEventListener("beforeunload", cleanupConnections);
}

function initializeUiDefaults() {
  setStatus("Connecting to extension…", state.statusDetail, "info");
  updateVisibilityIndicator(false);
}

function initializeSession() {
  state.sessionCode = getSessionFromURL() || getStoredSession();

  if (!state.sessionCode) {
    setStatus(
      "Session expired",
      "Rescan the pairing link from the extension to reconnect.",
      "error"
    );
    return;
  }

  saveSession(state.sessionCode);

  if (ui.sessionCode) {
    ui.sessionCode.textContent = state.sessionCode;
  }

  initWebRTC();
  pollForOffer();
}

function initWebRTC() {
  cleanupConnections();

  const config = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  const peerConnection = new RTCPeerConnection(config);
  state.peerConnection = peerConnection;

  peerConnection.addEventListener("datachannel", (event) => {
    const channel = event.channel;
    state.dataChannel = channel;

    channel.addEventListener("open", handleDataChannelOpen);
    channel.addEventListener("close", handleDataChannelClose);
    channel.addEventListener("message", handleDataChannelMessage);
  });

  peerConnection.addEventListener("icecandidate", (event) => {
    if (event.candidate) {
      console.debug(
        "GeoStreamr remote ICE candidate",
        event.candidate.type,
        event.candidate.protocol
      );
    }
  });

  peerConnection.addEventListener("connectionstatechange", () => {
    const { connectionState } = peerConnection;
    console.debug("GeoStreamr remote connection state:", connectionState);

    if (connectionState === "failed" || connectionState === "disconnected") {
      if (state.manualDisconnect) {
        return;
      }
      setStatus(
        connectionState === "failed" ? "Connection failed" : "Connection lost",
        "Attempting to re-establish the link…",
        "warn"
      );
      scheduleReconnect();
    }
  });

  peerConnection.addEventListener("iceconnectionstatechange", () => {
    console.debug(
      "GeoStreamr remote ICE state:",
      peerConnection.iceConnectionState
    );
  });

  return peerConnection;
}

function handleDataChannelOpen() {
  state.manualDisconnect = false;
  tries = 0;
  setStatus(
    "Connected to extension",
    "You're ready to play! Please keep the extension popup open, otherwise the connection will close.",
    "success"
  );
  requestMirrorRefresh();
}

function handleDataChannelClose() {
  if (state.manualDisconnect) {
    setStatus(
      "Disconnected",
      "Reconnect from the extension to continue.",
      "warn"
    );
    return;
  }
  setStatus(
    "Connection interrupted",
    "Waiting for extension to reconnect…",
    "warn"
  );
  scheduleReconnect();
}

function handleDataChannelMessage(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch (error) {
    console.debug("GeoStreamr remote message parse failed:", error);
    return;
  }

  if (!message || typeof message.type !== "string") {
    return;
  }

  switch (message.type) {
    case "queue-started":
      ui.placeholderMessage.textContent =
        "You are secretly in the queue, please wait...";
      ui.mirrorContainer.hidden = true;
      document.querySelector("main").classList.add("queueing");
      break;
    case "queue-ended":
      ui.placeholderMessage.textContent =
        "Searching for GeoGuessr duels controls…";
      ui.mirrorContainer.hidden = false;
      document.querySelector("main").classList.remove("queueing");
      break;

    case "mirror-update":
      applyMirrorUpdate(message.payload || {});
      break;
    case "phone-status":
      setStatus(
        message.text || "Status updated",
        message.detail,
        message.tone || "info"
      );
      break;
    case "mirror-event-forwarded":
      handleMirrorEventResult(message);
      break;
    case "phone-visibility":
      handlePhoneVisibility(message);
      break;
    default:
      break;
  }
}

function applyMirrorUpdate(payload) {
  const available = Boolean(payload?.available && payload?.html);
  state.mirrorAvailable = available;
  state.hiddenInPage = Boolean(payload?.hiddenInPage);

  if (!available) {
    state.primaryTargetKey = null;
    state.primaryPathKeys = [];

    if (ui.mirrorContainer) {
      ui.mirrorContainer.hidden = true;
      ui.mirrorContainer.innerHTML = "";
    }

    if (ui.placeholderMessage) {
      ui.placeholderMessage.textContent = state.hiddenInPage
        ? "GeoGuessr controls are hidden in the host tab."
        : "Searching for GeoGuessr duels controls…";
    }

    setStatus(
      state.hiddenInPage ? "Control hidden" : "Looking for controls",
      state.hiddenInPage
        ? "Unhide the control in the GeoGuessr tab to continue."
        : "Stay on the duel screen; GeoStreamr will mirror controls automatically.",
      state.hiddenInPage ? "warn" : "info"
    );

    updateVisibilityIndicator(state.hiddenInPage);
    return;
  }

  if (ui.mirrorContainer) {
    ui.mirrorContainer.hidden = false;
    ui.mirrorContainer.innerHTML = payload.html;
  }

  const mirrorRoot = ui.mirrorContainer?.querySelector(
    '[data-geo-streamr-mirror-root="true"]'
  );
  const primaryNode = mirrorRoot
    ? mirrorRoot.matches(`[${MIRROR_NODE_KEY_ATTR}]`)
      ? mirrorRoot
      : mirrorRoot.querySelector(`[${MIRROR_NODE_KEY_ATTR}]`)
    : null;

  state.primaryTargetKey =
    primaryNode?.getAttribute(MIRROR_NODE_KEY_ATTR) || null;
  state.primaryPathKeys = primaryNode ? collectAncestorKeys(primaryNode) : [];

  if (ui.placeholderMessage) {
    const primaryLabel = extractPrimaryActionText(primaryNode || mirrorRoot);
    ui.placeholderMessage.textContent = primaryLabel
      ? `Tap “${primaryLabel}” to play.`
      : "Controls mirrored from GeoGuessr.";
  }

  const disabled = Boolean(payload?.disabled);
  const detail = disabled
    ? "GeoGuessr paused this control for a moment."
    : "You're ready to play! Please keep the extension popup open, otherwise the connection will close.";

  setStatus(
    disabled ? "Control paused" : "Controls mirrored",
    detail,
    disabled ? "warn" : "success"
  );

  updateVisibilityIndicator(state.hiddenInPage);
}

function handleMirrorEventResult(message) {
  if (!message) {
    return;
  }

  if (message.ok) {
    showToast("Action sent to GeoGuessr");
  } else {
    const reason =
      message.reason === "disabled" ? "Control disabled" : "Action blocked";
    showToast(reason);
  }
}

function handlePhoneVisibility(message) {
  state.sensitiveMode = Boolean(message?.sensitive);
  updateVisibilityIndicator(state.hiddenInPage);
}

function updateVisibilityIndicator(hiddenInPage) {
  if (!ui.visibilityIndicator) {
    return;
  }

  const sensitive = state.sensitiveMode;

  if (hiddenInPage || sensitive) {
    ui.visibilityIndicator.hidden = false;
    ui.visibilityIndicator.textContent = sensitive
      ? "Sensitive warning active"
      : "Control hidden in host tab";
  } else {
    ui.visibilityIndicator.hidden = true;
  }
}

function extractPrimaryActionText(root) {
  if (!root) {
    return null;
  }
  const candidate = root.querySelector("button, [role='button']");
  if (!candidate) {
    return null;
  }
  const text = (candidate.textContent || "").trim().replace(/\s+/g, " ");
  return text.length ? text : null;
}

function collectAncestorKeys(node) {
  const keys = [];
  let current = node;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const key = current.getAttribute(MIRROR_NODE_KEY_ATTR);
    if (key && !keys.includes(key)) {
      keys.push(key);
    }
    current = current.parentElement;
  }
  return keys;
}

function handlePrimaryActionClick(event) {
  event.preventDefault();
  if (!state.primaryTargetKey) {
    requestMirrorRefresh();
    return;
  }
  forwardMirrorInteraction("click", {
    targetKey: state.primaryTargetKey,
    pathKeys: state.primaryPathKeys,
  });
}

function handleMirrorInteraction(event, eventType) {
  if (!state.dataChannel || state.dataChannel.readyState !== "open") {
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

  if (!targetKey && pathKeys.length) {
    targetKey = pathKeys[0];
  }

  return targetKey ? { targetKey, pathKeys } : null;
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

function forwardMirrorInteraction(eventType, keyInfo) {
  sendToExtension({
    type: "mirror-event",
    event: eventType,
    targetKey: keyInfo?.targetKey ?? null,
    pathKeys: keyInfo?.pathKeys ?? [],
  });
}

function requestMirrorRefresh() {
  sendToExtension({ type: "request-mirror-refresh" });
}

function showToast(message) {
  if (!ui.toast || !message) {
    return;
  }

  ui.toast.textContent = message;
  ui.toast.dataset.visible = "true";

  if (state.toastTimer) {
    clearTimeout(state.toastTimer);
  }

  state.toastTimer = window.setTimeout(() => {
    ui.toast.dataset.visible = "false";
    state.toastTimer = null;
  }, 2200);
}

function handleDisconnectClick() {
  state.manualDisconnect = true;
  setStatus(
    "Disconnecting…",
    "Reload the link from the extension to pair again.",
    "warn"
  );
  clearSession();
  cleanupConnections();
}

function scheduleReconnect() {
  if (state.manualDisconnect || tries > MAX_TRIES) {
    return;
  }
  window.setTimeout(() => {
    if (state.manualDisconnect || tries > MAX_TRIES) {
      return;
    }
    initWebRTC();
    pollForOffer();
  }, 2500);
}

function pollForOffer() {
  clearOfferPolling();

  if (!state.sessionCode) {
    return;
  }

  setStatus(
    "Waiting for extension offer…",
    "GeoStreamr will retry automatically.",
    "info"
  );

  let attempts = 0;
  state.pollingInterval = window.setInterval(async () => {
    attempts += 1;

    if (attempts > OFFER_POLL_MAX_ATTEMPTS) {
      clearOfferPolling();
      setStatus(
        "Connection timeout",
        "Restart the pairing from the extension window.",
        "error"
      );
      return;
    }

    const offer = await getFromKV(`${state.sessionCode}-offer`);
    if (!offer) {
      return;
    }

    clearOfferPolling();

    try {
      const description = JSON.parse(offer);
      await state.peerConnection.setRemoteDescription(
        new RTCSessionDescription(description)
      );

      const answer = await state.peerConnection.createAnswer();
      await state.peerConnection.setLocalDescription(answer);

      await waitForIceGathering(state.peerConnection);

      const stored = await storeInKV(
        `${state.sessionCode}-answer`,
        JSON.stringify(state.peerConnection.localDescription)
      );

      if (!stored) {
        throw new Error("Failed to store answer in KV");
      }

      setStatus(
        "Answer sent",
        "Waiting for the extension to finish connecting…",
        "info"
      );
    } catch (error) {
      console.error("GeoStreamr remote pairing failed:", error);
      setStatus(
        "Could not finalize connection",
        "Retry from the extension.",
        "error"
      );
      scheduleReconnect();
    }
  }, OFFER_POLL_INTERVAL_MS);
}

function clearOfferPolling() {
  if (state.pollingInterval) {
    clearInterval(state.pollingInterval);
    state.pollingInterval = null;
  }
}

function waitForIceGathering(peerConnection) {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let resolved = false;
    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    const timeout = window.setTimeout(finish, 3000);

    const listener = (event) => {
      if (event.candidate && !resolved) {
        window.clearTimeout(timeout);
        resolved = true;
        peerConnection.removeEventListener("icecandidate", listener);
        resolve();
      }
    };

    peerConnection.addEventListener("icecandidate", listener);
  });
}

function sendToExtension(message) {
  if (!state.dataChannel || state.dataChannel.readyState !== "open") {
    return;
  }
  try {
    state.dataChannel.send(JSON.stringify(message));
  } catch (error) {
    console.debug("GeoStreamr remote send failed:", error);
  }
}

function cleanupConnections() {
  clearOfferPolling();

  if (state.dataChannel) {
    try {
      state.dataChannel.close();
    } catch (_error) {
      // ignore
    }
    state.dataChannel = null;
  }

  if (state.peerConnection) {
    try {
      state.peerConnection.close();
    } catch (_error) {
      // ignore
    }
    state.peerConnection = null;
  }
}

function setStatus(text, detail, tone = "info") {
  if (text === "Session expired") {
    ui.mirrorFrame.style.display = "none";
    ui.directInfo.style.display = "block";
  } else {
    if (tone === "success") {
      ui.mirrorFrame.style.display = "flex";
      ui.directInfo.style.display = "none";
      ui.mirrorContainer.hidden = false;
    } else {
      ui.mirrorFrame.style.display = "flex";
      ui.directInfo.style.display = "none";
      ui.mirrorContainer.hidden = true;
    }
  }
  if (typeof detail === "string") {
    state.statusDetail = detail;
  } else {
    detail = state.statusDetail;
  }

  if (ui.statusText) {
    ui.statusText.textContent = text;
    ui.statusText.dataset.tone = tone;
  }

  if (ui.statusDetail) {
    ui.statusDetail.textContent = detail;
  }
}

function saveSession(code) {
  const expiryTime = Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000;
  const payload = JSON.stringify({ code, expiry: expiryTime });
  localStorage.setItem(SESSION_STORAGE_KEYS.persistent, payload);
  sessionStorage.setItem(SESSION_STORAGE_KEYS.active, code);
}

function getStoredSession() {
  const active = sessionStorage.getItem(SESSION_STORAGE_KEYS.active);
  if (active) {
    return active;
  }

  const stored = localStorage.getItem(SESSION_STORAGE_KEYS.persistent);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored);
    if (parsed && parsed.code && Date.now() < parsed.expiry) {
      sessionStorage.setItem(SESSION_STORAGE_KEYS.active, parsed.code);
      return parsed.code;
    }
  } catch (error) {
    console.debug("GeoStreamr remote session parse failed:", error);
  }

  localStorage.removeItem(SESSION_STORAGE_KEYS.persistent);
  return null;
}

function clearSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEYS.active);
  localStorage.removeItem(SESSION_STORAGE_KEYS.persistent);
}

function getSessionFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("session");
}

async function storeInKV(session, data) {
  if (tries++ > MAX_TRIES) {
    clearSession();
    window.location = window.location.pathname;
    return null;
  }
  if (!session) return false;
  const response = await fetch(`${KV_BASE_URL}/store`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session, answer: data }),
  });
  return response.ok;
}

async function getFromKV(session) {
  if (tries++ > MAX_TRIES) {
    clearSession();
    window.location = window.location.pathname;
    return null;
  }
  if (!session) return null;
  const response = await fetch(`${KV_BASE_URL}/get?session=${session}`);
  if (response.status === 200) {
    return response.text();
  }
  return null;
}
