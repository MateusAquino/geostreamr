const FUNCTION_LOCK_SELECTOR = "[class^=player-section_gameModeContainer]";
const HIDDEN_CLASS = "geo-streamr-hidden";
const SENSITIVE_CLASS = "geo-streamr-sensitive";
const STYLE_ELEMENT_ID = "geo-streamr-hide-style";
const POPUP_ACTIVE_CLASS = "geo-streamr-popup-open";
const MIRROR_ROOT_ATTR = "data-geo-streamr-mirror-root";
const NODE_KEY_ATTR = "data-geo-streamr-key";
const AVATAR_CONTAINER_SELECTOR = "[class^=avatar_avatar]";
const DOTS_SELECTOR = "[class^=center-content_dotsAnimation]";
const AVATAR_OVERLAY_ATTR = "data-geo-streamr-avatar-freeze";
const AUDIO_BRIDGE_SCRIPT_ID = "geo-streamr-audio-bridge";
const ONGOING_GAME_SELECTOR = '[class^="game-modes"][class*="hasOngoingGame"]';
const PSEUDO_SKIP_SELECTOR = '[class^="game-modes"]';

// .center-content_dotsAnimation__pqn1C

let trackedButton = null;
let buttonObserver = null;
let documentObserver = null;
let popupActive = false;
let sensitiveModeEnabled = false;
let broadcastTimerId = null;
let pendingForceSend = false;
let nodeIdLookup = new WeakMap();
const nodeFromId = new Map();
let nextNodeId = 1;
let buttonClickHandler = null;
let avatarFreezeActive = false;
let avatarFreezePollingId = null;
let baselineStyleHost = null;
const baselineStyleCache = new Map();
let colorNormalizationElement = null;
let lastMirrorSnapshot = null;
let mirrorDirty = true;
const ESSENTIAL_STYLE_PROPERTIES = new Set([
  "display",
  "position",
  "top",
  "left",
  "right",
  "bottom",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-width",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-style",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "background",
  "background-color",
  "background-image",
  "background-size",
  "background-position",
  "background-repeat",
  "background-clip",
  "color",
  "font",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-transform",
  "text-decoration",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-color",
  "text-shadow",
  "box-shadow",
  "opacity",
  "visibility",
  "z-index",
  "overflow",
  "overflow-x",
  "overflow-y",
  "pointer-events",
  "cursor",
  "transform",
  "transform-origin",
  "transition",
  "transition-property",
  "transition-duration",
  "transition-timing-function",
  "transition-delay",
  "flex",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "flex-direction",
  "flex-wrap",
  "align-items",
  "align-self",
  "align-content",
  "justify-content",
  "gap",
  "column-gap",
  "row-gap",
  "grid",
  "grid-template-columns",
  "grid-template-rows",
  "grid-column",
  "grid-row",
  "filter",
  "backdrop-filter",
  "clip-path",
  "mask",
  "mask-image",
  "mask-size",
  "object-fit",
  "object-position",
  "white-space",
  "word-break",
  "writing-mode",
  "mix-blend-mode",
  "appearance",
  "-webkit-appearance",
  "box-sizing",
  "outline",
]);
const DYNAMIC_DIMENSION_PROPERTIES = new Set(["height", "block-size"]);
const PSEUDO_STYLE_PROPERTIES = new Set([
  "transition",
  "content",
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "inset-block",
  "inset-inline",
  "inset-block-start",
  "inset-block-end",
  "inset-inline-start",
  "inset-inline-end",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "transform",
  "transform-origin",
  "opacity",
  "color",
  "background",
  "background-color",
  "background-image",
  "background-size",
  "background-position",
  "background-repeat",
  "background-clip",
  "background-origin",
  "background-attachment",
  "background-blend-mode",
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-width",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-style",
  "border-color",
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "box-shadow",
  "text-shadow",
  "filter",
  "backdrop-filter",
  "clip-path",
  "mask",
  "mask-image",
  "mask-size",
  "mask-position",
  "mask-repeat",
  "mix-blend-mode",
  "pointer-events",
  "z-index",
  "font",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-transform",
  "text-decoration",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-color",
  "text-align",
  "white-space",
  "box-sizing",
  "overflow",
  "overflow-x",
  "overflow-y",
  "outline",
  "outline-width",
  "outline-style",
  "outline-color",
]);

ensureHideStyle();
refreshTrackedButton();
subscribeToDocumentChanges();
syncPopupOverlayState();
injectAudioBridge();

browser.runtime.sendMessage({ type: "geo-streamr/reconnect" });
browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object" || !message.type) {
    return;
  }

  switch (message.type) {
    case "geo-streamr/popup-opened": {
      popupActive = true;
      invalidateMirrorSnapshot();
      syncPopupOverlayState();
      applyVisibilityState();
      scheduleBroadcast();
      sendResponse?.(buildHandshakePayload());
      return true;
    }
    case "geo-streamr/popup-closed": {
      popupActive = false;
      invalidateMirrorSnapshot();
      syncPopupOverlayState();
      unfreezeAvatars();
      applyVisibilityState();
      scheduleBroadcast();
      sendResponse?.({ ok: true });
      return true;
    }
    case "geo-streamr/apply-visibility": {
      sensitiveModeEnabled = Boolean(message.sensitive);
      applyVisibilityState();
      markMirrorDirty();
      scheduleBroadcast();
      sendResponse?.({ ok: true });
      return true;
    }
    case "geo-streamr/mirror-event": {
      const eventTarget = resolveMirroredTarget(message);
      if (
        eventTarget.matches('[data-qa="function-lock"] *') &&
        message?.event === "pointerup"
      ) {
        handleFunctionLockClick();
      }
      const controlRoot = getTrackedButton();

      if (!controlRoot) {
        sendResponse?.({
          ok: false,
          forwarded: false,
          reason: "missing-button",
        });
        return true;
      }

      if (!isButtonInteractable(controlRoot)) {
        sendResponse?.({ ok: true, forwarded: false, reason: "disabled" });
        return true;
      }

      const dispatchTarget = eventTarget || controlRoot;
      const dispatched = dispatchMirroredEvent(dispatchTarget, message.event);

      sendResponse?.({ ok: dispatched, forwarded: dispatched });
      markMirrorDirty();
      scheduleBroadcast(true);
      return true;
    }
    case "geo-streamr/request-mirror-refresh": {
      markMirrorDirty();
      scheduleBroadcast(true, true);
      sendResponse?.({ ok: true });
      return true;
    }
    default:
      break;
  }

  return undefined;
});

