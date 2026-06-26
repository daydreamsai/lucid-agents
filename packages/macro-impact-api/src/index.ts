import { buildApp } from "./agent";

const app = buildApp();
const port = Number(process.env.PORT ?? 3000);

export default {
  port,
  fetch: app.fetch.bind(app),
};
