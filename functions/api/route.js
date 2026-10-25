import { route } from "../_lib/relay.js";

// GET /api/route?callsign=&lat=&lon=  origin/destination lookup
export const onRequestGet = (context) => route(context.request, context);