function subscribeToDocumentChanges() {
  if (documentObserver) {
    return;
  }

  documentObserver = new MutationObserver((mutations) => {
    if (mutationsAffectFunctionLock(mutations)) {
      refreshTrackedButton();
    }
  });

  documentObserver.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
  });
}

function mutationsAffectFunctionLock(mutations) {
  if (!Array.isArray(mutations) || mutations.length === 0) {
    return false;
  }

  const currentButton = getTrackedButton();

  for (const mutation of mutations) {
    if (!mutation) {
      continue;
    }

    if (mutation.type === "childList") {
      if (
        currentButton &&
        (nodesIncludeTrackedButton(mutation.addedNodes, currentButton) ||
          nodesIncludeTrackedButton(mutation.removedNodes, currentButton))
      ) {
        return true;
      }

      if (
        currentButton &&
        currentButton !== mutation.target &&
        mutation.target instanceof Node &&
        currentButton.contains(mutation.target)
      ) {
        continue;
      }

      if (nodeContainsFunctionLock(mutation.target)) {
        return true;
      }

      for (const node of mutation.addedNodes || []) {
        if (nodeContainsFunctionLock(node)) {
          return true;
        }
      }

      for (const node of mutation.removedNodes || []) {
        if (nodeContainsFunctionLock(node)) {
          return true;
        }
      }
    }
  }

  return false;
}

function nodeContainsFunctionLock(node) {
  if (!node) {
    return false;
  }

  if (node instanceof Element) {
    if (node.matches(FUNCTION_LOCK_SELECTOR)) {
      return true;
    }

    if (typeof node.querySelector === "function") {
      return Boolean(node.querySelector(FUNCTION_LOCK_SELECTOR));
    }
  }

  if (node instanceof Document) {
    return Boolean(node.querySelector?.(FUNCTION_LOCK_SELECTOR));
  }

  if (node instanceof DocumentFragment) {
    return Boolean(node.querySelector?.(FUNCTION_LOCK_SELECTOR));
  }

  return false;
}

function nodesIncludeTrackedButton(nodes, button) {
  if (!button || !nodes) {
    return false;
  }

  for (const node of nodes) {
    if (!node) {
      continue;
    }

    if (node === button) {
      return true;
    }

    if (node instanceof Element && node.contains(button)) {
      return true;
    }
  }

  return false;
}

function refreshTrackedButton() {
  const candidate = document.querySelector(FUNCTION_LOCK_SELECTOR);
  if (!candidate) {
    if (trackedButton) {
      detachButtonObserver();
      detachButtonClickHandler();
      clearNodeKeyAttributes(trackedButton);
      resetNodeMappings();

      if (trackedButton.isConnected) {
        trackedButton.classList.remove(HIDDEN_CLASS, SENSITIVE_CLASS);
      }

      trackedButton = null;
      invalidateMirrorSnapshot();
      scheduleBroadcast(true);
    }
    return;
  }

  if (candidate === trackedButton && candidate?.isConnected) {
    applyVisibilityState();
    markMirrorDirty();
    scheduleBroadcast();
    return;
  }

  detachButtonObserver();
  detachButtonClickHandler();
  clearNodeKeyAttributes(trackedButton);
  resetNodeMappings();

  if (trackedButton && trackedButton.isConnected) {
    trackedButton.classList.remove(HIDDEN_CLASS, SENSITIVE_CLASS);
  }

  if (candidate && candidate.isConnected) {
    trackedButton = candidate;
    applyVisibilityState();
    attachButtonObserver(candidate);
  } else {
    trackedButton = null;
  }

  invalidateMirrorSnapshot();
  scheduleBroadcast(true);
}

