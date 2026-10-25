import { planes } from "../_lib/relay.js";

// GET /api/planes?lat=&lon=&r=  nearby aircraft, relayed server-side.
// When HOME_RELAY_URL and HOME_RELAY_KEY are set, ask the home relay first (its home internet
// connection is not blocked by the flight networks) and fall back to fetching from Cloudflare.
export async function onRequestGet(context) {
  const { request, env } = context;
  if (env.HOME_RELAY_URL && env.HOME_RELAY_KEY) {
    try {
      const u = new URL(request.url);
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(env.HOME_RELAY_URL.replace(/\/$/, "") + "/api/planes" + u.search, {
        headers: { "X-Relay-Key": env.HOME_RELAY_KEY }, signal: ctl.signal
      });
      clearTimeout(t);
      if (r.ok) {
        const j = await r.json();
        if (j.ac && j.ac.length) {
          j.via = "home";
          return new Response(JSON.stringify(j), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" }
          });
        }
      }
    } catch (e) { /* home relay offline: fall through to Cloudflare */ }
  }
  return planes(request, context);
}
