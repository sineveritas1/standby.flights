// standby.flights relay: fetches nearby aircraft server-side so the browser never hits cross-site blocks.
const UA = "StandbyFlights/1.0 (+https://standby.flights)";
// Every source is asked in parallel and the answers are merged by ICAO hex, so a plane seen by two
// networks shows once. Each source keeps its own short cache and "last good" copy, so one source
// rate-limiting does not drop its planes. Tested from Cloudflare (Oct 2026): adsb.lol answers but
// sometimes returns 429; adsb.fi and airplanes.live return 403 to datacenter IPs; OpenSky timed out.
// every: seconds between real requests to that source. keep: seconds its last good answer may stand in.
// Daily limits decide the pace: adsb.lol sends "500;w=86400" (500 requests a day per IP) and
// airplanes.live's free tier is about the same, so each is asked every 3 minutes (480 a day).
// OpenSky allows 400 anonymous requests a day: every 4 minutes. adsb.fi publishes no limit; once a
// minute is a polite guess. The page moves planes along their track between updates.
const SOURCES = [
  { name: "adsb.lol",       every: 180, keep: 300, url: (la, lo, r) => `https://api.adsb.lol/v2/point/${la}/${lo}/${r}` },
  { name: "adsb.fi",        every: 60,  keep: 180, url: (la, lo, r) => `https://opendata.adsb.fi/api/v2/lat/${la}/lon/${lo}/dist/${r}` },
  { name: "airplanes.live", every: 180, keep: 300, url: (la, lo, r) => `https://api.airplanes.live/v2/point/${la}/${lo}/${r}` },
  { name: "opensky",        every: 240, keep: 300, url: openskyURL, convert: fromOpenSky }
];