function attachButtonObserver(button) {
  detachButtonObserver();

  buttonObserver = new MutationObserver(() => {
    markMirrorDirty();
    scheduleBroadcast();
  });

  buttonObserver.observe(button, {
    attributes: true,
    attributeFilter: [
      "class",
      "disabled",
      "aria-disabled",
      "data-state",
      "style",
    ],
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function detachButtonObserver() {
  if (buttonObserver) {
    buttonObserver.disconnect();
    buttonObserver = null;
  }
}

function detachButtonClickHandler() {
  if (trackedButton && buttonClickHandler) {
    trackedButton.removeEventListener("click", buttonClickHandler, true);
  }
}

function getTrackedButton() {
  if (trackedButton && trackedButton.isConnected) {
    return trackedButton;
  }
  return null;
}

function applyVisibilityState() {
  const button = getTrackedButton();
  if (!button) {
    return;
  }

  button.classList.remove(HIDDEN_CLASS, SENSITIVE_CLASS);

  if (!popupActive) {
    return;
  }

  if (sensitiveModeEnabled) {
    button.classList.add(SENSITIVE_CLASS);
  } else {
    button.classList.add(HIDDEN_CLASS);
  }
}

function handleFunctionLockClick() {
  freezeAvatarsIfPossible();
}

function freezeAvatarsIfPossible() {
  if (!popupActive) {
    return;
  }

  const containers = document.querySelectorAll(AVATAR_CONTAINER_SELECTOR);
  if (!containers || containers.length === 0) {
    return;
  }

  let frozeAny = false;

  containers.forEach((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }

    const container = canvas.parentNode;
    const playerInfo = container.parentNode;

    const dataUrl = safeCanvasToDataUrl(canvas);
    if (!dataUrl) {
      return;
    }

    let overlay = container.querySelector(`[${AVATAR_OVERLAY_ATTR}="overlay"]`);
    if (overlay instanceof HTMLImageElement) {
      overlay.src = dataUrl;
    } else {
      overlay = document.createElement("img");
      overlay.src = dataUrl;
      overlay.setAttribute(AVATAR_OVERLAY_ATTR, "overlay");
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.pointerEvents = "none";

      container.appendChild(overlay);
    }

    canvas.style.display = "none";
    frozeAny = true;
    const clonedContainer = container.cloneNode(true);
    clonedContainer.id = "geo-streamr-avatar-clone";
    container.style.display = "none";
    playerInfo.appendChild(clonedContainer);
  });
  if (frozeAny) {
    browser.runtime.sendMessage({ type: "geo-streamr/kill-audio-loop" });
    browser.runtime.sendMessage({ type: "geo-streamr/start-queue" });
    avatarFreezeActive = true;
    setTimeout(() => startAvatarFreezePolling(), 100);
  }
}

function safeCanvasToDataUrl(canvas) {
  try {
    return canvas.toDataURL("image/png");
  } catch (error) {
    console.debug("GeoStreamr avatar freeze capture failed:", error);
    return null;
  }
}

function startAvatarFreezePolling() {
  stopAvatarFreezePolling();
  avatarFreezePollingId = setInterval(() => {
    if (!avatarFreezeActive) {
      stopAvatarFreezePolling();
      return;
    }

    const dotsPresent = Boolean(document.querySelector(DOTS_SELECTOR));

    if (!dotsPresent) {
      console.debug("Dots disappeared, unfreezing avatars");
      stopAvatarFreezePolling();
      unfreezeAvatars();
      dispatchResizeEvent();
    }
  }, 20);
}

function stopAvatarFreezePolling() {
  if (avatarFreezePollingId) {
    clearInterval(avatarFreezePollingId);
    avatarFreezePollingId = null;
  }
}

function unfreezeAvatars() {
  browser.runtime.sendMessage({ type: "geo-streamr/restore-audio" });
  browser.runtime.sendMessage({ type: "geo-streamr/end-queue" });
  const clonedContainer = document.getElementById("geo-streamr-avatar-clone");
  if (clonedContainer) clonedContainer.parentNode?.removeChild(clonedContainer);
  const containers = document.querySelectorAll(AVATAR_CONTAINER_SELECTOR);
  if (!containers || containers.length === 0) {
    avatarFreezeActive = false;
    stopAvatarFreezePolling();
    return;
  }

  containers.forEach((canvas) => {
    const container = canvas.parentNode;
    container.style.display = "flex";
    const overlay = container.querySelector(
      `[${AVATAR_OVERLAY_ATTR}="overlay"]`
    );
    if (overlay) {
      overlay.remove();
    }
    canvas.style.removeProperty("display");
  });

  avatarFreezeActive = false;
  stopAvatarFreezePolling();
}

function dispatchResizeEvent() {
  try {
    window.dispatchEvent(new Event("resize"));
  } catch (error) {
    console.debug("GeoStreamr resize dispatch failed:", error);
  }
}

function injectAudioBridge() {
  try {
    const root = document.documentElement;
    if (root?.dataset?.geoStreamrAudioBridge === "ready") {
      window.dispatchEvent(new CustomEvent("geo-streamr:audio-bootstrap"));
      return;
    }

    if (document.getElementById(AUDIO_BRIDGE_SCRIPT_ID)) {
      window.dispatchEvent(new CustomEvent("geo-streamr:audio-bootstrap"));
      return;
    }

    const script = document.createElement("script");
    script.id = AUDIO_BRIDGE_SCRIPT_ID;
    script.type = "text/javascript";
    script.src = browser.runtime.getURL("audio-bridge.js");
    script.addEventListener("load", () => {
      window.dispatchEvent(new CustomEvent("geo-streamr:audio-bootstrap"));
      script.remove();
    });
    script.addEventListener("error", (error) => {
      console.debug("GeoStreamr audio bridge load failed:", error);
    });

    (document.head || document.documentElement).appendChild(script);
  } catch (error) {
    console.debug("GeoStreamr audio bridge injection error:", error);
  }
}

let lastExecution = 0;
const MIN_BROADCAST_INTERVAL = 400;

function invalidateMirrorSnapshot() {
  lastMirrorSnapshot = null;
  pendingForceSend = false;
  mirrorDirty = true;
}

function markMirrorDirty() {
  mirrorDirty = true;
}

function scheduleBroadcast(forceImmediate = false, forceSend = false) {
  if (forceSend) {
    pendingForceSend = true;
  }

  if (!forceSend && !mirrorDirty) {
    return Promise.resolve();
  }

  if (forceImmediate) {
    if (broadcastTimerId) {
      clearTimeout(broadcastTimerId);
      broadcastTimerId = null;
    }
    lastExecution = Date.now();
    const shouldForce = forceSend || pendingForceSend;
    pendingForceSend = false;
    sendMirrorUpdate(shouldForce);
    return Promise.resolve();
  }

  if (broadcastTimerId) {
    return Promise.resolve();
  }

  const now = Date.now();
  const elapsed = now - lastExecution;

  if (elapsed >= MIN_BROADCAST_INTERVAL) {
    lastExecution = now;
    const shouldForce = pendingForceSend;
    pendingForceSend = false;
    sendMirrorUpdate(shouldForce);
    return Promise.resolve();
  }

  const delay = MIN_BROADCAST_INTERVAL - elapsed;
  broadcastTimerId = setTimeout(() => {
    broadcastTimerId = null;
    lastExecution = Date.now();
    const shouldForce = pendingForceSend;
    pendingForceSend = false;
    sendMirrorUpdate(shouldForce);
  }, delay);

  return Promise.resolve();
}

function sendMirrorUpdate(forceSend = false) {
  try {
    const connected = Boolean(popupActive);
    if (!connected) {
      invalidateMirrorSnapshot();
      return;
    }

    const payload = buildMirrorPayload();
    const snapshot = createMirrorSnapshot(payload);
    const changed = forceSend || hasMirrorStateChanged(snapshot);

    if (!changed) {
      mirrorDirty = false;
      return;
    }

    payload.timestamp = Date.now();
    lastMirrorSnapshot = snapshot;
    mirrorDirty = false;
    browser.runtime.sendMessage(payload);
  } catch (error) {
    mirrorDirty = true;
    console.debug("GeoStreamr mirror broadcast failed:", error);
  }
}

function buildMirrorPayload() {
  const button = getTrackedButton();

  if (!button) {
    return {
      type: "geo-streamr/mirror-update",
      available: false,
      hiddenInPage: popupActive,
      html: null,
      disabled: true,
    };
  }

  return {
    type: "geo-streamr/mirror-update",
    available: true,
    hiddenInPage: popupActive,
    html: buildMirroredMarkup(button),
    disabled: !isButtonInteractable(button),
  };
}

function createMirrorSnapshot(payload) {
  if (!payload) {
    return null;
  }

  return {
    available: Boolean(payload.available),
    hiddenInPage: Boolean(payload.hiddenInPage),
    disabled: Boolean(payload.disabled),
    html: typeof payload.html === "string" ? payload.html : null,
  };
}

function hasMirrorStateChanged(nextSnapshot) {
  if (!nextSnapshot) {
    return Boolean(lastMirrorSnapshot);
  }

  if (!lastMirrorSnapshot) {
    return true;
  }

  return (
    lastMirrorSnapshot.available !== nextSnapshot.available ||
    lastMirrorSnapshot.hiddenInPage !== nextSnapshot.hiddenInPage ||
    lastMirrorSnapshot.disabled !== nextSnapshot.disabled ||
    lastMirrorSnapshot.html !== nextSnapshot.html
  );
}

function buildHandshakePayload() {
  const button = getTrackedButton();
  return {
    ok: true,
    hasButton: Boolean(button),
    html: button ? buildMirroredMarkup(button) : null,
    disabled: button ? !isButtonInteractable(button) : true,
    hiddenInPage: popupActive,
  };
}

function buildMirroredMarkup(button) {
  const clone = button.cloneNode(true);
  clone.setAttribute(MIRROR_ROOT_ATTR, "true");

  const pseudoRules = [];
  syncCloneTree(button, clone, pseudoRules);

  if (button.classList.contains(SENSITIVE_CLASS)) {
    restoreSensitiveClone(clone);
  }

  if (pseudoRules.length > 0) {
    const wrapper = document.createElement("div");
    const style = document.createElement("style");
    style.setAttribute("data-geo-streamr-pseudo", "true");
    style.textContent = pseudoRules.join("\n");
    wrapper.appendChild(style);
    wrapper.appendChild(clone);
    return wrapper.innerHTML;
  }

  return clone.outerHTML;
}

function collectStyleOverrides(computedStyle) {
  if (!computedStyle) {
    return [];
  }

  const overrides = [];
  const textOverflow = computedStyle.getPropertyValue("text-overflow");
  if (textOverflow && textOverflow.trim() === "ellipsis") {
    overrides.push("text-overflow: clip !important");
    overrides.push("overflow: visible !important");
  }

  return overrides;
}

function convertToAbsoluteUrl(urlValue) {
  if (!urlValue) {
    return urlValue;
  }

  const trimmed = urlValue.trim();
  if (!trimmed) {
    return urlValue;
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("data:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("javascript:") ||
    lower.startsWith("about:") ||
    trimmed.startsWith("#")
  ) {
    return urlValue;
  }

  try {
    return new URL(trimmed, window.location.href).href;
  } catch (_error) {
    return urlValue;
  }
}

function rewriteSrcset(value) {
  if (!value) {
    return value;
  }

  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const whitespaceIndex = entry.search(/\s/);
      if (whitespaceIndex === -1) {
        return convertToAbsoluteUrl(entry);
      }

      const urlPart = entry.slice(0, whitespaceIndex);
      const descriptor = entry.slice(whitespaceIndex).trim();
      const absoluteUrl = convertToAbsoluteUrl(urlPart);
      return descriptor ? `${absoluteUrl} ${descriptor}` : absoluteUrl;
    });

  return entries.join(", ");
}

function rewriteResourceAttributes(source, target) {
  if (!source || !target || source.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const absoluteAttrs = ["src", "href", "poster"];
  absoluteAttrs.forEach((attr) => {
    if (source.hasAttribute(attr)) {
      const original = source.getAttribute(attr);
      const rewritten = convertToAbsoluteUrl(original);
      if (rewritten && rewritten !== original) {
        target.setAttribute(attr, rewritten);
      }
    }
  });

  const srcsetAttrs = ["srcset"];
  srcsetAttrs.forEach((attr) => {
    if (source.hasAttribute(attr)) {
      const original = source.getAttribute(attr);
      const rewritten = rewriteSrcset(original);
      if (rewritten && rewritten !== original) {
        target.setAttribute(attr, rewritten);
      }
    }
  });

  const dataAttrs = ["data-src", "data-srcset", "data-background-image"];
  dataAttrs.forEach((attr) => {
    if (source.hasAttribute(attr)) {
      const original = source.getAttribute(attr);
      const rewritten = attr.endsWith("srcset")
        ? rewriteSrcset(original)
        : convertToAbsoluteUrl(original);
      if (rewritten && rewritten !== original) {
        target.setAttribute(attr, rewritten);
      }
    }
  });
}

function ensureBaselineStyleHost() {
  if (baselineStyleHost && baselineStyleHost.isConnected) {
    return baselineStyleHost;
  }

  baselineStyleHost = document.createElement("div");
  baselineStyleHost.setAttribute("data-geo-streamr-style-host", "true");
  baselineStyleHost.style.cssText =
    "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;opacity:0;z-index:-1;";

  const parent = document.body || document.documentElement;
  if (parent) {
    parent.appendChild(baselineStyleHost);
  } else {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        const fallbackParent = document.body || document.documentElement;
        if (
          baselineStyleHost &&
          fallbackParent &&
          !baselineStyleHost.isConnected
        ) {
          fallbackParent.appendChild(baselineStyleHost);
        }
      },
      { once: true }
    );
  }

  return baselineStyleHost;
}

