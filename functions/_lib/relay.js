// standby.flights relay: fetches nearby aircraft server-side so the browser never hits cross-site blocks.
const UA = "StandbyFlights/1.0 (+https://standby.flights)";
// Order comes from live tests from Cloudflare (Oct 2026): adsb.lol is the only one that answers, and it
// sometimes returns 429 because Cloudflare IPs are shared. adsb.fi and airplanes.live return 403 to
// datacenter IPs, OpenSky times out. They stay in the list in case that changes.
const SOURCES = [
  { name: "adsb.lol",       url: (la, lo, r) => `https://api.adsb.lol/v2/point/${la}/${lo}/${r}` },
  { name: "adsb.fi",        url: (la, lo, r) => `https://opendata.adsb.fi/api/v2/lat/${la}/lon/${lo}/dist/${r}` },
  { name: "opensky",        url: openskyURL, convert: fromOpenSky },
  { name: "airplanes.live", url: (la, lo, r) => `https://api.airplanes.live/v2/point/${la}/${lo}/${r}` }
];

function openskyURL(la, lo, r) {
  const dLat = r / 60, dLon = r / (60 * Math.cos(la * Math.PI / 180));
  return `https://opensky-network.org/api/states/all?lamin=${(la - dLat).toFixed(3)}&lomin=${(lo - dLon).toFixed(3)}&lamax=${(la + dLat).toFixed(3)}&lomax=${(lo + dLon).toFixed(3)}`;
}
function fromOpenSky(j) {
  const ac = (j.states || []).filter(s => s[5] != null && s[6] != null).map(s => ({
    hex: s[0], flight: s[1] || "", lat: s[6], lon: s[5],
    alt_baro: s[8] ? "ground" : (s[7] != null ? Math.round(s[7] * 3.28084) : (s[13] != null ? Math.round(s[13] * 3.28084) : undefined)),
    gs: s[9] != null ? s[9] * 1.94384 : undefined,
    track: s[10] != null ? s[10] : undefined,
    baro_rate: s[11] != null ? s[11] * 196.85 : undefined,
    seen_pos: j.time && s[3] ? Math.max(0, j.time - s[3]) : 0
  }));
  return { ac };
}

async function getJSON(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" }, signal: ctl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

const json = (obj, status, extra) => new Response(JSON.stringify(obj), {
  status: status || 200,
  headers: Object.assign({ "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" }, extra || {})
});

export async function planes(request, ctx) {
  const u = new URL(request.url);
  const la = parseFloat(u.searchParams.get("lat")), lo = parseFloat(u.searchParams.get("lon"));
  let r = parseFloat(u.searchParams.get("r") || "30");
  if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return json({ error: "lat and lon are required" }, 400);
  r = Math.max(2, Math.min(250, Math.round(isFinite(r) ? r : 30)));
  const key = `${la.toFixed(3)}/${lo.toFixed(3)}/${r}`;

  // 8 second shared cache so several screens or fast polling stay polite to the volunteer networks.
  // A second "last good" copy lives 2 minutes and is served when every source fails, so a rate limit
  // shows slightly old planes (the page dead-reckons them forward) instead of an error.
  const cache = caches.default;
  const cacheKey = new Request("https://standby.cache/" + key);
  const staleKey = new Request("https://standby.cache/stale/" + key);
  const hit = await cache.match(cacheKey);
  if (hit) return json(await hit.json());
  const save = (k, body, secs) => {
    const p = cache.put(k, new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=" + secs } }));
    if (ctx && ctx.waitUntil) ctx.waitUntil(p); else return p;
  };

  const errors = [];
  for (const s of SOURCES) {
    try {
      let j = await getJSON(s.url(la, lo, r), 5000);
      if (s.convert) j = s.convert(j);
      const out = { source: s.name, now: Date.now(), ac: j.ac || j.aircraft || [] };
      const body = JSON.stringify(out);
      await save(cacheKey, body, 8);
      await save(staleKey, body, 120);
      return json(out);
    } catch (e) { errors.push(s.name + " " + (e.message || e)); }
  }
  const old = await cache.match(staleKey);
  if (old) {
    const out = await old.json();
    const age = Math.max(0, (Date.now() - out.now) / 1000);
    out.ac.forEach(a => { a.seen_pos = (typeof a.seen_pos === "number" ? a.seen_pos : 0) + age; });
    out.source += " cached";
    out.errors = errors;
    return json(out);
  }
  return json({ error: "No flight source answered: " + errors.join("; ") }, 502);
}

// ---- routes: origin/destination by callsign (adsbdb first, adsb.lol routeset as backup) ----
function fromAdsbdb(j, cs) {
  const f = j && j.response && j.response.flightroute;
  if (!f || !f.origin || !f.destination) return null;
  const o = f.origin, d = f.destination;
  return { callsign: cs, airline: (f.airline && f.airline.name) || "",
    route: (o.iata_code || o.icao_code) + "-" + (d.iata_code || d.icao_code),
    from: o.name || "", to: d.name || "", fromCity: o.municipality || "", toCity: d.municipality || "" };
}
function fromRouteset(arr, cs) {
  const r = Array.isArray(arr) && arr[0];
  if (!r || !r._airport_codes_iata || /unknown/i.test(r._airport_codes_iata) || r.plausible === false || r.plausible === 0) return null;
  const aps = r._airports || [];
  const a = aps[0] || {}, z = aps[aps.length - 1] || {};
  return { callsign: cs, airline: "", route: r._airport_codes_iata, from: a.name || "", to: z.name || "", fromCity: a.location || "", toCity: z.location || "" };
}
export async function route(request, ctx) {
  const u = new URL(request.url);
  const cs = (u.searchParams.get("callsign") || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(cs)) return json({ error: "callsign is required" }, 400);
  const lat = parseFloat(u.searchParams.get("lat")) || 0, lon = parseFloat(u.searchParams.get("lon")) || 0;
  const cache = caches.default;
  const cacheKey = new Request("https://standby.cache/route/" + cs);
  const hit = await cache.match(cacheKey);
  if (hit) return json(await hit.json());

  let out = null;
  try { out = fromAdsbdb(await getJSON("https://api.adsbdb.com/v0/callsign/" + cs, 6000), cs); } catch (e) {}
  if (!out) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch("https://api.adsb.lol/api/0/routeset", {
        method: "POST", signal: ctl.signal,
        headers: { "User-Agent": UA, "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ planes: [{ callsign: cs, lat, lng: lon }] })
      });
      clearTimeout(t);
      if (r.ok) out = fromRouteset(await r.json(), cs);
    } catch (e) {}
  }
  const body = out || { callsign: cs, route: null };
  const put = new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=" + (out ? 21600 : 1800) } });
  if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(cacheKey, put)); else await cache.put(cacheKey, put);
  return json(body);
}
