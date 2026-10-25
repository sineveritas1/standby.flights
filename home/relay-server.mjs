// standby.flights home relay: runs the same relay code as the Pages Function, but from a computer
// at home. The flight networks block or throttle Cloudflare's IPs; a home connection is not blocked.
// Cloudflare Tunnel exposes it to the site; see docs/HOME_RELAY.md.
//
// Needs Node 22 or newer (it loads the relay file as a module), no packages. Run with:
//   RELAY_KEY=some-long-random-text node home/relay-server.mjs
import http from "node:http";

// The relay uses the Workers cache API. This is a small in-memory stand-in that honors max-age.
const store = new Map();
globalThis.caches = {
  default: {
    async match(req) {
      const e = store.get(req.url);
      if (!e || e.until < Date.now()) { store.delete(req.url); return undefined; }
      return new Response(e.body, { headers: { "Content-Type": "application/json" } });
    },
    async put(req, res) {
      const m = /max-age=(\d+)/.exec(res.headers.get("Cache-Control") || "");
      store.set(req.url, { body: await res.text(), until: Date.now() + (m ? +m[1] : 0) * 1000 });
    }
  }
};
setInterval(() => { const now = Date.now(); for (const [k, e] of store) if (e.until < now) store.delete(k); }, 60000);

const { planes, route } = await import("../functions/_lib/relay.js");
const PORT = +(process.env.PORT || 8789);
const KEY = process.env.RELAY_KEY || "";
if (!KEY) { console.error("Set RELAY_KEY first, so only your site can use this relay."); process.exit(1); }

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const handler = url.pathname === "/api/planes" ? planes : url.pathname === "/api/route" ? route : null;
  if (!handler) { res.writeHead(404).end("not found"); return; }
  if (req.headers["x-relay-key"] !== KEY) { res.writeHead(401).end("missing or wrong relay key"); return; }
  try {
    const out = await handler(new Request(url.href));
    res.writeHead(out.status, { "Content-Type": "application/json" });
    res.end(await out.text());
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
}).listen(PORT, () => console.log(`standby.flights home relay on http://localhost:${PORT}`));