function ensureColorNormalizationElement() {
  const host = ensureBaselineStyleHost();
  if (colorNormalizationElement && colorNormalizationElement.isConnected) {
    return colorNormalizationElement;
  }

  colorNormalizationElement = document.createElement("div");
  colorNormalizationElement.setAttribute(
    "data-geo-streamr-color-probe",
    "true"
  );
  colorNormalizationElement.style.cssText =
    "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;opacity:0;";
  host.appendChild(colorNormalizationElement);
  return colorNormalizationElement;
}

function getBaselineComputedStyle(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const tagName = element.tagName?.toLowerCase();
  if (!tagName) {
    return null;
  }

  const cached = baselineStyleCache.get(tagName);
  if (cached && cached.element && cached.element.isConnected) {
    return cached.style;
  }

  const host = ensureBaselineStyleHost();
  const baselineElement = document.createElement(tagName);
  baselineElement.setAttribute("data-geo-streamr-style-baseline", tagName);
  baselineElement.style.all = "initial";
  host.appendChild(baselineElement);

  const computed = window.getComputedStyle(baselineElement);
  baselineStyleCache.set(tagName, {
    element: baselineElement,
    style: computed,
  });

  return computed;
}

function normalizeStyleValue(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : value;
}

function isColorProperty(property) {
  if (typeof property !== "string") {
    return false;
  }
  return (
    property.endsWith("color") ||
    property === "fill" ||
    property === "stroke" ||
    property === "stop-color"
  );
}

