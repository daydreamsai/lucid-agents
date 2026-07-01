import { startGeoIpAgent } from "./index";

const runtime = startGeoIpAgent();

console.log(`[geoip-x402-agent] listening on port ${runtime.port}`);

const shutdown = () => {
  runtime.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);