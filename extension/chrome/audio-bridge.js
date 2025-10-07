// Audio Bridge - Injected into MAIN world at document_start
// This patches AudioContext BEFORE GeoGuessr's code runs

(function () {
  "use strict";

  if (window.__GEO_STREAMR) {
    // Already initialized, skip
    return;
  }

  const API = (window.__GEO_STREAMR = {});
  API._tracked = {};

  // Capture originals immediately (before any other code runs)
  API._tracked.origConnect = AudioNode.prototype.connect;
  API._tracked.origDisconnect = AudioNode.prototype.disconnect;
  API._tracked.masterGains = new WeakMap();
  API._tracked.contexts = new Set();
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
  const origConnect = API._tracked.origConnect;
  AudioNode.prototype.connect = function (...args) {
    try {
      const target = args[0];
      // only modify connects when the target is the raw context.destination
      if (target && target.context && target === target.context.destination) {
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
})();
