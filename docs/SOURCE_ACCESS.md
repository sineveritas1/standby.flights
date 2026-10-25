# Getting better access to flight data

## Emails to send (free)

### adsb.lol (its API terms ask production users to get in touch)
To: the contact listed at https://adsb.lol
Subject: standby.flights, small non-commercial display using the adsb.lol API

Hi. I run standby.flights, a free, non-commercial retro flight-board display of the planes over one spot (Hurricane, Utah by default). It calls /v2/point for one location about every 8 seconds, cached at the edge so several screens share one request, and credits adsb.lol on screen. It runs on Cloudflare Pages, and requests from Cloudflare often get HTTP 429. Is there an API key or allowance I can use so it is not throttled? Happy to follow any limits you set.
Thanks, Zack Almaguer

### airplanes.live (their 403 message asks for this email)
To: contact@airplanes.live
Subject: API access request: standby.flights

Hi. Your API asked me to get in touch. Project: standby.flights (https://standby.flights), a free, non-commercial full-screen display of nearby aircraft for a home tablet. Code: https://github.com/sineveritas1/standby.flights. It would call /v2/point for one location about every 8 seconds, cached so multiple screens share one request, from Cloudflare Pages Functions. Requests from Cloudflare get 403 today. Could you allow it, or tell me what you need?
Thanks, Zack Almaguer

### adsb.fi
To: the contact listed at https://adsb.fi
Subject: Open data API from Cloudflare: standby.flights

Hi. standby.flights is a free, non-commercial display of the planes over one spot. It uses your open data /v2/lat/lon/dist endpoint about every 8 seconds, cached so screens share one request. Requests from Cloudflare Pages get 403. Is there a way to allow it, such as a key or header?
Thanks, Zack Almaguer

## Running a receiver (costs money, your call)
A small ADS-B receiver at home sees the planes over Hurricane directly, including low small planes the networks miss. Feeding its data to adsb.lol, airplanes.live and adsb.fi is how those networks give feeders better API access.

Typical parts: a Raspberry Pi (or any small always-on computer), a 1090 MHz ADS-B USB receiver (RTL-SDR style, ideally with a built-in filter), and a 1090 MHz antenna placed high with a clear view of the sky. Software: the free adsb.im image sets up readsb and feeding to several networks from a web page.

Once it runs, the same computer can host the home relay (docs/HOME_RELAY.md), and its own local aircraft list can become another source in the relay.
