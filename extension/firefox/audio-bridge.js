(() => {
  const global = window;

  if (global.__GEO_STREAMR_AUDIO_BRIDGE_READY) {
    try {
      global.dispatchEvent(new CustomEvent("geo-streamr:audio-bootstrap"));
    } catch (error) {
      console.warn("GeoStreamr audio bridge bootstrap dispatch failed:", error);
    }
    return;
  }

  global.__GEO_STREAMR_AUDIO_BRIDGE_READY = true;
  try {
    const host = global.document?.documentElement;
    if (host) {
      host.dataset.geoStreamrAudioBridge = "ready";
    }
  } catch (error) {
    console.warn("GeoStreamr audio bridge dataset init failed:", error);
  }

  const API = (global.__GEO_STREAMR = global.__GEO_STREAMR || {});
  API._tracked = API._tracked || {};
  API._tracked.masterGains = API._tracked.masterGains || new WeakMap();
  API._tracked.contexts = API._tracked.contexts || new Set();

  const DOTS_SELECTOR = "[class^=center-content_dotsAnimation]";

  function ensureMasterGain(ctx) {
    if (!ctx) return null;
    if (API._tracked.masterGains.has(ctx)) {
      return API._tracked.masterGains.get(ctx);
    }

    try {
      const gainNode = ctx.createGain();
      gainNode.gain.value = 1;
      const origConnect = API._tracked.origConnect;
      if (origConnect) {
        try {
          origConnect.call(gainNode, ctx.destination);
        } catch (error) {
          try {
            gainNode.connect(ctx.destination);
          } catch (_ignored) {}
        }
      } else {
        try {
          gainNode.connect(ctx.destination);
        } catch (_ignored) {}
      }
      API._tracked.masterGains.set(ctx, gainNode);
      return gainNode;
    } catch (error) {
      console.warn("GeoStreamr gain node creation failed:", error);
      return null;
    }
  }

  function registerContext(ctx) {
    if (!ctx) {
      return;
    }

    API._tracked.contexts.add(ctx);
    ensureMasterGain(ctx);
  }

  function patchAudioNodePrototype() {
    const AudioNodePrototype = global.AudioNode && global.AudioNode.prototype;
    if (!AudioNodePrototype) {
      return;
    }

    if (!API._tracked.origConnect) {
      API._tracked.origConnect = AudioNodePrototype.connect;
    }

    if (!API._tracked.origDisconnect) {
      API._tracked.origDisconnect = AudioNodePrototype.disconnect;
    }

    if (
      AudioNodePrototype.__GEO_STREAMR_PATCHED_CONNECT ||
      typeof API._tracked.origConnect !== "function"
    ) {
      return;
    }

    const origConnect = API._tracked.origConnect;

    AudioNodePrototype.connect = function (...args) {
      try {
        const target = args[0];
        if (target && target.context && target === target.context.destination) {
          const ctx = target.context || this.context;
          registerContext(ctx);
          const masterGain = ensureMasterGain(ctx);
          if (masterGain) {
            return origConnect.call(this, masterGain, ...args.slice(1));
          }
        }
      } catch (error) {
        console.warn("GeoStreamr audio connect patch warning:", error);
      }
      return origConnect.apply(this, args);
    };

    AudioNodePrototype.__GEO_STREAMR_PATCHED_CONNECT = true;
  }

  function scanExistingAudioContexts() {
    try {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) {
        return;
      }

      const contexts = new Set();

      if (
        API._tracked.contexts &&
        typeof API._tracked.contexts.forEach === "function"
      ) {
        API._tracked.contexts.forEach((ctx) => contexts.add(ctx));
      }

      const SKIP_KEYS = new Set([
        "InstallTrigger",
        "sidebar",
        "external",
        "menubar",
        "toolbar",
        "statusbar",
        "locationbar",
      ]);
      const SKIP_PREFIXES = ["onmoz", "onwebkit", "MSPointer", "moz", "webkit"];
      const SKIP_NESTED_KEYS = new Set(["InstallTrigger"]);

      const keys = (() => {
        try {
          return Reflect.ownKeys(global);
        } catch (_error) {
          try {
            return Object.getOwnPropertyNames(global);
          } catch (_fallbackError) {
            return [];
          }
        }
      })();

      const INSPECTION_LIMIT = 500;
      let inspected = 0;

      for (const rawKey of keys) {
        if (contexts.size > 8) {
          break;
        }

        if (typeof rawKey !== "string") {
          continue;
        }

        const key = rawKey;

        if (SKIP_KEYS.has(key)) {
          continue;
        }

        if (SKIP_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          continue;
        }

        inspected += 1;
        if (inspected > INSPECTION_LIMIT) {
          break;
        }

        let descriptor;
        try {
          descriptor = Object.getOwnPropertyDescriptor(global, key);
        } catch (_descriptorError) {
          continue;
        }

        if (descriptor && typeof descriptor.get === "function") {
          continue;
        }

        let value;
        try {
          value = descriptor ? descriptor.value : global[key];
        } catch (_error) {
          continue;
        }

        if (!value) {
          continue;
        }

        if (value instanceof AC) {
          contexts.add(value);
          continue;
        }

        if (typeof value !== "object") {
          continue;
        }

        const nestedKeys = (() => {
          try {
            return Object.keys(value).slice(0, 20);
          } catch (_nestedKeysError) {
            return [];
          }
        })();

        for (const nestedKey of nestedKeys) {
          if (SKIP_NESTED_KEYS.has(nestedKey)) {
            continue;
          }

          if (SKIP_PREFIXES.some((prefix) => nestedKey.startsWith(prefix))) {
            continue;
          }

          let nestedDescriptor;
          try {
            nestedDescriptor = Object.getOwnPropertyDescriptor(
              value,
              nestedKey
            );
          } catch (_nestedDescriptorError) {
            continue;
          }

          if (nestedDescriptor && typeof nestedDescriptor.get === "function") {
            continue;
          }

          let nestedValue;
          try {
            nestedValue = nestedDescriptor
              ? nestedDescriptor.value
              : value[nestedKey];
          } catch (_nestedError) {
            continue;
          }

          if (nestedValue instanceof AC) {
            contexts.add(nestedValue);
          }
        }
      }

      contexts.forEach((ctx) => registerContext(ctx));
    } catch (error) {
      console.warn("GeoStreamr audio context scan failed:", error);
    }
  }

  API.muteCurrent = function () {
    try {
      API._tracked.contexts.forEach((ctx) => ensureMasterGain(ctx));
      API._tracked.contexts.forEach((ctx) => {
        try {
          const masterGain = API._tracked.masterGains.get(ctx);
          if (masterGain) {
            masterGain.gain.value = 0;
          }
        } catch (_error) {}
        try {
          if (typeof ctx.suspend === "function" && ctx.state === "running") {
            ctx.suspend().catch(() => {});
          }
        } catch (_suspendError) {}
      });
      return { ok: true };
    } catch (error) {
      return { error: String(error) };
    }
  };

  API.restoreCurrent = function () {
    try {
      API._tracked.contexts.forEach((ctx) => ensureMasterGain(ctx));
      API._tracked.contexts.forEach((ctx) => {
        try {
          const masterGain = API._tracked.masterGains.get(ctx);
          if (masterGain) {
            masterGain.gain.value = 1;
          }
        } catch (_error) {}
        try {
          if (
            typeof ctx.resume === "function" &&
            (ctx.state === "suspended" || ctx.state === "interrupted")
          ) {
            ctx.resume().catch(() => {});
          }
        } catch (_resumeError) {}
      });
      return { ok: true };
    } catch (error) {
      return { error: String(error) };
    }
  };

  function handleAudioControl(message) {
    if (!message || typeof message !== "object") {
      return { ok: false, reason: "invalid-message" };
    }

    if (message.type === "geo-streamr/kill-audio-loop") {
      if (API.muteInterval) {
        global.clearInterval(API.muteInterval);
      }

      API.muteCurrent();

      API.muteInterval = global.setInterval(() => {
        try {
          API.muteCurrent();
          if (!global.document.querySelector(DOTS_SELECTOR)) {
            global.clearInterval(API.muteInterval);
            API.muteInterval = null;
          }
        } catch (_error) {}
      }, 50);

      return { ok: true };
    }

    if (message.type === "geo-streamr/restore-audio") {
      if (API.muteInterval) {
        global.clearInterval(API.muteInterval);
        API.muteInterval = null;
      }

      return API.restoreCurrent();
    }

    return { ok: false, reason: "unknown-type" };
  }

  function bootstrapAudioBridge() {
    patchAudioNodePrototype();
    scanExistingAudioContexts();
  }

  try {
    global.addEventListener("geo-streamr:audio-control", (event) => {
      try {
        handleAudioControl(event?.detail);
      } catch (error) {
        console.warn("GeoStreamr audio control handler error:", error);
      }
    });

    global.addEventListener(
      "geo-streamr:audio-bootstrap",
      bootstrapAudioBridge
    );
  } catch (error) {
    console.warn("GeoStreamr audio bridge listener error:", error);
  }

  bootstrapAudioBridge();
})();