function normalizeColor(value) {
  if (typeof value !== "string" || !value.trim()) {
    return value;
  }

  try {
    const probe = ensureColorNormalizationElement();
    probe.style.color = value;
    return window.getComputedStyle(probe).color;
  } catch (_error) {
    return value;
  }
}

function stylesEqual(property, first, second) {
  const normalizedFirst = normalizeStyleValue(first);
  const normalizedSecond = normalizeStyleValue(second);

  if (normalizedFirst === normalizedSecond) {
    return true;
  }

  if (isColorProperty(property)) {
    return normalizeColor(normalizedFirst) === normalizeColor(normalizedSecond);
  }

  return false;
}

function isLikelyAutoDimension(sourceElement, property, value) {
  if (!sourceElement || !value) {
    return false;
  }

  if (!/px$/i.test(value)) {
    return false;
  }

  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return false;
  }

  const clientHeight = sourceElement.clientHeight || 0;
  const scrollHeight = sourceElement.scrollHeight || 0;

  if (property === "height" || property === "block-size") {
    const effective = Math.max(clientHeight, scrollHeight);
    if (effective && effective > numeric + 0.5) {
      return true;
    }
  }

  return false;
}

function applyInlineStyles(source, target) {
  if (
    !source ||
    !target ||
    source.nodeType !== Node.ELEMENT_NODE ||
    target.nodeType !== Node.ELEMENT_NODE
  ) {
    return;
  }

  const computed = window.getComputedStyle(source);
  const inlineStyle = buildInlineStyleString(
    computed,
    source,
    source.getAttribute("style")
  );

  const enforced = [
    "visibility: visible !important",
    "opacity: 1 !important",
    "pointer-events: auto !important",
  ];
  const overrides = collectStyleOverrides(computed);
  const styleValue = [inlineStyle, ...enforced, ...overrides]
    .filter(Boolean)
    .join("; ");
  if (styleValue) {
    target.setAttribute("style", styleValue);
  }

  const sourceChildren = Array.from(source.childNodes);
  const targetChildren = Array.from(target.childNodes);

  for (let index = 0; index < targetChildren.length; index += 1) {
    const sourceChild = sourceChildren[index];
    const targetChild = targetChildren[index];

    if (
      sourceChild &&
      sourceChild.nodeType === Node.ELEMENT_NODE &&
      targetChild.nodeType === Node.ELEMENT_NODE
    ) {
      applyInlineStyles(sourceChild, targetChild);
    }
  }
}

