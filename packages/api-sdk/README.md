# @lucid-agents/api-sdk

Generated TypeScript client for the separately operated Lucid Runtime API.
This package does not call a local `AgentRuntime`, does not configure the
open-source SDK, and is not required to expose or buy from a self-hosted Lucid
service.

## Availability boundary

Do not infer a production service from this package. Before integration,
obtain all of the following from the hosted product owner:

- supported production base URL and region;
- authentication/session contract and tenant/project identifiers;
- API/schema version, deprecation policy, and changelog;
- quotas, pricing, service status, data retention, and support path; and
- authorization scope for agent, secret, analytics, identity, and invocation
  operations.

Development hosts previously shown in this README are intentionally not
documented as supported production endpoints.

## Install one channel

Stable:

```bash
bun add @lucid-agents/api-sdk@2.5.0
```

The current repository package is version `3.0.0` and can be ahead of npm.
Keep it with the matching generated API schema; do not upgrade this client
independently and assume server compatibility.

## Create a client

```ts
import { createClient, createConfig } from '@lucid-agents/api-sdk/client';

const baseUrl = process.env.LUCID_RUNTIME_API_BASE_URL;
const token = process.env.LUCID_RUNTIME_API_TOKEN;

if (!baseUrl || !token) {
  throw new Error('Hosted Runtime API configuration is required');
}

const client = createClient(
  createConfig({
    baseUrl,
    headers: {
      authorization: `Bearer ${token}`,
    },
  })
);
```

The bearer example is illustrative. Use only the authentication mechanism and
header/cookie behavior specified by your service contract. Never expose an
administrative token through browser code.

## Call generated paths

The client and types are generated from the OpenAPI snapshot committed under
`src/sdk/`. In the current repository snapshot:

```ts
const response = await client.GET('/api/agents', {
  params: {
    query: { limit: 10, offset: 0 },
  },
});

if (response.error) {
  throw new Error(`Runtime API request failed: ${response.response.status}`);
}

const agents = response.data;
```

Use TypeScript completion from the installed package as the path/body source of
truth. A path existing in generated code proves it existed in the input schema;
it does not prove the endpoint is enabled for your tenant or current server.

Generated operation functions and types are also exported from the package
root. Client primitives are available from `@lucid-agents/api-sdk/client`.

## React Query

The optional `@lucid-agents/api-sdk/react-query` export is generated for
TanStack Query v5. Install `@tanstack/react-query` in the application and use
the generated option/hook names that exist in your pinned package.

Keep authentication and privileged requests on the server unless the hosted
product explicitly documents a browser-safe session model and CORS policy.

## Error and compatibility handling

- Check both `response.error` and the HTTP status; generated types do not make
  an authorization or service failure impossible.
- Do not retry create/update/secret/invocation operations unless the server
  documents idempotency and you supply its required key.
- Treat timeout after a mutating request as ambiguous and query by a stable
  operation/resource ID before repeating it.
- Redact auth headers, secret bodies, wallet/payment credentials, and tenant
  data from logs.
- Pin the package and run a contract smoke test against the intended server
  before upgrade.

## Regenerate from an authorized schema

Set the OpenAPI document URL explicitly:

```bash
cd packages/api-sdk
OPENAPI_URL=https://YOUR_AUTHORIZED_SCHEMA_URL bun run generate
bun run type-check
bun run build
```

Review the generated diff for removed/renamed paths, request/response changes,
auth changes, new sensitive fields, and query-hook churn. A release should tie
the generated package version to the schema/server release that produced it.

The repository generator currently contains an internal development fallback
for maintainers. Consumer and release workflows must not rely on that fallback
as a public availability promise.

## Open-source SDK versus hosted API client

| Need                                                | Package/path                                               |
| --------------------------------------------------- | ---------------------------------------------------------- |
| Build a self-hosted typed paid service              | `@lucid-agents/core`, extensions, and a framework adapter  |
| Call a self-hosted service over its public contract | Fetch/x402 client or Lucid Agent Card client               |
| Administer the separately hosted Runtime API        | This generated package, after receiving a service contract |

See the [hosted-product boundary](../../lucid-docs/content/docs/products/hosted-platform.mdx)
and [release-channel matrix](../../lucid-docs/content/docs/reference/release-channels.mdx).

## License

MIT
