# standby.flights : Handoff

> Original handoff, kept for history. Since then the page moved to `public/index.html`, the Pages output directory is `public`, and live data was verified locally. README.md and CLAUDE.md are current.

standby.flights is a full-screen web display of the planes flying over a chosen spot, built to live on an old tablet like a retro flight board. It uses free, keyless ADS-B data. It's one static page plus two tiny Cloudflare Pages Functions.

- **Owner:** Zack Almaguer
- **Name and brand:** standby.flights (written lowercase as a wordmark). Earlier working names were "Overhead" and "It's a Bird!"; neither is used anymore.
- **Domain:** standby.flights (custom domain on Cloudflare Pages)
- **Target host:** Cloudflare Pages project `standby-flights` (standby-flights.pages.dev), deployed from this GitHub repo, with standby.flights attached as the custom domain
- **Status:** working prototype. The UI, skins, setup, and demo fallback were verified in a headless browser. The live data path (feeds and route lookups) has **not** been tested end to end, because the sandbox it was built in couldn't reach those hosts. Verifying that is the first job.

## Repo layout

```
public/index.html          The whole app: HTML, CSS, and JS in one file (~1,100 lines)
functions/_lib/relay.js    Shared server code: aircraft relay + route lookup (not routed; _lib is ignored by Pages routing)
functions/api/planes.js    GET /api/planes?lat=&lon=&r=
functions/api/route.js     GET /api/route?callsign=&lat=&lon=
HANDOFF.md                 This file
```

There's no build step and no dependencies. The only external assets are three Google Fonts: Silkscreen, VT323, and Barlow Condensed.

## Deploy

1. Push this repo to GitHub.
2. In Cloudflare, open Workers & Pages, then Create, then Pages, then Connect to Git, and pick the repo.
3. Set the framework preset to None, leave the build command empty, and set the output directory to `public`.
4. Name the project `standby-flights`, then add standby.flights under Custom domains.
5. Run locally with: `npx wrangler pages dev`

Note: drag-and-drop Pages uploads do not run `/functions`. Use the git deploy or wrangler.

## How it works

### Data flow
1. The page polls `api/planes` every N seconds (8 by default, minimum 5). The relay tries **adsb.lol → adsb.fi → airplanes.live → OpenSky**, returns the first answer normalized to the readsb `ac[]` shape, and caches it for 5 seconds per (lat, lon, radius) in `caches.default`.
2. If the relay is missing (404), the page falls back to calling those providers directly from the browser. That often fails because of CORS, which is why the relay exists.
3. If everything fails and there's been no good data for 60 seconds, the page shows **clearly labeled DEMO TRAFFIC**: fake planes that move, with fake routes. It keeps retrying and switches back to live data automatically. Setup shows the per-source error list while in demo.
4. Between polls, positions are dead-reckoned from speed and track, so motion looks smooth.

### Provider endpoints (all free, no key)
- adsb.lol: `https://api.adsb.lol/v2/point/{lat}/{lon}/{nm}`
- adsb.fi: `https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{nm}`
- airplanes.live: `https://api.airplanes.live/v2/point/{lat}/{lon}/{nm}`
- OpenSky: `https://opensky-network.org/api/states/all?lamin=&lomin=&lamax=&lomax=`. It's anonymous and rate limited. `fromOpenSky()` converts it to the readsb shape (meters to feet, m/s to knots and fpm).
- The radius cap is 250 NM. Be polite: about 1 request per second per network is the published guidance, and the 5-second cache keeps you well under it.
- One public report says some of these networks block datacenter IPs. If the Pages relay gets 403s or timeouts from Cloudflare, that's the likely cause. Options: lean on whichever source answers, or add a browser-direct path for sources that send CORS headers.

### Routes (origin and destination)
ADS-B doesn't carry routes. `api/route` looks up each callsign:
1. adsbdb: `https://api.adsbdb.com/v0/callsign/{CALLSIGN}`, which gives `response.flightroute.{airline, origin, destination}`
2. Backup, adsb.lol routeset: `POST https://api.adsb.lol/api/0/routeset` with `{"planes":[{"callsign","lat","lng"}]}`. Read `_airport_codes_iata` and `_airports[]`.

