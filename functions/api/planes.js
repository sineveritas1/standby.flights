import { planes } from "../_lib/relay.js";

// GET /api/planes?lat=&lon=&r=  nearby aircraft, relayed server-side
export const onRequestGet = (context) => planes(context.request, context);
