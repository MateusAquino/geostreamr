// worker.js - Cloudflare Worker with KV binding + in-memory Map fallback
// Hosted at: https://geostreamer.mateusaqb.workers.dev/
// Requires KV binding named "MAILBOX"
// Usage:
// - Accepts POST /store and GET /get (with or without trailing slash)
// - Deletes stored value on GET (one-time read)

const IN_MEMORY_MAILBOX = new Map();

function makeCorsHeaders(request) {
  // Echo the Origin header if present (required if you ever use credentials).
  // Fallback to '*' if no origin (should rarely happen in browser requests).
  const origin = request?.headers?.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400", // cache preflight 24 hours
    // 'Access-Control-Allow-Credentials': 'true', // enable when using credentials
    Vary: "Origin",
  };
}

function corsResponse(body, init = {}, request) {
  const cors = makeCorsHeaders(request);
  init.headers = { ...(init.headers || {}), ...cors };
  return new Response(body, init);
}

export default {
  async fetch(request, env, ctx) {
    try {
      // Always handle preflight early
      if (request.method === "OPTIONS") {
        // Return empty body with CORS headers
        return corsResponse(null, { status: 204 }, request);
      }

      // Normalize path (strip trailing slash)
      const url = new URL(request.url);
      let pathname = url.pathname;
      if (pathname.endsWith("/") && pathname.length > 1)
        pathname = pathname.slice(0, -1);

      // KV wrapper that falls back to in-memory Map when KV isn't bound
      const kv = {
        async put(k, v, opts) {
          if (env && env.MAILBOX && typeof env.MAILBOX.put === "function") {
            // Cloudflare KV supports expiration in put opts; pass-through
            return env.MAILBOX.put(k, v, opts);
          } else {
            // in-memory fallback; ignore TTL
            IN_MEMORY_MAILBOX.set(k, v);
            return;
          }
        },
        async get(k) {
          if (env && env.MAILBOX && typeof env.MAILBOX.get === "function") {
            return env.MAILBOX.get(k);
          } else {
            return IN_MEMORY_MAILBOX.get(k) ?? null;
          }
        },
        async delete(k) {
          if (env && env.MAILBOX && typeof env.MAILBOX.delete === "function") {
            return env.MAILBOX.delete(k);
          } else {
            return IN_MEMORY_MAILBOX.delete(k);
          }
        },
      };

      // POST /store
      if (request.method === "POST" && pathname === "/store") {
        const ct = request.headers.get("content-type") || "";
        let body;
        if (ct.includes("application/json")) {
          body = await request.json().catch(() => null);
        } else {
          const txt = await request.text().catch(() => "");
          try {
            body = JSON.parse(txt);
          } catch (e) {
            // fallback: treat raw text as answer, session may be in query
            body = { session: url.searchParams.get("session"), answer: txt };
          }
        }

        const session = body && body.session;
        const answer = body && body.answer;
        if (!session || !answer) {
          console.log("Bad POST body", { session, gotAnswer: !!answer });
          const payload = JSON.stringify({
            error: "Bad Request: session and answer required",
          });
          return corsResponse(
            payload,
            { status: 400, headers: { "Content-Type": "application/json" } },
            request
          );
        }

        const TTL_SECONDS = 300;
        // If KV supports options, pass TTL; in-memory ignores it
        await kv
          .put(session, answer, { expirationTtl: TTL_SECONDS })
          .catch((err) => {
            console.error("KV put failed:", err);
          });

        console.log("Stored session", session);
        return corsResponse("OK", { status: 200 }, request);
      }

      // GET /get?session=...
      if (request.method === "GET" && pathname === "/get") {
        const session = url.searchParams.get("session");
        if (!session) {
          const payload = JSON.stringify({ error: "session query required" });
          return corsResponse(
            payload,
            { status: 400, headers: { "Content-Type": "application/json" } },
            request
          );
        }

        const answer = await kv.get(session);
        if (!answer) {
          // Not found — respond 404 with CORS
          return corsResponse("", { status: 404 }, request);
        }

        // delete after read (one-time)
        await kv
          .delete(session)
          .catch((err) => console.error("KV delete error:", err));
        console.log("Delivered and deleted session", session);
        return corsResponse(
          answer,
          { status: 200, headers: { "Content-Type": "text/plain" } },
          request
        );
      }

      // Fallback: not found
      return corsResponse(
        JSON.stringify({ error: "Not Found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
        request
      );
    } catch (err) {
      console.error("Worker error", err);
      const payload = JSON.stringify({ error: err?.message || String(err) });
      return corsResponse(
        payload,
        { status: 500, headers: { "Content-Type": "application/json" } },
        request
      );
    }
  },
};
