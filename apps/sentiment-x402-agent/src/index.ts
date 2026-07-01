import { config } from "./config";
import { startServer } from "./server";

const running = startServer(config.port);

console.log(`[sentiment-x402-agent] listening on port ${running.port}`);
console.log(`[sentiment-x402-agent] POST /sentiment price: $${config.priceUsd.toFixed(3)} via x402`);