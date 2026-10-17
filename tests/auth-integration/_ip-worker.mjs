// Run with NODE_ENV=production (Better Auth reads it at import time).
import { getIP } from "better-auth/api";
import { authOptionsFromEnv } from "../../lib/server/auth-config.mjs";

const o = (env) => {
  const { trustedProxies, ipAddressHeaders } = authOptionsFromEnv(env);
  return { advanced: { ipAddress: { ipAddressHeaders: ipAddressHeaders.length ? ipAddressHeaders : ["x-forwarded-for"], ...(trustedProxies.length ? { trustedProxies } : {}) } } };
};
const xff = (v) => new Headers({ "x-forwarded-for": v });
console.log(JSON.stringify({
  trusted: getIP(xff("6.6.6.6, 198.51.100.1, 10.0.0.5"), o({ AUTH_TRUSTED_PROXIES: "10.0.0.0/8" })),
  multiNoTrust: getIP(xff("6.6.6.6, 198.51.100.1"), o({})),
  single: getIP(xff("6.6.6.6"), o({})),
  realIp: getIP(new Headers({ "x-real-ip": "198.51.100.2" }), o({ AUTH_IP_ADDRESS_HEADERS: "x-real-ip" })),
  none: getIP(new Headers(), o({})),
}));
