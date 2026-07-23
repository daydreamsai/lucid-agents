import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { classifyOpenApiCompatibility } from '../openapi-compatibility';

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(path.join(import.meta.dir, 'fixtures', `${name}.json`), 'utf8')
  ) as unknown;
}

type MutableAgentFixture = {
  components: {
    schemas: {
      Agent: {
        properties: Record<string, Record<string, unknown>>;
        required: string[];
      };
    };
  };
};

function mutableFixture(name: string): MutableAgentFixture {
  return structuredClone(fixture(name)) as MutableAgentFixture;
}

function responseSchemaDocument(
  schema: unknown,
  options: { includeSchema?: boolean } = {}
): unknown {
  const includeSchema = options.includeSchema ?? true;
  return {
    openapi: '3.1.0',
    info: { title: 'Compatibility fixture', version: '1.0.0' },
    paths: {
      '/result': {
        get: {
          operationId: 'getResult',
          responses: {
            '200': {
              description: 'Result',
              content: {
                'application/json': includeSchema ? { schema } : {},
              },
            },
          },
        },
      },
    },
  };
}

function referencedParameterDocument(
  parameter: unknown,
  reference = '#/components/parameters/Limit'
): unknown {
  return {
    openapi: '3.0.3',
    info: { title: 'Compatibility fixture', version: '1.0.0' },
    paths: {
      '/agents': {
        get: {
          operationId: 'listAgents',
          parameters: [{ $ref: reference }],
          responses: { '200': { description: 'Agents' } },
        },
      },
    },
    components: { parameters: { Limit: parameter } },
  };
}

function referencedResponseDocument(
  response: unknown,
  reference = '#/components/responses/Agent'
): unknown {
  return {
    openapi: '3.0.3',
    info: { title: 'Compatibility fixture', version: '1.0.0' },
    paths: {
      '/agent': {
        get: {
          operationId: 'getAgent',
          responses: { '200': { $ref: reference } },
        },
      },
    },
    components: { responses: { Agent: response } },
  };
}

