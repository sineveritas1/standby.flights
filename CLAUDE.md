# standby.flights: project notes

Follows the global CLAUDE.md. This file adds what is specific here.

## What this is
A retro flight-board display of planes overhead, for an old tablet. Personal project. Domain standby.flights on the personal Cloudflare account, Pages project `standby-flights`.

## Decisions made
- Shape: one static page (`public/index.html`) plus two Pages Functions. No D1, KV or R2. The relay uses `caches.default` only.
- Name is `standby.flights`, written lowercase as a wordmark. Old names "Overhead" and "It's a Bird!" are retired; do not bring them back.
- No real airline logos or trademarks. The Wall emblem is an original pixel plane on a color tile hashed from the airline code.
- Fonts: Silkscreen, VT323, Barlow Condensed (Google Fonts). Skin palettes are set in `index.html`; treat them as brand.
- Relay source order (tested from a datacenter, Oct 2026): adsb.fi (fast), adsb.lol (slow, sometimes times out), OpenSky (works), airplanes.live last (returns 403 and asks projects to email contact@airplanes.live first).
- adsbdb route shape verified live. adsb.lol routeset could not be reached from the sandbox, so its shape is still unverified.
- The page avoids optional chaining and `??` so it runs on old tablet browsers. Keep it that way.
- Geocoding is OpenStreetMap Nominatim straight from the browser; fine at personal volume.

## Current step
First working version in the repo. Next: connect the repo to Cloudflare Pages and confirm `/api/planes` answers from Cloudflare's network (datacenter blocks are the known risk).

## Commands
- Run locally: `npx wrangler pages dev` then open http://localhost:8788
- Check the relay: `curl "http://localhost:8788/api/planes?lat=37.1753&lon=-113.2899&r=30"` and `curl "http://localhost:8788/api/route?callsign=SWA123"`
- Manual deploy (only if not using the Git connection): `npx wrangler pages deploy`

## Known gaps
- Board skin at 375px wide: the title and footer text are very small and the controls sit over the title until they fade.
- Wall text is all caps (Silkscreen has no lowercase).
- Units are fixed (knots on LED, mph on Wall).
- See docs/HANDOFF.md "Known gaps" for the longer list.
