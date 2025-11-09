/* eslint-disable */

// @ts-nocheck

import { Route as rootRouteImport } from "./routes/__root";
import { Route as IndexRouteImport } from "./routes/index";
import { Route as DotwellKnownAgentCardDotjsonRouteImport } from "./routes/[.]well-known/agent-card[.]json";
import { Route as ApiAgentManifestRouteImport } from "./routes/api/agent/manifest";
import { Route as ApiAgentHealthRouteImport } from "./routes/api/agent/health";
import { Route as ApiAgentEntrypointsRouteImport } from "./routes/api/agent/entrypoints";
import { Route as ApiAgentEntrypointsKeyInvokeRouteImport } from "./routes/api/agent/entrypoints/$key/invoke";
import { Route as ApiAgentEntrypointsKeyStreamRouteImport } from "./routes/api/agent/entrypoints/$key/stream";

const IndexRoute = IndexRouteImport.update({
  id: "/",
  path: "/",
  getParentRoute: () => rootRouteImport,
} as any);
const DotwellKnownAgentCardDotjsonRoute =
  DotwellKnownAgentCardDotjsonRouteImport.update({
    id: "/.well-known/agent-card.json",
    path: "/.well-known/agent-card.json",
    getParentRoute: () => rootRouteImport,
  } as any);
const ApiAgentManifestRoute = ApiAgentManifestRouteImport.update({
  id: "/api/agent/manifest",
  path: "/api/agent/manifest",
  getParentRoute: () => rootRouteImport,
} as any);
const ApiAgentHealthRoute = ApiAgentHealthRouteImport.update({
  id: "/api/agent/health",
  path: "/api/agent/health",
  getParentRoute: () => rootRouteImport,
} as any);
const ApiAgentEntrypointsRoute = ApiAgentEntrypointsRouteImport.update({
  id: "/api/agent/entrypoints",
  path: "/api/agent/entrypoints",
  getParentRoute: () => rootRouteImport,
} as any);
const ApiAgentEntrypointsKeyInvokeRoute =
  ApiAgentEntrypointsKeyInvokeRouteImport.update({
    id: "/$key/invoke",
    path: "/$key/invoke",
    getParentRoute: () => ApiAgentEntrypointsRoute,
  } as any);
const ApiAgentEntrypointsKeyStreamRoute =
  ApiAgentEntrypointsKeyStreamRouteImport.update({
    id: "/$key/stream",
    path: "/$key/stream",
    getParentRoute: () => ApiAgentEntrypointsRoute,
  } as any);

const ApiAgentEntrypointsRouteWithChildren = ApiAgentEntrypointsRoute.addChildren(
  () => [ApiAgentEntrypointsKeyInvokeRoute, ApiAgentEntrypointsKeyStreamRoute]
);

export const routeTree = rootRouteImport.addChildren(() => [
  IndexRoute,
  DotwellKnownAgentCardDotjsonRoute,
  ApiAgentManifestRoute,
  ApiAgentHealthRoute,
  ApiAgentEntrypointsRouteWithChildren,
]);