describe('classifyOpenApiCompatibility', () => {
  test('classifies new operations and optional schema fields as additive', () => {
    const result = classifyOpenApiCompatibility(
      fixture('baseline'),
      fixture('additive')
    );

    expect(result.classification).toBe('additive');
    expect(result.recommendedBump).toBe('minor');
    expect(result.changes).toContainEqual({
      kind: 'added-operation',
      location: 'GET /agents',
      message: 'Operation was added',
    });
  });

  test('classifies a removed operation as breaking', () => {
    const result = classifyOpenApiCompatibility(
      fixture('baseline'),
      fixture('removed-operation')
    );

    expect(result.classification).toBe('breaking');
    expect(result.recommendedBump).toBeNull();
    expect(result.changes).toContainEqual({
      kind: 'removed-operation',
      location: 'POST /agents',
      message: 'Operation was removed',
    });
  });

  test('classifies required fields, tighter bounds, and removed enum values as breaking', () => {
    const result = classifyOpenApiCompatibility(
      fixture('baseline'),
      fixture('narrowed-request')
    );

    expect(result.classification).toBe('breaking');
    expect(result.recommendedBump).toBeNull();
    expect(result.changes.map(change => change.kind)).toEqual(
      expect.arrayContaining([
        'required-property-added',
        'minimum-tightened',
        'enum-value-removed',
      ])
    );
  });

  test('classifies weakened response guarantees and changed output unions as breaking', () => {
    const result = classifyOpenApiCompatibility(
      fixture('baseline'),
      fixture('changed-response')
    );

    expect(result.classification).toBe('breaking');
    expect(result.recommendedBump).toBeNull();
    expect(result.changes.map(change => change.kind)).toEqual(
      expect.arrayContaining([
        'required-property-removed',
        'required-property-added',
        'nullable-added',
        'enum-value-removed',
        'enum-value-added',
      ])
    );
  });

  test('treats a required response field becoming optional as breaking', () => {
    const next = mutableFixture('baseline');
    next.components.schemas.Agent.required =
      next.components.schemas.Agent.required.filter(name => name !== 'id');

    expect(
      classifyOpenApiCompatibility(fixture('baseline'), next).classification
    ).toBe('breaking');
  });

  test('treats a newly required response field as breaking for typed mocks', () => {
    const next = mutableFixture('baseline');
    next.components.schemas.Agent.required.push('createdAt');
    next.components.schemas.Agent.properties.createdAt = {
      type: 'string',
      format: 'date-time',
    };

    expect(
      classifyOpenApiCompatibility(fixture('baseline'), next).classification
    ).toBe('breaking');
  });

  test('treats a widened response enum as breaking for exhaustive consumers', () => {
    const next = mutableFixture('baseline');
    next.components.schemas.Agent.properties.status!.enum = [
      'draft',
      'active',
      'archived',
    ];

    expect(
      classifyOpenApiCompatibility(fixture('baseline'), next).classification
    ).toBe('breaking');
  });

  test('treats nullable expansion in a response as breaking', () => {
    const next = mutableFixture('baseline');
    next.components.schemas.Agent.properties.name!.nullable = true;

    expect(
      classifyOpenApiCompatibility(fixture('baseline'), next).classification
    ).toBe('breaking');
  });

  test('classifies a missing baseline as ambiguous and never recommends patch', () => {
    const result = classifyOpenApiCompatibility(undefined, fixture('baseline'));

    expect(result.classification).toBe('ambiguous');
    expect(result.recommendedBump).toBeNull();
    expect(result.changes[0]?.kind).toBe('missing-baseline');
  });

  test('classifies unresolved external references as ambiguous', () => {
    const next = structuredClone(fixture('baseline')) as {
      components: { schemas: { CreateAgent: unknown } };
    };
    next.components.schemas.CreateAgent = {
      $ref: 'https://schemas.example.com/create-agent.json',
    };

    const result = classifyOpenApiCompatibility(fixture('baseline'), next);

    expect(result.classification).toBe('ambiguous');
    expect(result.recommendedBump).toBeNull();
    expect(result.changes.map(change => change.kind)).toContain(
      'external-reference'
    );
  });

  test('blocks removal of a documented response schema', () => {
    const result = classifyOpenApiCompatibility(
      responseSchemaDocument({ type: 'string' }),
      responseSchemaDocument(undefined, { includeSchema: false })
    );

    expect(result.classification).toBe('breaking');
    expect(result.recommendedBump).toBeNull();
    expect(result.changes).toContainEqual({
      kind: 'schema-removed',
      location: 'GET /result response 200 application/json',
      message: 'Documented schema was removed',
    });
  });

  test('blocks addition of a schema where the response was previously untyped', () => {
    const result = classifyOpenApiCompatibility(
      responseSchemaDocument(undefined, { includeSchema: false }),
      responseSchemaDocument({ type: 'string' })
    );

    expect(result.classification).toBe('breaking');
    expect(result.recommendedBump).toBeNull();
    expect(result.changes.map(change => change.kind)).toContain('schema-added');
  });

  test('blocks OpenAPI 3.1 true-to-false boolean schema narrowing', () => {
    const result = classifyOpenApiCompatibility(
      responseSchemaDocument(true),
      responseSchemaDocument(false)
    );

    expect(result.classification).toBe('breaking');
    expect(result.recommendedBump).toBeNull();
    expect(result.changes).toContainEqual({
      kind: 'boolean-schema-narrowed',
      location: 'GET /result response 200 application/json',
      message: 'Boolean schema changed from true to false',
    });
  });

  test('detects narrowing through a local parameter reference', () => {
    const parameter = (minimum: number) => ({
      name: 'limit',
      in: 'query',
      schema: { type: 'integer', minimum },
    });
    const result = classifyOpenApiCompatibility(
      referencedParameterDocument(parameter(0)),
      referencedParameterDocument(parameter(10))
    );

    expect(result.classification).toBe('breaking');
    expect(result.recommendedBump).toBeNull();
    expect(result.changes.map(change => change.kind)).toContain(
      'minimum-tightened'
    );
  });

  test('detects weakened output guarantees through a local response reference', () => {
    const response = (required: string[]) => ({
      description: 'Agent',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required,
            properties: { id: { type: 'string' } },
          },
        },
      },
    });
    const result = classifyOpenApiCompatibility(
      referencedResponseDocument(response(['id'])),
      referencedResponseDocument(response([]))
    );

    expect(result.classification).toBe('breaking');
    expect(result.recommendedBump).toBeNull();
    expect(result.changes.map(change => change.kind)).toContain(
      'required-property-removed'
    );
  });

  test.each([
    [
      'external',
      referencedParameterDocument({
        name: 'limit',
        in: 'query',
        schema: { type: 'integer' },
      }),
      referencedParameterDocument(
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer' },
        },
        'https://schemas.example.com/limit.json'
      ),
      'external-reference',
    ],
    [
      'unresolved',
      referencedResponseDocument({
        description: 'Agent',
        content: {
          'application/json': { schema: { type: 'string' } },
        },
      }),
      referencedResponseDocument(
        {
          description: 'Agent',
          content: {
            'application/json': { schema: { type: 'string' } },
          },
        },
        '#/components/responses/Missing'
      ),
      'unresolved-reference',
    ],
    [
      'cyclic',
      referencedParameterDocument({
        name: 'limit',
        in: 'query',
        schema: { type: 'integer' },
      }),
      {
        openapi: '3.0.3',
        info: { title: 'Compatibility fixture', version: '1.0.0' },
        paths: {
          '/agents': {
            get: {
              operationId: 'listAgents',
              parameters: [{ $ref: '#/components/parameters/A' }],
              responses: { '200': { description: 'Agents' } },
            },
          },
        },
        components: {
          parameters: {
            A: { $ref: '#/components/parameters/B' },
            B: { $ref: '#/components/parameters/A' },
          },
        },
      },
      'reference-cycle',
    ],
  ])(
    'fails closed for %s object references',
    (_label, previous, next, expectedKind) => {
      const result = classifyOpenApiCompatibility(previous, next);

      expect(result.classification).toBe('ambiguous');
      expect(result.recommendedBump).toBeNull();
      expect(result.changes.map(change => change.kind)).toContain(expectedKind);
    }
  );

  test('fails closed for an unclassified semantic document change', () => {
    const next = structuredClone(fixture('baseline')) as Record<
      string,
      unknown
    >;
    next.servers = [{ url: 'https://runtime.example.com' }];

    const result = classifyOpenApiCompatibility(fixture('baseline'), next);

    expect(result.classification).toBe('ambiguous');
    expect(result.recommendedBump).toBeNull();
    expect(result.changes).toContainEqual({
      kind: 'unsupported-openapi-field-changed',
      location: 'openapi.servers',
      message: 'Unsupported semantic field "servers" changed',
    });
  });

  test('does not hide an unclassified semantic change behind an additive change', () => {
    const next = structuredClone(fixture('additive')) as Record<
      string,
      unknown
    >;
    next.servers = [{ url: 'https://runtime.example.com' }];

    const result = classifyOpenApiCompatibility(fixture('baseline'), next);

    expect(result.classification).toBe('ambiguous');
    expect(result.recommendedBump).toBeNull();
    expect(result.changes.map(change => change.kind)).toEqual(
      expect.arrayContaining([
        'added-operation',
        'unsupported-openapi-field-changed',
      ])
    );
  });

  test('fails closed for unsupported semantics nested in an existing operation', () => {
    const next = structuredClone(fixture('additive')) as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
    };
    next.paths['/agents']!.post!.callbacks = {
      status: { '{$request.body#/callbackUrl}': {} },
    };

    const result = classifyOpenApiCompatibility(fixture('baseline'), next);

    expect(result.classification).toBe('ambiguous');
    expect(result.recommendedBump).toBeNull();
    expect(result.changes.map(change => change.kind)).toEqual(
      expect.arrayContaining([
        'added-operation',
        'unsupported-operation-field-changed',
      ])
    );
  });

  test('fails closed when semantic schema siblings accompany a reference', () => {
    const document = (maxLength: number) => ({
      openapi: '3.1.0',
      info: { title: 'Compatibility fixture', version: '1.0.0' },
      paths: {
        '/result': {
          get: {
            operationId: 'getResult',
            responses: {
              '200': {
                description: 'Result',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/Result',
                      maxLength,
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: { schemas: { Result: { type: 'string' } } },
    });

    const result = classifyOpenApiCompatibility(document(100), document(10));

    expect(result.classification).toBe('ambiguous');
    expect(result.recommendedBump).toBeNull();
    expect(result.changes.map(change => change.kind)).toContain(
      'reference-siblings-unsupported'
    );
  });

  test('treats newly effective top-level security as breaking', () => {
    const previous = structuredClone(fixture('baseline')) as {
      components: Record<string, unknown>;
    };
    previous.components.securitySchemes = {
      bearerAuth: { type: 'http', scheme: 'bearer' },
    };
    const next = structuredClone(previous) as typeof previous & {
      security?: Array<Record<string, string[]>>;
    };
    next.security = [{ bearerAuth: [] }];

    const result = classifyOpenApiCompatibility(previous, next);

    expect(result.classification).toBe('breaking');
    expect(result.recommendedBump).toBeNull();
    expect(result.changes).toContainEqual({
      kind: 'security-required',
      location: 'POST /agents',
      message: 'Operation now requires authorization',
    });
  });

  test('treats adding an operationId as breaking for generated method names', () => {
    const previous = structuredClone(fixture('baseline')) as {
      paths: {
        '/agents': {
          post: { operationId?: string };
        };
      };
    };
    delete previous.paths['/agents'].post.operationId;

    const result = classifyOpenApiCompatibility(previous, fixture('baseline'));

    expect(result.classification).toBe('breaking');
    expect(result.recommendedBump).toBeNull();
    expect(result.changes.map(change => change.kind)).toContain(
      'operation-id-changed'
    );
  });

  test('treats added response statuses as widened public output unions', () => {
    const result = classifyOpenApiCompatibility(
      fixture('baseline'),
      fixture('added-error-responses')
    );

    expect(result.classification).toBe('breaking');
    expect(result.recommendedBump).toBeNull();
    expect(result.changes).toEqual(
      expect.arrayContaining([
        {
          kind: 'response-added',
          location: 'POST /agents response 409',
          message:
            'Documented response was added, widening the generated output union',
        },
        {
          kind: 'response-added',
          location: 'POST /agents response 429',
          message:
            'Documented response was added, widening the generated output union',
        },
      ])
    );
  });
});
