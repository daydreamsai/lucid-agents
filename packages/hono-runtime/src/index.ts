// @lucid-agents/hono-runtime
// Stateless multi-agent Hono runtime with OpenAPI support

// Main app factory (simple version without OpenAPI validation - Zod 4 compatible)
export { createHonoRuntime } from './app-simple';
export type { HonoRuntimeConfig } from './app-simple';

// OpenAPI version (requires Zod 3 - currently broken with Zod 4)
export { createHonoRuntime as createHonoRuntimeOpenAPI } from './app';
export type { HonoRuntimeConfig as HonoRuntimeConfigOpenAPI } from './app';

// Store
export { createMemoryAgentStore } from './store';
export type {
  AgentStore,
  AgentDefinition,
  CreateAgentInput,
  SerializedEntrypoint,
  SerializedPaymentsConfig,
  SerializedWalletsConfig,
  SerializedA2AConfig,
  ListOptions,
} from './store';
export { SlugExistsError } from './store';

// Factory (for building agent runtimes from definitions)
export {
  buildRuntimeForAgent,
  RuntimeCache,
} from './factory';
export type { RuntimeFactoryConfig } from './factory';

// OpenAPI schemas and routes (for advanced usage)
export * as schemas from './openapi/schemas';
export * as routes from './openapi/routes';