function buildInlineStyleString(
  computedStyle,
  sourceElement,
  inlineFromSource
) {
  if (!computedStyle) {
    return inlineFromSource || "";
  }

  const styleParts = [];
  const baseline = getBaselineComputedStyle(sourceElement);

  try {
    const totalProperties = computedStyle.length || 0;

    for (let index = 0; index < totalProperties; index += 1) {
      const prop = computedStyle[index];
      if (!prop || prop.startsWith("--")) {
        continue;
      }

      const value = computedStyle.getPropertyValue(prop);
      if (!value) {
        continue;
      }

      const trimmed = value.trim();
      if (!trimmed || trimmed === "auto" || trimmed === "normal") {
        continue;
      }

      const baselineValue = baseline?.getPropertyValue(prop) ?? "";
      const isEssential = ESSENTIAL_STYLE_PROPERTIES.has(prop);
      if (
        !isEssential &&
        baselineValue &&
        stylesEqual(prop, trimmed, baselineValue)
      ) {
        continue;
      }

      const inlineAuthoredValue =
        sourceElement instanceof Element
          ? sourceElement.style.getPropertyValue(prop)
          : "";
      const hasInlineAuthored =
        typeof inlineAuthoredValue === "string" &&
        inlineAuthoredValue.trim().length > 0;

      if (
        DYNAMIC_DIMENSION_PROPERTIES.has(prop) &&
        !hasInlineAuthored &&
        isLikelyAutoDimension(sourceElement, prop, trimmed)
      ) {
        continue;
      }

      styleParts.push(`${prop}:${trimmed}`);
    }
  } catch (error) {
    console.debug("GeoStreamr style extraction warning:", error);
  }

  if (inlineFromSource) {
    styleParts.push(inlineFromSource);
  }

  return styleParts.join("; ");
}

function syncCloneTree(source, target, pseudoRules) {
  if (
    !source ||
    !target ||
    source.nodeType !== Node.ELEMENT_NODE ||
    target.nodeType !== Node.ELEMENT_NODE
  ) {
    return;
  }

  const nodeKey = registerNodeKey(source);
  if (nodeKey) {
    target.setAttribute(NODE_KEY_ATTR, nodeKey);
    if (Array.isArray(pseudoRules)) {
      appendPseudoElementRules(source, nodeKey, pseudoRules);
    }
  }

  target.classList.remove(HIDDEN_CLASS, SENSITIVE_CLASS);
  applyInlineStyles(source, target);
  rewriteResourceAttributes(source, target);

  const sourceChildren = Array.from(source.childNodes);
  const targetChildren = Array.from(target.childNodes);

  for (let index = 0; index < targetChildren.length; index += 1) {
    const sourceChild = sourceChildren[index];
    const targetChild = targetChildren[index];

    if (
      sourceChild &&
      targetChild &&
      sourceChild.nodeType === Node.ELEMENT_NODE &&
      targetChild.nodeType === Node.ELEMENT_NODE
    ) {
      syncCloneTree(sourceChild, targetChild, pseudoRules);
    }
  }
}

function appendPseudoElementRules(sourceElement, nodeKey, pseudoRules) {
  if (!sourceElement || !nodeKey || !Array.isArray(pseudoRules)) {
    return;
  }

  if (
    typeof sourceElement.matches === "function" &&
    sourceElement.matches(PSEUDO_SKIP_SELECTOR)
  ) {
    return;
  }

  const beforeRule = buildPseudoElementRule(sourceElement, nodeKey, "::before");
  if (beforeRule) {
    pseudoRules.push(beforeRule);
  }

  const afterRule = buildPseudoElementRule(sourceElement, nodeKey, "::after");
  if (afterRule) {
    pseudoRules.push(afterRule);
  }
}

