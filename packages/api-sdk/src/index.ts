// Re-export everything from the generated SDK
export * from './sdk/index.js';

// Re-export client utilities (excluding types that are already exported from sdk/index.js)
export {
  buildClientParams,
  createClient,
  createConfig,
  formDataBodySerializer,
  jsonBodySerializer,
  mergeHeaders,
  serializeQueryKeyValue,
  urlSearchParamsBodySerializer,
} from './sdk/client/index.js';

// Re-export client types (excluding Options and ClientOptions which conflict)
export type {
  Auth,
  Client,
  Config,
  CreateClientConfig,
  QuerySerializerOptions,
  RequestOptions,
  RequestResult,
  ResolvedRequestOptions,
  ResponseStyle,
  TDataShape,
} from './sdk/client/index.js';
