# standby.flights: project notes

Follows the global CLAUDE.md. This file adds what is specific here.

## What this is
A retro flight-board display of planes overhead, for an old tablet. Personal project. Domain standby.flights on the personal Cloudflare account, Pages project `standby-flights`.

## Decisions made
- Shape: one static page (`public/index.html`) plus two Pages Functions. No D1, KV or R2. The relay uses `caches.default` only.
- The relay asks every source in parallel and merges by ICAO hex: freshest position wins, missing fields (type, owner, category, dbFlags) are filled from the others, TIS-B echoes are dropped. Sources are paced by their daily limits: adsb.lol sends `x-ratelimit-limit: 4, 4;w=1, 60;w=60, 500;w=86400` (500 a day per IP), so it and airplanes.live are asked every 3 minutes, OpenSky every 4 (400 anonymous a day), adsb.fi every minute. The page dead-reckons planes for up to 5 minutes between updates. Never poll a source faster than its daily limit allows, and keep test loops short: they spend the same budget.
- Optional home relay (`home/relay-server.mjs`, docs/HOME_RELAY.md): same code run on a home computer behind Cloudflare Tunnel. `/api/planes` asks it first when `HOME_RELAY_URL` and `HOME_RELAY_KEY` are set, then falls back to Cloudflare.
- Name is `standby.flights`, written lowercase as a wordmark. Old names "Overhead" and "It's a Bird!" are retired; do not bring them back.
- No real airline logos or trademarks. The Wall emblem is an original pixel plane on a color tile hashed from the airline code.
- Fonts: Silkscreen, VT323, Barlow Condensed (Google Fonts). Skin palettes are set in `index.html`; treat them as brand.
- From Cloudflare (Oct 2026) only adsb.lol answers, about half the time (429). adsb.fi and airplanes.live return 403, OpenSky times out (it says it may block cloud providers, so an OpenSky account will not fix it). None send CORS headers for this site, so the browser cannot call them directly.
- Each source keeps a last good copy for a few minutes, with `seen_pos` aged so the page dead-reckons it forward.
- adsbdb route shape verified live. adsb.lol routeset could not be reached from the sandbox, so its shape is still unverified.
- The page avoids optional chaining and `??` so it runs on old tablet browsers. Keep it that way.
- Live tracker (`public/live.html`), not a game: Zack tried a flight game first and said he wants a tracker of live flights. The camera follows real flights or stands at the home spot; there is no player plane. Its own file so the display stays small. Pixel art drawn in code like redrockpals.pages.dev (low-res buffer, shapes snapped to whole pixels, Silkscreen). Short side is 224 game pixels; colors cut to 15-bit like a Super NES.
  - 3D view is voxel terrain (Comanche style): heights from AWS Terrain Tiles (terrarium PNGs, open data), colors from USGS National Map imagery (public domain). Both send CORS headers. Work happens in Web Mercator pixels at zoom 15; detail drops with distance. Columns double up on slow devices.
  - OpenStreetMap tiles are used in map view only, to respect OSM's tile policy, with the credit on screen. EOX Sentinel-2 was skipped (non-commercial license); Stadia needs a key.
  - Tiles are cached in memory, about 110 kept, least recently used dropped.
  - The pixel map raster is 0.04 degree cells from world-atlas land-50m and us-atlas states-10m; Great Lakes and a few other lakes are hand-placed ovals. Region terrain colors are a hand-written rule set (`terrainUS`).
  - Traffic is fetched per 1 degree square with r=100, at most every 45 seconds per square, for home and for wherever the camera is, so the relay cache stays shared. Routes come from `/api/route` for airline-style callsigns.
  - Zack's reference images were stock art and Microsoft Flight Simulator covers: style reference only, nothing copied, no real airline or game branding.
- Geocoding is OpenStreetMap Nominatim straight from the browser; fine at personal volume.

## Current step
Live on standby-flights.pages.dev, deployed from `main`. Custom domain standby.flights added, waiting for the new domain to publish. Source access: emails drafted in docs/SOURCE_ACCESS.md, home relay built but not set up. Live tracker built on the preview branch for Zack to try. Next: his feedback on it, then the screens one by one. The live site still mostly shows demo traffic until a flight source answers Cloudflare reliably.

## Commands
- Run locally: `npx wrangler pages dev` then open http://localhost:8788
- Check the relay: `curl "http://localhost:8788/api/planes?lat=37.1753&lon=-113.2899&r=30"` and `curl "http://localhost:8788/api/route?callsign=SWA123"`
- Home relay: `RELAY_KEY=... node home/relay-server.mjs` (port 8789)
- Manual deploy (only if not using the Git connection): `npx wrangler pages deploy`

## Known gaps
- Board skin at 375px wide: the title and footer text are very small and the controls sit over the title until they fade.
- Wall text is all caps (Silkscreen has no lowercase).
- Units are fixed (knots on LED, mph on Wall).
- See docs/HANDOFF.md "Known gaps" for the longer list.