Hits are cached for 6 hours and misses for 30 minutes. The client caches too (1 hour for hits, 15 minutes for misses) and only looks up airline-style callsigns (three letters plus a digit). **Both response shapes were written from memory, so verify them against live responses.**

### Location setup
- The Setup panel takes an address, city, ZIP, or a "lat, lon" pair. Geocoding uses **OpenStreetMap Nominatim** (`countrycodes=us`). Reverse lookup gives the on-screen town name, and the **USGS EPQS** elevation service fills in ground elevation, which is used to compute height above ground and the look-up angle.
- "Use this device's location" uses the browser's geolocation.
- Settings are saved in `localStorage` under `standby.cfg`.
- A kiosk link carries everything in the URL: `?name=&lat=&lon=&r=&elev=&skin=` (and `poll=`). First-time visitors with no saved settings and no URL parameters land on Setup.
- Nominatim's usage policy asks for low volume and an identifying referer. That's fine for personal use; if this goes public, consider a different geocoder or proxy it through a Function with a User-Agent.

## Skins

All skins render the same `view()` list: planes sorted by distance, the closest one "locked."

| Key | Name | Rendering |
|---|---|---|
| `led` | LED | Amber dot matrix. Text is drawn into a low-res buffer, then each lit pixel is snapped to one of 4 palette colors and stamped as a glowing round LED sprite. Includes a mini radar and a ticker. |
| `vfd` | VFD | Same renderer as LED, with a teal and magenta palette and square dots. |
| `radar` | Radar | Vector canvas phosphor scope with a sweep and trail. Blips brighten as the sweep passes. Traffic list on the side (or below, when held upright). CSS scanline overlay. |
| `flap` | Board | DOM split-flap board. Each `Tile` steps through a character drum with a flip animation. Columns drop when narrow. |
| `wall` | Wall | Full-color RGB LED panel inspired by consumer flight-wall displays. Low-res buffer, alpha snapped to on/off, upscaled with nearest-neighbor, then a precomputed round-hole mask and a soft glow pass on top. Shows an emblem tile, airline, route, aircraft, stats, airport names, a status line, and a ticker. Has a portrait layout with an "also nearby" list. |

Shared behavior:
- "OVERHEAD NOW" alert when the closest plane is under 2 NM away.
- Controls fade after 5 seconds; tap to show them again.
- Fullscreen button and screen wake lock (best effort).

## Design rules to keep
- **No real airline logos or trademarks.** The Wall emblem is an original pixel plane, rotated to the plane's track, on a tile whose color is derived from a hash of the airline code. Keep it that way.
- The tables `TYPES` (ICAO type to friendly name) and `AIRLINES` (ICAO prefix to name) are small, hand-made lookups in `index.html`. The feed's `desc` field is preferred when present.
- Writing style for anything Zack reads: no em dashes.

## Known gaps / next steps
1. **Verify live data** on standby.flights: watch `/api/planes?lat=37.1753&lon=-113.2899&r=30` and `/api/route?callsign=SWA123`, and confirm the response shapes and which providers answer from Cloudflare.
2. Wall mode text is all caps, because Silkscreen is effectively caps-only. A true mixed-case pixel font would match the reference look better.
3. Make units configurable (mph vs knots, ft/s vs fpm).
4. Add more skins (the plan was more 80s digital looks), plus a skin auto-rotate timer.
5. Cache Nominatim results in the Function and send an identifying User-Agent.
6. Expand the `TYPES` and `AIRLINES` tables, or pull an open aircraft database.
7. The old tablet's browser may be outdated. The page avoids optional chaining and `??`, but it does use ES2018 features (`Promise.finally`, object spread is not used) and `AbortController`. Test on the actual device.

## Defaults
Hurricane, UT: 37.1753, -113.2899. Ground elevation 3,250 ft, radius 30 NM, refresh every 8 seconds, LED skin.