function buildPseudoElementRule(sourceElement, nodeKey, pseudo) {
  if (!sourceElement || !nodeKey || !pseudo) {
    return null;
  }

  let computed;
  try {
    computed = window.getComputedStyle(sourceElement, pseudo);
  } catch (_error) {
    return null;
  }

  if (!computed) {
    return null;
  }

  const contentValue = computed.getPropertyValue("content")?.trim();
  const backgroundImage = computed.getPropertyValue("background-image")?.trim();
  const opacityValue = computed.getPropertyValue("opacity")?.trim();
  const displayValue = computed.getPropertyValue("display")?.trim();

  const hasContent = Boolean(
    contentValue && contentValue !== "none" && contentValue !== "normal"
  );
  const hasBackground = Boolean(backgroundImage && backgroundImage !== "none");
  const hasOpacity = Boolean(
    opacityValue && Number.parseFloat(opacityValue) > 0
  );
  const hasDisplay = Boolean(displayValue && displayValue !== "none");

  if (!hasContent && !hasBackground && !hasOpacity) {
    return null;
  }

  const declarations = [];
  PSEUDO_STYLE_PROPERTIES.forEach((property) => {
    let value;
    try {
      value = computed.getPropertyValue(property);
    } catch (_error) {
      value = "";
    }
    if (!value) {
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    if (
      property === "content" &&
      (trimmed === "none" || trimmed === "normal")
    ) {
      return;
    }

    if (
      property !== "content" &&
      (trimmed === "auto" ||
        trimmed === "normal" ||
        (property === "display" && !hasDisplay))
    ) {
      return;
    }

    const rewritten = rewriteCssPropertyValue(property, trimmed);
    if (!rewritten) {
      return;
    }

    declarations.push(`${property}: ${rewritten}`);
  });

  if (!declarations.length) {
    return null;
  }

  const escapedKey = escapeNodeKeyForSelector(nodeKey);
  const selector = `[${NODE_KEY_ATTR}="${escapedKey}"]${pseudo}`;
  return `${selector} { ${declarations.join("; ")} }`;
}

function escapeNodeKeyForSelector(key) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(key);
  }
  return key.replace(/["\\]/g, "\\$&");
}

function rewriteCssPropertyValue(property, value) {
  if (!value) {
    return value;
  }

  if (property === "content") {
    return value;
  }

  if (value.includes("url(")) {
    return rewriteCssUrls(value);
  }

  return value;
}

function rewriteCssUrls(value) {
  if (!value) {
    return value;
  }

  return value.replace(/url\(([^)]+)\)/gi, (match, raw) => {
    if (!raw) {
      return match;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return match;
    }

    const unquoted = trimmed.replace(/^['"]|['"]$/g, "");
    const absolute = convertToAbsoluteUrl(unquoted);
    if (!absolute || absolute === unquoted) {
      return match;
    }

    const quote = trimmed.startsWith('"')
      ? '"'
      : trimmed.startsWith("'")
      ? "'"
      : "";
    return `url(${quote}${absolute}${quote})`;
  });
}

function registerNodeKey(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  let key = nodeIdLookup.get(node);
  if (!key) {
    const currentId = nextNodeId++;
    key = `geo-streamr-node-${currentId}`;
    nodeIdLookup.set(node, key);
  }

  node.setAttribute(NODE_KEY_ATTR, key);
  nodeFromId.set(key, node);
  return key;
}

function resolveNodeByKey(key) {
  if (!key) {
    return null;
  }

  const node = nodeFromId.get(key);
  if (node && node.isConnected) {
    return node;
  }

  const escapedKey =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(key)
      : key.replace(/"/g, '\\"');

  const fallback = document.querySelector(`[${NODE_KEY_ATTR}="${escapedKey}"]`);
  if (fallback) {
    nodeFromId.set(key, fallback);
    return fallback;
  }

  return null;
}

function resetNodeMappings() {
  nodeIdLookup = new WeakMap();
  nodeFromId.clear();
  nextNodeId = 1;
  invalidateMirrorSnapshot();
}

function clearNodeKeyAttributes(root) {
  if (!root || root.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  root.removeAttribute(NODE_KEY_ATTR);
  root
    .querySelectorAll(`[${NODE_KEY_ATTR}]`)
    .forEach((node) => node.removeAttribute(NODE_KEY_ATTR));
}

function resolveMirroredTarget(message) {
  if (!message || typeof message !== "object") {
    return null;
  }

  const orderedKeys = [];

  if (typeof message.targetKey === "string") {
    orderedKeys.push(message.targetKey);
  }

  if (Array.isArray(message.pathKeys)) {
    for (const key of message.pathKeys) {
      if (typeof key === "string" && !orderedKeys.includes(key)) {
        orderedKeys.push(key);
      }
    }
  }

  for (const key of orderedKeys) {
    const node = resolveNodeByKey(key);
    if (node) {
      return node;
    }
  }

  return null;
}

function dispatchMirroredEvent(target, eventType) {
  if (!target) {
    return false;
  }

  const type = eventType || "click";

  try {
    if (type === "click") {
      if (typeof target.click === "function") {
        target.click();
      } else {
        target.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true })
        );
      }
      return true;
    }

    if (type === "pointerdown" || type === "pointerup") {
      if (typeof PointerEvent === "function") {
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerType: "mouse",
          })
        );
      }

      const mouseType = type === "pointerdown" ? "mousedown" : "mouseup";
      target.dispatchEvent(
        new MouseEvent(mouseType, { bubbles: true, cancelable: true })
      );
      return true;
    }

    return target.dispatchEvent(
      new Event(type, { bubbles: true, cancelable: true })
    );
  } catch (error) {
    console.debug("GeoStreamr event dispatch failed:", error);
    return false;
  }
}

function isButtonInteractable(button) {
  if (!button) {
    return false;
  }

  if (button.disabled) {
    return false;
  }

  const ariaDisabled = button.getAttribute("aria-disabled");
  if (ariaDisabled && ariaDisabled.toLowerCase() === "true") {
    return false;
  }

  return true;
}

