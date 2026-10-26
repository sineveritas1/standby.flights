# standby.flights

A full-screen display of the planes flying over a chosen spot, built to run on an old tablet like a retro flight board. It uses free, keyless ADS-B data and shows the closest plane with its airline, route, type, altitude, speed and look-up angle, in five skins: LED, VFD, Radar, split-flap Board, and full-color Wall. Personal project of Zack Almaguer.

- **Live URL:** https://standby.flights (Cloudflare Pages project `standby-flights`, also at standby-flights.pages.dev)
- **Status:** live at standby-flights.pages.dev. Custom domain not attached yet.

## How it is built

No framework, no build step, no dependencies.

```
public/index.html          The whole app: HTML, CSS and JS in one file
public/check.html          One-tap test of which sources a device can reach directly
public/fly.html            Fly mode: 16-bit flight game over a pixel-art US with the real planes around you
functions/_lib/relay.js    Shared server code: aircraft relay and route lookup (_lib is not routed)
functions/api/planes.js    GET /api/planes?lat=&lon=&r=        nearby aircraft
functions/api/route.js     GET /api/route?callsign=&lat=&lon=  origin and destination
home/relay-server.mjs      Optional home relay (Node 22, no packages)
wrangler.toml              Pages config (output dir: public)
docs/HANDOFF.md            Original design handoff: skins, data flow, provider notes
```

The page polls `/api/planes` every 8 seconds. The relay asks adsb.lol, adsb.fi, airplanes.live and OpenSky at once and merges them by aircraft ID so no plane shows twice. From Cloudflare only adsb.lol answers today; an optional home relay (docs/HOME_RELAY.md) runs the same code from a home connection, where the other sources work. Emails asking the networks for access are in docs/SOURCE_ACCESS.md. Routes come from adsbdb, with the adsb.lol routeset as backup, cached 6 hours. If no source answers for a minute the page shows clearly labeled DEMO TRAFFIC and keeps retrying.

## Fly mode

The Fly button opens `/fly`, a 16/32-bit style flight game over the real US with the real planes around you. Three views:

- **3D:** voxel terrain like 90s flight games. Ground height from Mapzen Terrain Tiles on AWS (open data), colors from USGS National Map imagery (public domain), drawn in 15-bit color with distance haze, day and night lighting, and your plane from behind, banking into turns.
- **Map:** top-down, with satellite (USGS), street (OpenStreetMap, credited on screen, map view only) or the pixel-art map built from world-atlas and us-atlas.
- **Side:** a side-scroller whose ground is the real elevation profile along your heading.

Real planes from `/api/planes` fly around you, sorted into airline, cargo, military, government, bizjet, private and helicopter. Fly within about 3 miles and 3,000 feet of one to log it. Demo traffic fills in when no source answers and is never logged. Height above ground is real: PULL UP warns you, and hitting the ground resets you 3,000 ft up. The logbook, last position and chosen view are saved in this browser only.

Controls: arrows turn and climb, THR+ and THR- set speed, LVL levels off, 3D/MAP/SIDE switches view, SAT/STREET/PIXEL switches map style, ZOOM (map view) steps from the whole US to close in, X1 speeds up your plane only, GO jumps to an airport. Keyboard: arrow keys or WASD, Q and E for throttle, V view, M map style, Z zoom, T time. Add `?hour=13` to the address to force a time of day.

## Run locally

```
npx wrangler pages dev
```

Then open http://localhost:8788. Opening `public/index.html` directly also works, but without the relay most browsers block the flight feeds.

## Deploy

Cloudflare Pages connected to this GitHub repo. `main` deploys to production; every other branch gets a preview URL.

- Framework preset: None
- Build command: (empty)
- Build output directory: `public`

Drag-and-drop Pages uploads do not run `functions/`. Use the Git connection or `npx wrangler pages deploy`.

## Where the data lives

Nowhere permanent. Flight data is fetched live and cached for seconds. Each screen's settings (spot, radius, skin) are saved in that browser's localStorage under `standby.cfg`, or carried in the kiosk link (`?name=&lat=&lon=&r=&elev=&poll=&skin=`). No database. The only secret is the optional `HOME_RELAY_KEY` (see .dev.vars.example).

## Who to ask

Zack Almaguer.
