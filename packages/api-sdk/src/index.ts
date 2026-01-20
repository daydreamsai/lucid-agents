// Re-export everything from the generated SDK
export * from './sdk/index.js';

// Re-export client utilities (excluding types that are already exported from sdk/index.js)
export {
  formDataBodySerializer,
  jsonBodySerializer,
  urlSearchParamsBodySerializer,
  buildClientParams,
  serializeQueryKeyValue,
  createClient,
  createConfig,
  mergeHeaders,
} from './sdk/client/index.js';

// Re-export client types (excluding Options and ClientOptions which conflict)
export type {
  Client,
  Config,
  CreateClientConfig,
  RequestOptions,
  RequestResult,
  ResolvedRequestOptions,
  ResponseStyle,
  TDataShape,
  Auth,
  QuerySerializerOptions,
} from './sdk/client/index.js';
