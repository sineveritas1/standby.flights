# Home relay

## Why
The free flight networks block or throttle Cloudflare's servers. Tested Oct 2026 from Cloudflare: adsb.fi and airplanes.live return 403, OpenSky times out, adsb.lol answers about half the time. From a home internet connection, adsb.lol, adsb.fi and OpenSky all answer.

The home relay is the same relay code (`functions/_lib/relay.js`) running on a computer at home. Cloudflare Tunnel gives it a private web address. The site asks it first and falls back to Cloudflare when it is off, so nothing breaks if the computer sleeps.

## What you need
- Any computer that stays on: a Mac or PC that does not sleep, a Raspberry Pi, or an old Android phone with Termux.
- Node 22 or newer.
- `cloudflared` (Cloudflare's tunnel program).

## Setup
1. Copy this repo to the computer (or just `functions/_lib/relay.js` and `home/relay-server.mjs`, keeping the same folders).
2. Make a long random key. Any password generator works. You will use it twice.
3. Start the relay:
   `RELAY_KEY=your-key node home/relay-server.mjs`
   It listens on port 8789 and refuses any request without the key.
4. In Cloudflare: Zero Trust, Networks, Tunnels, Create a tunnel, Cloudflared. Name it `standby-home`. Follow its install command for your computer.
5. In the tunnel, add a Public Hostname: subdomain `relay`, domain `standby.flights`, service `http://localhost:8789`. This adds a DNS record for relay.standby.flights.
6. In Workers & Pages, `standby-flights`, Settings, Variables and Secrets, add for Production (and Preview if you want):
   - `HOME_RELAY_URL` = `https://relay.standby.flights`
   - `HOME_RELAY_KEY` = your key (type: Secret)
7. Redeploy (Deployments, latest, Retry deployment) so the Function sees the new values.
8. Check: `https://standby.flights/api/planes?lat=37.1753&lon=-113.2899&r=30` should include `"via":"home"`.

## Keep it running
- Mac or Linux: run it under `pm2`, `launchd` or `systemd` so it restarts after a reboot.
- `cloudflared service install` makes the tunnel start on boot.
