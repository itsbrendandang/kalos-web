// Run with NODE_ENV=production (Better Auth reads it at call time).
// Uses the SAME ipAddress config as makeAuth (ipAddressOptions) so the
// assertions cover production wiring, not a copy of it.
import { getIP } from "better-auth/api";
import { authOptionsFromEnv, ipAddressOptions } from "../../lib/server/auth-config.mjs";

const o = (env) => ({ advanced: { ipAddress: ipAddressOptions(authOptionsFromEnv(env)) } });
const xff = (v) => new Headers({ "x-forwarded-for": v });
console.log(JSON.stringify({
  trusted: getIP(xff("6.6.6.6, 198.51.100.1, 10.0.0.5"), o({ AUTH_TRUSTED_PROXIES: "10.0.0.0/8" })),
  multiNoTrust: getIP(xff("6.6.6.6, 198.51.100.1"), o({})),
  single: getIP(xff("6.6.6.6"), o({})),
  singleNone: getIP(xff("6.6.6.6"), o({ AUTH_TRUSTED_PROXIES: "none" })),
  realIp: getIP(new Headers({ "x-real-ip": "198.51.100.2" }), o({ AUTH_TRUSTED_PROXIES: "10.0.0.5", AUTH_IP_ADDRESS_HEADERS: "x-real-ip" })),
  realIpNoProxy: getIP(new Headers({ "x-real-ip": "198.51.100.2" }), o({ AUTH_IP_ADDRESS_HEADERS: "x-real-ip" })),
  none: getIP(new Headers(), o({})),
  v6a: getIP(xff("2001:db8:0:1::1, 10.0.0.5"), o({ AUTH_TRUSTED_PROXIES: "10.0.0.0/8" })),
  v6b: getIP(xff("2001:db8:0:1:ffff::2, 10.0.0.5"), o({ AUTH_TRUSTED_PROXIES: "10.0.0.0/8" })),
}));
