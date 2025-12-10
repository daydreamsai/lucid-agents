// @lucid-agents/hono-runtime
// Stateless multi-agent Hono runtime with OpenAPI support

// Main app factory (with OpenAPI validation and auto-generated docs)
export { createHonoRuntime } from './app';
export type { HonoRuntimeConfig } from './app';

// Simple version without OpenAPI validation (for lighter usage)
export { createHonoRuntime as createHonoRuntimeSimple } from './app-simple';
export type { HonoRuntimeConfig as HonoRuntimeConfigSimple } from './app-simple';

// Store
export {
  createMemoryAgentStore,
  createDrizzleAgentStore,
  DrizzleAgentStore,
  agentsTable,
  SlugExistsError,
} from './store';
export type {
  AgentStore,
  AgentDefinition,
  CreateAgentInput,
  SerializedEntrypoint,
  SerializedPaymentsConfig,
  SerializedWalletsConfig,
  SerializedA2AConfig,
  ListOptions,
  DrizzleStoreOptions,
  AgentRow,
  NewAgentRow,
} from './store';

// Factory (for building agent runtimes from definitions)
export {
  buildRuntimeForAgent,
  RuntimeCache,
} from './factory';
export type { RuntimeFactoryConfig } from './factory';

// OpenAPI schemas and routes (for advanced usage)
export * as schemas from './openapi/schemas';
export * as routes from './openapi/routes';
