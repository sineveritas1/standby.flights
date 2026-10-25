# standby.flights: project notes

Follows the global CLAUDE.md. This file adds what is specific here.

## What this is
A retro flight-board display of planes overhead, for an old tablet. Personal project. Domain standby.flights on the personal Cloudflare account, Pages project `standby-flights`.

## Decisions made
- Shape: one static page (`public/index.html`) plus two Pages Functions. No D1, KV or R2. The relay uses `caches.default` only.
- Name is `standby.flights`, written lowercase as a wordmark. Old names "Overhead" and "It's a Bird!" are retired; do not bring them back.
- No real airline logos or trademarks. The Wall emblem is an original pixel plane on a color tile hashed from the airline code.
- Fonts: Silkscreen, VT323, Barlow Condensed (Google Fonts). Skin palettes are set in `index.html`; treat them as brand.
- Relay source order (tested from Cloudflare, Oct 2026): adsb.lol first, the only source that answers Cloudflare, and it sometimes returns 429. adsb.fi and airplanes.live return 403 to datacenter IPs; OpenSky times out. None of them send CORS headers that allow this site, so the browser cannot call them directly; the relay is the only path.
- When every source fails, the relay serves the last good answer for up to 2 minutes, marked `cached`, with `seen_pos` aged so the page dead-reckons it forward.
- adsbdb route shape verified live. adsb.lol routeset could not be reached from the sandbox, so its shape is still unverified.
- The page avoids optional chaining and `??` so it runs on old tablet browsers. Keep it that way.
- Geocoding is OpenStreetMap Nominatim straight from the browser; fine at personal volume.

## Current step
Live on standby-flights.pages.dev, deployed from `main`. Custom domain standby.flights not attached yet. Open question: getting a second source that answers Cloudflare (ask adsb.fi or airplanes.live for access, or a free OpenSky account).

## Commands
- Run locally: `npx wrangler pages dev` then open http://localhost:8788
- Check the relay: `curl "http://localhost:8788/api/planes?lat=37.1753&lon=-113.2899&r=30"` and `curl "http://localhost:8788/api/route?callsign=SWA123"`
- Manual deploy (only if not using the Git connection): `npx wrangler pages deploy`

## Known gaps
- Board skin at 375px wide: the title and footer text are very small and the controls sit over the title until they fade.
- Wall text is all caps (Silkscreen has no lowercase).
- Units are fixed (knots on LED, mph on Wall).
- See docs/HANDOFF.md "Known gaps" for the longer list.