function openskyURL(la, lo, r) {
  const dLat = r / 60, dLon = r / (60 * Math.cos(la * Math.PI / 180));
  return `https://opensky-network.org/api/states/all?extended=1&lamin=${(la - dLat).toFixed(3)}&lomin=${(lo - dLon).toFixed(3)}&lamax=${(la + dLat).toFixed(3)}&lomax=${(lo + dLon).toFixed(3)}`;
}
// OpenSky category numbers to the ADS-B emitter categories the other feeds use
const OSKY_CAT = { 2: "A1", 3: "A2", 4: "A3", 5: "A4", 6: "A5", 7: "A6", 8: "A7", 9: "B1", 10: "B2", 11: "B3", 12: "B4", 14: "B6", 15: "B7" };
function fromOpenSky(j) {
  const ac = (j.states || []).filter(s => s[5] != null && s[6] != null).map(s => ({
    hex: s[0], flight: s[1] || "", lat: s[6], lon: s[5],
    alt_baro: s[8] ? "ground" : (s[7] != null ? Math.round(s[7] * 3.28084) : (s[13] != null ? Math.round(s[13] * 3.28084) : undefined)),
    gs: s[9] != null ? s[9] * 1.94384 : undefined,
    track: s[10] != null ? s[10] : undefined,
    baro_rate: s[11] != null ? s[11] * 196.85 : undefined,
    squawk: s[14] || undefined,
    category: OSKY_CAT[s[17]],
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

// Fields copied from any source that has them when the source with the freshest position does not
const FILL = ["flight", "r", "t", "desc", "ownOp", "year", "category", "squawk", "alt_baro", "alt_geom", "gs", "track", "baro_rate", "geom_rate", "emergency"];

function mergeSources(lists) {
  const byHex = new Map();
  for (const { name, ac } of lists) {
    for (const a of ac) {
      if (typeof a.lat !== "number" || typeof a.lon !== "number" || !a.hex) continue;
      const key = String(a.hex).toLowerCase();
      const seen = typeof a.seen_pos === "number" ? a.seen_pos : 99;
      const cur = byHex.get(key);
      if (!cur) { byHex.set(key, { best: a, bestSeen: seen, all: [a], src: [name], flags: a.dbFlags | 0 }); continue; }
      cur.all.push(a); cur.src.push(name); cur.flags |= a.dbFlags | 0;
      if (seen < cur.bestSeen) { cur.best = a; cur.bestSeen = seen; }
    }
  }
  const out = [];
  for (const e of byHex.values()) {
    const m = Object.assign({}, e.best);
    for (const f of FILL) {
      if (m[f] != null && m[f] !== "") continue;
      for (const o of e.all) if (o[f] != null && o[f] !== "") { m[f] = o[f]; break; }
    }
    if (e.flags) m.dbFlags = e.flags;
    m.src = e.src;
    out.push(m);
  }
  // TIS-B and other non-ICAO targets (hex starts with ~) can echo a plane already listed under its real
  // address. Drop one when a real target sits within 0.5 NM and 300 ft of it.
  const real = out.filter(a => a.hex[0] !== "~");
  return out.filter(a => {
    if (a.hex[0] !== "~") return true;
    return !real.some(b => {
      const dy = (a.lat - b.lat) * 60, dx = (a.lon - b.lon) * 60 * Math.cos(a.lat * Math.PI / 180);
      const alt = typeof a.alt_baro === "number" && typeof b.alt_baro === "number" ? Math.abs(a.alt_baro - b.alt_baro) : 0;
      return Math.hypot(dx, dy) < 0.5 && alt < 300;
    });
  });
}

export async function planes(request, ctx) {
  const u = new URL(request.url);
  const la = parseFloat(u.searchParams.get("lat")), lo = parseFloat(u.searchParams.get("lon"));
  let r = parseFloat(u.searchParams.get("r") || "30");
  if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return json({ error: "lat and lon are required" }, 400);
  r = Math.max(2, Math.min(250, Math.round(isFinite(r) ? r : 30)));
  const key = `${la.toFixed(3)}/${lo.toFixed(3)}/${r}`;
  const cache = caches.default;
  const save = (k, body, secs) => {
    const p = cache.put(k, new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=" + secs } }));
    if (ctx && ctx.waitUntil) ctx.waitUntil(p); else return p;
  };

  // Each source has a fresh copy (asked again after `every` seconds) and a last good copy (`keep` seconds)
  const report = {};
  const lists = await Promise.all(SOURCES.map(async s => {
    const freshKey = new Request(`https://standby.cache/src/${s.name}/${key}`);
    const goodKey = new Request(`https://standby.cache/good/${s.name}/${key}`);
    let data = null;
    const hit = await cache.match(freshKey);
    if (hit) data = await hit.json();
    else {
      try {
        let j = await getJSON(s.url(la, lo, r), 6000);
        if (s.convert) j = s.convert(j);
        data = { now: Date.now(), ac: j.ac || j.aircraft || [] };
        const body = JSON.stringify(data);
        await save(freshKey, body, s.every);
        await save(goodKey, body, s.keep);
      } catch (e) {
        report[s.name] = String(e.message || e);
        // Remember the failure for `every` seconds too, so a blocked source is not hammered
        await save(freshKey, JSON.stringify({ failed: report[s.name] }), s.every);
      }
    }
    if (data && data.failed) { report[s.name] = data.failed; data = null; }
    if (!data) {
      const good = await cache.match(goodKey);
      if (good) { data = await good.json(); report[s.name] += " (using last good)"; }
    }
    if (!data) return { name: s.name, ac: [], ok: false };
    const age = Math.max(0, (Date.now() - data.now) / 1000);
    const ac = age < 1 ? data.ac : data.ac.map(a => Object.assign({}, a, { seen_pos: (typeof a.seen_pos === "number" ? a.seen_pos : 0) + age }));
    if (!report[s.name]) report[s.name] = ac.length + " aircraft" + (age >= 1 ? ", " + Math.round(age) + "s old" : "");
    else report[s.name] += ", " + ac.length + " aircraft";
    return { name: s.name, ac, ok: true };
  }));

  if (!lists.some(l => l.ok)) return json({ error: "No flight source answered", sources: report }, 502);
  const ac = mergeSources(lists);
  return json({ source: lists.filter(l => l.ok).map(l => l.name).join("+"), now: Date.now(), sources: report, ac });
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