function ensureHideStyle() {
  if (document.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = `
    ${FUNCTION_LOCK_SELECTOR}.${HIDDEN_CLASS}:not(:has(${ONGOING_GAME_SELECTOR})) {
      visibility: hidden !important;
      pointer-events: none !important;
    }

    ${FUNCTION_LOCK_SELECTOR}.${SENSITIVE_CLASS}:not(:has(${ONGOING_GAME_SELECTOR})) {
      position: relative !important;
      pointer-events: none !important;
    }

    ${FUNCTION_LOCK_SELECTOR}.${SENSITIVE_CLASS} > * > * {
      position: relative !important;
      height: 156px;
    }

    ${FUNCTION_LOCK_SELECTOR}.${SENSITIVE_CLASS} > * > * > * {
      visibility: hidden !important;
    }

    ${FUNCTION_LOCK_SELECTOR}.${SENSITIVE_CLASS} > * > *::before {
      content: "";
      display: block;
      width: 60px;
      height: 60px;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      mask: url("data:image/svg+xml,%3Csvg%20version%3D%271.1%27%20xmlns%3D%27http://www.w3.org/2000/svg%27%20width%3D%2724px%27%20height%3D%2724px%27%20viewBox%3D%270,0,256,256%27%3E%3Cg%20fill%3D%27%23000000%27%3E%3Cg%20transform%3D%27scale(10.66667,10.66667)%27%3E%3Cpath%20d%3D%27M3.70703,2.29297l-1.41406,1.41406l2.77539,2.77539c-0.53911,0.43949-1.0198,0.90759-1.44922,1.37695c-1.83,2.04-2.61914,4.14063-2.61914,4.14063c0,0,3,8,11,8c1.2,0,2.28953-0.18023,3.26953-0.49023c0.71911-0.21973,1.37911-0.5082,1.97852-0.84766l3.04492,3.04492l1.41406-1.41406zM12,4c-1.2,0-2.28953,0.18023-3.26953,0.49023l1.66016,1.66016c0.5-0.1,1.03937-0.15039,1.60938-0.15039c5.28,0,7.94055,4.27,8.81055,6c-0.33,0.66-0.93961,1.7007-1.84961,2.7207l1.41992,1.41992c1.83-2.04,2.61914-4.14062,2.61914-4.14062c0,0-3-8-11-8zM6.48828,7.90234l2.07031,2.07031c-0.35915,0.59947-0.55859,1.28827-0.55859,2.02734c0,0.08-0.00023,0.17,0.00977,0.25c0.12,2.01,1.73023,3.62023,3.74023,3.74023c0.08,0.01,0.17,0.00977,0.25,0.00977c0.73907,0,1.42787-0.19945,2.02734-0.55859l1.73047,1.73047c-0.64941,0.30948-1.36933,0.54788-2.14844,0.67773c-0.51,0.1-1.03937,0.15039-1.60937,0.15039c-5.28,0-7.94055-4.27-8.81055-6c0.33-0.66,0.92961-1.7007,1.84961-2.7207c0.40945-0.46937,0.90011-0.93746,1.44922-1.37695zM12.25,8.00977l3.74023,3.74023c-0.12-2.01-1.73023-3.62023-3.74023-3.74023zM10.07031,11.48438l2.44531,2.44531c-0.15911,0.04919-0.33695,0.07031-0.51562,0.07031c-1.1,0-2-0.9-2-2c0-0.17867,0.02112-0.35651,0.07031-0.51562z%27%3E%3C/path%3E%3C/g%3E%3C/g%3E%3C/svg%3E") center / contain no-repeat;
      -webkit-mask: url("data:image/svg+xml,%3Csvg%20version%3D%271.1%27%20xmlns%3D%27http://www.w3.org/2000/svg%27%20width%3D%2724px%27%20height%3D%2724px%27%20viewBox%3D%270,0,256,256%27%3E%3Cg%20fill%3D%27%23000000%27%3E%3Cg%20transform%3D%27scale(10.66667,10.66667)%27%3E%3Cpath%20d%3D%27M3.70703,2.29297l-1.41406,1.41406l2.77539,2.77539c-0.53911,0.43949-1.0198,0.90759-1.44922,1.37695c-1.83,2.04-2.61914,4.14063-2.61914,4.14063c0,0,3,8,11,8c1.2,0,2.28953-0.18023,3.26953-0.49023c0.71911-0.21973,1.37911-0.5082,1.97852-0.84766l3.04492,3.04492l1.41406-1.41406zM12,4c-1.2,0-2.28953,0.18023-3.26953,0.49023l1.66016,1.66016c0.5-0.1,1.03937-0.15039,1.60938-0.15039c5.28,0,7.94055,4.27,8.81055,6c-0.33,0.66-0.93961,1.7007-1.84961,2.7207l1.41992,1.41992c1.83-2.04,2.61914-4.14062,2.61914-4.14062c0,0-3-8-11-8zM6.48828,7.90234l2.07031,2.07031c-0.35915,0.59947-0.55859,1.28827-0.55859,2.02734c0,0.08-0.00023,0.17,0.00977,0.25c0.12,2.01,1.73023,3.62023,3.74023,3.74023c0.08,0.01,0.17,0.00977,0.25,0.00977c0.73907,0,1.42787-0.19945,2.02734-0.55859l1.73047,1.73047c-0.64941,0.30948-1.36933,0.54788-2.14844,0.67773c-0.51,0.1-1.03937,0.15039-1.60937,0.15039c-5.28,0-7.94055-4.27-8.81055-6c0.33-0.66,0.92961-1.7007,1.84961-2.7207c0.40945-0.46937,0.90011-0.93746,1.44922-1.37695zM12.25,8.00977l3.74023,3.74023c-0.12-2.01-1.73023-3.62023-3.74023-3.74023zM10.07031,11.48438l2.44531,2.44531c-0.15911,0.04919-0.33695,0.07031-0.51562,0.07031c-1.1,0-2-0.9-2-2c0-0.17867,0.02112-0.35651,0.07031-0.51562z%27%3E%3C/path%3E%3C/g%3E%3C/g%3E%3C/svg%3E") center / contain no-repeat;
      background-color: #e7e7e7;
    }

    .${POPUP_ACTIVE_CLASS} #overlay-portal-destination:has([class^="center-content_dotsAnimation"]) {
      display: none !important;
    }

    [class^="player-section_content"] [class^="footer_root__"] {
      visibility: hidden;
    }

    ${FUNCTION_LOCK_SELECTOR} > *:has(${ONGOING_GAME_SELECTOR}) > *::before {
      display: none !important;
    }

    ${FUNCTION_LOCK_SELECTOR} > * > :has(${ONGOING_GAME_SELECTOR}) > * {
      visibility: visible !important;
    }
  `;

  (document.head || document.documentElement).appendChild(style);
}

function syncPopupOverlayState() {
  const root = document.documentElement;
  if (!root) {
    return;
  }

  if (popupActive) {
    root.classList.add(POPUP_ACTIVE_CLASS);
  } else {
    root.classList.remove(POPUP_ACTIVE_CLASS);
  }
}

function restoreSensitiveClone(cloneRoot) {
  if (!cloneRoot || cloneRoot.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const wrapperNodes = cloneRoot.querySelectorAll(":scope > * > *");
  wrapperNodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }

    node.style.removeProperty("position");
    node.style.removeProperty("mask");
    node.style.removeProperty("-webkit-mask");
    node.style.removeProperty("background-color");
    node.style.removeProperty("pointer-events");
    cleanupEmptyStyleAttribute(node);
  });

  const hiddenNodes = cloneRoot.querySelectorAll(":scope > * > * > *");
  hiddenNodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }

    node.style.removeProperty("visibility");
    node.style.removeProperty("opacity");
    cleanupEmptyStyleAttribute(node);
  });
}

function cleanupEmptyStyleAttribute(element) {
  if (!element) {
    return;
  }

  const styleValue = element.getAttribute("style");
  if (!styleValue) {
    return;
  }

  if (element.style && element.style.length === 0) {
    element.removeAttribute("style");
    return;
  }

  const trimmed = styleValue.trim();
  if (!trimmed) {
    element.removeAttribute("style");
  }
}
