type JsonSchema = {
  type?: string | string[];
  const?: unknown;
  default?: unknown;
  examples?: unknown[];
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  $ref?: string;
  additionalProperties?: boolean | JsonSchema;
  patternProperties?: Record<string, JsonSchema>;
  minimum?: number;
  maximum?: number;
  format?: string;
  description?: string;
};

function referencedSchema(
  root: JsonSchema,
  reference: string
): JsonSchema | undefined {
  if (reference === '#') return root;
  if (!reference.startsWith('#/')) return undefined;
  let candidate: unknown = root;
  for (const encodedSegment of reference.slice(2).split('/')) {
    if (!candidate || typeof candidate !== 'object') return undefined;
    const segment = encodedSegment.replace(/~1/gu, '/').replace(/~0/gu, '~');
    candidate = (candidate as Record<string, unknown>)[segment];
  }
  return candidate && typeof candidate === 'object'
    ? (candidate as JsonSchema)
    : undefined;
}

function sampleFromSchema(
  schema: JsonSchema | undefined,
  root: JsonSchema,
  stack: Set<JsonSchema>
): unknown {
  if (!schema) return {};
  if (stack.has(schema)) return undefined;
  stack.add(schema);

  let result: unknown;
  if (schema.const !== undefined) {
    result = schema.const;
  } else if (schema.default !== undefined) {
    result = schema.default;
  } else if (schema.examples?.length) {
    result = schema.examples[0];
  } else if (schema.enum?.length) {
    result = schema.enum[0];
  } else if (schema.$ref) {
    result = sampleFromSchema(referencedSchema(root, schema.$ref), root, stack);
  } else if (schema.anyOf?.length || schema.oneOf?.length) {
    result = sampleFromSchema((schema.anyOf ?? schema.oneOf)?.[0], root, stack);
  } else if (schema.allOf?.length) {
    const parts = schema.allOf.map(part => sampleFromSchema(part, root, stack));
    result = parts.every(
      part => part && typeof part === 'object' && !Array.isArray(part)
    )
      ? Object.assign({}, ...parts)
      : parts.find(part => part !== undefined);
  } else if (
    schema.properties ||
    (Array.isArray(schema.type) ? schema.type[0] : schema.type) === 'object'
  ) {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (!schema.required || schema.required.includes(key)) {
        result[key] = sampleFromSchema(child, root, stack);
      }
    }
    if (
      schema.additionalProperties === true &&
      schema.patternProperties === undefined
    ) {
      result.example = 'value';
    } else if (
      schema.additionalProperties &&
      typeof schema.additionalProperties === 'object'
    ) {
      result.example = sampleFromSchema(
        schema.additionalProperties,
        root,
        stack
      );
    }
    stack.delete(schema);
    return result;
  } else if (
    (Array.isArray(schema.type) ? schema.type[0] : schema.type) === 'array'
  ) {
    result = [
      schema.items
        ? (sampleFromSchema(schema.items, root, stack) ?? 'value')
        : 'example',
    ];
  } else if (
    (Array.isArray(schema.type) ? schema.type[0] : schema.type) === 'boolean'
  ) {
    result = false;
  } else if (
    (Array.isArray(schema.type) ? schema.type[0] : schema.type) === 'number' ||
    (Array.isArray(schema.type) ? schema.type[0] : schema.type) === 'integer'
  ) {
    result = schema.minimum ?? schema.maximum ?? 0;
  } else if (
    (Array.isArray(schema.type) ? schema.type[0] : schema.type) === 'null'
  ) {
    result = null;
  } else if (
    (Array.isArray(schema.type) ? schema.type[0] : schema.type) === 'string'
  ) {
    if (schema.format === 'uri' || schema.format === 'url') {
      result = 'https://example.com';
    } else if (schema.format === 'email') {
      result = 'agent@example.com';
    } else {
      result = schema.description ? `<${schema.description}>` : 'string';
    }
  } else {
    result = schema.description ? `<${schema.description}>` : {};
  }

  stack.delete(schema);
  return result;
}

/**
 * Creates an editable JSON request body from a public entrypoint input schema.
 * Required properties are populated from examples, defaults, or safe placeholders.
 */
export function createServicePayloadExample(schema: unknown): string {
  const input =
    schema && typeof schema === 'object'
      ? sampleFromSchema(schema as JsonSchema, schema as JsonSchema, new Set())
      : {};
  return JSON.stringify({ input }, null, 2);
}
