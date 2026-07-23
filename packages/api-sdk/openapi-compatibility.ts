export type CompatibilityClassification =
  | 'unchanged'
  | 'compatible'
  | 'additive'
  | 'breaking'
  | 'ambiguous';

export type CompatibilityChange = {
  kind: string;
  location: string;
  message: string;
};

export type CompatibilityResult = {
  classification: CompatibilityClassification;
  recommendedBump: 'patch' | 'minor' | null;
  changes: CompatibilityChange[];
};

type JsonObject = Record<string, unknown>;
type SchemaMode = 'input' | 'output';

const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

class Comparison {
  readonly changes: CompatibilityChange[] = [];
  readonly oldDocument: JsonObject;
  readonly newDocument: JsonObject;
  readonly seenSchemaPairs = {
    input: new WeakMap<object, WeakSet<object>>(),
    output: new WeakMap<object, WeakSet<object>>(),
  };
  hasAdditive = false;
  hasBreaking = false;
  hasAmbiguous = false;

  constructor(oldDocument: JsonObject, newDocument: JsonObject) {
    this.oldDocument = oldDocument;
    this.newDocument = newDocument;
  }

  add(
    severity: 'additive' | 'breaking' | 'ambiguous',
    change: CompatibilityChange
  ): void {
    const key = `${change.kind}\0${change.location}\0${change.message}`;
    const duplicate = this.changes.some(
      existing =>
        `${existing.kind}\0${existing.location}\0${existing.message}` === key
    );
    if (!duplicate) {
      this.changes.push(change);
    }

    if (severity === 'additive') this.hasAdditive = true;
    if (severity === 'breaking') this.hasBreaking = true;
    if (severity === 'ambiguous') this.hasAmbiguous = true;
  }

  markSeen(
    mode: SchemaMode,
    oldSchema: JsonObject,
    newSchema: JsonObject
  ): boolean {
    const pairs = this.seenSchemaPairs[mode];
    const existing = pairs.get(oldSchema);
    if (existing?.has(newSchema)) return true;
    const next = existing ?? new WeakSet<object>();
    next.add(newSchema);
    pairs.set(oldSchema, next);
    return false;
  }

  hasSeen(
    mode: SchemaMode,
    oldSchema: JsonObject,
    newSchema: JsonObject
  ): boolean {
    return this.seenSchemaPairs[mode].get(oldSchema)?.has(newSchema) ?? false;
  }
}

function asObject(value: unknown): JsonObject | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as JsonObject;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stable(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stable).join(',')}]`;
  }
  const object = asObject(value);
  if (object) {
    return `{${Object.keys(object)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stable(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function compareUnsupportedFields(
  comparison: Comparison,
  oldObject: JsonObject,
  newObject: JsonObject,
  options: {
    handled: readonly string[];
    ignored?: readonly string[];
    location: string;
    scope: string;
  }
): void {
  const handled = new Set(options.handled);
  const ignored = new Set(options.ignored ?? []);
  const keys = new Set([...Object.keys(oldObject), ...Object.keys(newObject)]);
  for (const key of keys) {
    if (handled.has(key) || ignored.has(key)) continue;
    if (stable(oldObject[key]) === stable(newObject[key])) continue;
    comparison.add('ambiguous', {
      kind: `unsupported-${options.scope}-field-changed`,
      location: `${options.location}.${key}`,
      message: `Unsupported semantic field "${key}" changed`,
    });
  }
}

function resolvePointer(document: JsonObject, reference: string): unknown {
  if (!reference.startsWith('#/')) return undefined;
  return reference
    .slice(2)
    .split('/')
    .map(segment => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce<unknown>(
      (current, segment) => asObject(current)?.[segment],
      document
    );
}

function resolveReferencedValue(
  comparison: Comparison,
  document: JsonObject,
  value: unknown,
  location: string,
  visitedReferences = new Set<string>()
): unknown {
  const object = asObject(value);
  if (!object || object.$ref === undefined) return value;
  const semanticSiblings = Object.keys(object).filter(
    key => !['$ref', 'summary', 'description'].includes(key)
  );
  if (semanticSiblings.length > 0) {
    comparison.add('ambiguous', {
      kind: 'reference-siblings-unsupported',
      location,
      message: `Cannot prove compatibility for semantic reference siblings: ${semanticSiblings.join(', ')}`,
    });
  }
  const reference = object.$ref;
  if (typeof reference !== 'string') {
    comparison.add('ambiguous', {
      kind: 'invalid-reference',
      location,
      message: 'Reference value must be a string',
    });
    return undefined;
  }
  if (!reference.startsWith('#/')) {
    comparison.add('ambiguous', {
      kind: 'external-reference',
      location,
      message: `Cannot prove compatibility for external reference ${reference}`,
    });
    return undefined;
  }
  if (visitedReferences.has(reference)) {
    comparison.add('ambiguous', {
      kind: 'reference-cycle',
      location,
      message: `Cannot prove compatibility for direct reference cycle ${reference}`,
    });
    return undefined;
  }
  const resolved = resolvePointer(document, reference);
  if (resolved === undefined) {
    comparison.add('ambiguous', {
      kind: 'unresolved-reference',
      location,
      message: `Cannot resolve local reference ${reference}`,
    });
    return undefined;
  }
  const nextVisitedReferences = new Set(visitedReferences);
  nextVisitedReferences.add(reference);
  return resolveReferencedValue(
    comparison,
    document,
    resolved,
    location,
    nextVisitedReferences
  );
}

function resolveSchema(
  comparison: Comparison,
  document: JsonObject,
  value: unknown,
  location: string
): JsonObject | boolean | undefined {
  const resolved = resolveReferencedValue(
    comparison,
    document,
    value,
    location
  );
  if (typeof resolved === 'boolean') return resolved;
  const schema = asObject(resolved);
  if (schema) return schema;
  if (resolved !== undefined) {
    comparison.add('ambiguous', {
      kind: 'invalid-schema-shape',
      location,
      message: 'Schema is neither an object nor an OpenAPI 3.1 boolean schema',
    });
  }
  return undefined;
}

function resolveReferencedObject(
  comparison: Comparison,
  document: JsonObject,
  value: unknown,
  location: string,
  objectKind: string
): JsonObject | undefined {
  const resolved = resolveReferencedValue(
    comparison,
    document,
    value,
    location
  );
  const object = asObject(resolved);
  if (object) return object;
  if (resolved !== undefined) {
    comparison.add('ambiguous', {
      kind: `invalid-${objectKind}`,
      location,
      message: `${objectKind} must resolve to an object`,
    });
  }
  return undefined;
}

function compareEnum(
  comparison: Comparison,
  oldSchema: JsonObject,
  newSchema: JsonObject,
  location: string,
  mode: SchemaMode
): void {
  const oldValues = asArray(oldSchema.enum);
  const newValues = asArray(newSchema.enum);
  if (oldValues.length === 0 && newValues.length === 0) return;

  for (const value of oldValues) {
    if (!newValues.some(candidate => stable(candidate) === stable(value))) {
      comparison.add('breaking', {
        kind: 'enum-value-removed',
        location,
        message: `Enum value ${stable(value)} was removed`,
      });
    }
  }
  for (const value of newValues) {
    if (!oldValues.some(candidate => stable(candidate) === stable(value))) {
      comparison.add(mode === 'output' ? 'breaking' : 'additive', {
        kind: 'enum-value-added',
        location,
        message:
          mode === 'output'
            ? `Response enum gained ${stable(value)}, widening the generated output union`
            : `Enum value ${stable(value)} was added`,
      });
    }
  }
}

function compareBounds(
  comparison: Comparison,
  oldSchema: JsonObject,
  newSchema: JsonObject,
  location: string
): void {
  const minimumKeys = ['minimum', 'exclusiveMinimum', 'minLength', 'minItems'];
  const maximumKeys = ['maximum', 'exclusiveMaximum', 'maxLength', 'maxItems'];

  for (const key of minimumKeys) {
    const oldValue = oldSchema[key];
    const newValue = newSchema[key];
    if (
      typeof newValue === 'number' &&
      (typeof oldValue !== 'number' || newValue > oldValue)
    ) {
      comparison.add('breaking', {
        kind: 'minimum-tightened',
        location,
        message: `${key} increased from ${String(oldValue)} to ${newValue}`,
      });
    }
  }

  for (const key of maximumKeys) {
    const oldValue = oldSchema[key];
    const newValue = newSchema[key];
    if (
      typeof newValue === 'number' &&
      (typeof oldValue !== 'number' || newValue < oldValue)
    ) {
      comparison.add('breaking', {
        kind: 'maximum-tightened',
        location,
        message: `${key} decreased from ${String(oldValue)} to ${newValue}`,
      });
    }
  }
}

function compareSchema(
  comparison: Comparison,
  oldValue: unknown,
  newValue: unknown,
  location: string,
  mode: SchemaMode
): void {
  const oldPresent = oldValue !== undefined;
  const newPresent = newValue !== undefined;
  if (!oldPresent && !newPresent) return;
  if (oldPresent !== newPresent) {
    comparison.add('breaking', {
      kind: oldPresent ? 'schema-removed' : 'schema-added',
      location,
      message: oldPresent
        ? 'Documented schema was removed'
        : 'A documented schema was added',
    });
    return;
  }

  const oldSchema = resolveSchema(
    comparison,
    comparison.oldDocument,
    oldValue,
    location
  );
  const newSchema = resolveSchema(
    comparison,
    comparison.newDocument,
    newValue,
    location
  );
  if (oldSchema === undefined || newSchema === undefined) return;

  const oldBoolean = typeof oldSchema === 'boolean';
  const newBoolean = typeof newSchema === 'boolean';
  if (oldBoolean || newBoolean) {
    if (oldBoolean && newBoolean) {
      if (oldSchema === newSchema) return;
      comparison.add(
        oldSchema === false && newSchema === true && mode === 'input'
          ? 'additive'
          : 'breaking',
        {
          kind:
            oldSchema === true && newSchema === false
              ? 'boolean-schema-narrowed'
              : 'boolean-schema-widened',
          location,
          message: `Boolean schema changed from ${String(oldSchema)} to ${String(newSchema)}`,
        }
      );
      return;
    }
    comparison.add('ambiguous', {
      kind: 'boolean-schema-shape-changed',
      location,
      message: 'Schema changed between boolean and object forms',
    });
    return;
  }

  if (comparison.markSeen(mode, oldSchema, newSchema)) return;
  compareUnsupportedFields(comparison, oldSchema, newSchema, {
    handled: [
      '$ref',
      'type',
      'format',
      'const',
      'nullable',
      'enum',
      'allOf',
      'anyOf',
      'oneOf',
      'not',
      'properties',
      'required',
      'items',
    ],
    ignored: [
      'title',
      'description',
      '$comment',
      'default',
      'examples',
      'example',
      'deprecated',
      'xml',
      'externalDocs',
    ],
    location,
    scope: 'schema',
  });

  for (const composite of ['allOf', 'anyOf', 'oneOf', 'not']) {
    if (stable(oldSchema[composite]) !== stable(newSchema[composite])) {
      comparison.add('ambiguous', {
        kind: 'composite-schema-changed',
        location,
        message: `${composite} changed and requires review`,
      });
    }
  }

  for (const key of ['type', 'format', 'const']) {
    if (stable(oldSchema[key]) !== stable(newSchema[key])) {
      comparison.add('breaking', {
        kind: 'schema-shape-changed',
        location,
        message: `${key} changed from ${stable(oldSchema[key])} to ${stable(newSchema[key])}`,
      });
    }
  }

  if (oldSchema.nullable === true && newSchema.nullable !== true) {
    comparison.add('breaking', {
      kind: 'nullable-removed',
      location,
      message: 'Schema no longer accepts null',
    });
  } else if (oldSchema.nullable !== true && newSchema.nullable === true) {
    comparison.add(mode === 'output' ? 'breaking' : 'additive', {
      kind: 'nullable-added',
      location,
      message:
        mode === 'output'
          ? 'Response may now be null'
          : 'Schema now accepts null',
    });
  }

  compareEnum(comparison, oldSchema, newSchema, location, mode);
  compareBounds(comparison, oldSchema, newSchema, location);

  if (
    oldSchema.additionalProperties !== false &&
    newSchema.additionalProperties === false
  ) {
    comparison.add('breaking', {
      kind: 'additional-properties-disabled',
      location,
      message: 'Additional object properties are no longer accepted',
    });
  }

  const oldProperties = asObject(oldSchema.properties) ?? {};
  const newProperties = asObject(newSchema.properties) ?? {};
  const oldRequired = new Set(
    asArray(oldSchema.required).filter(
      (value): value is string => typeof value === 'string'
    )
  );
  const newRequired = new Set(
    asArray(newSchema.required).filter(
      (value): value is string => typeof value === 'string'
    )
  );

  for (const [name, oldProperty] of Object.entries(oldProperties)) {
    const propertyLocation = `${location}.${name}`;
    if (!(name in newProperties)) {
      comparison.add('breaking', {
        kind: 'property-removed',
        location: propertyLocation,
        message: 'Schema property was removed',
      });
      continue;
    }
    if (!oldRequired.has(name) && newRequired.has(name)) {
      comparison.add('breaking', {
        kind: 'required-property-added',
        location: propertyLocation,
        message: 'Existing property became required',
      });
    } else if (oldRequired.has(name) && !newRequired.has(name)) {
      comparison.add(mode === 'output' ? 'breaking' : 'additive', {
        kind: 'required-property-removed',
        location: propertyLocation,
        message:
          mode === 'output'
            ? 'Required response property became optional'
            : 'Existing property became optional',
      });
    }
    compareSchema(
      comparison,
      oldProperty,
      newProperties[name],
      propertyLocation,
      mode
    );
  }

  for (const [name] of Object.entries(newProperties)) {
    if (name in oldProperties) continue;
    const propertyLocation = `${location}.${name}`;
    if (newRequired.has(name)) {
      comparison.add('breaking', {
        kind: 'required-property-added',
        location: propertyLocation,
        message:
          mode === 'output'
            ? 'New response property is required by generated types'
            : 'New request property is required',
      });
    } else {
      comparison.add('additive', {
        kind: 'property-added',
        location: propertyLocation,
        message: 'Schema property was added',
      });
    }
  }

  if (oldSchema.items !== undefined || newSchema.items !== undefined) {
    if (oldSchema.items === undefined || newSchema.items === undefined) {
      comparison.add('breaking', {
        kind: 'array-items-changed',
        location,
        message: 'Array item schema was added or removed',
      });
    } else {
      compareSchema(
        comparison,
        oldSchema.items,
        newSchema.items,
        `${location}[]`,
        mode
      );
    }
  }
}

function parameterKey(parameter: JsonObject): string | undefined {
  return typeof parameter.name === 'string' && typeof parameter.in === 'string'
    ? `${parameter.in}:${parameter.name}`
    : undefined;
}

function mergeParameters(
  comparison: Comparison,
  document: JsonObject,
  pathItem: JsonObject,
  operation: JsonObject,
  location: string
): { complete: boolean; values: Map<string, JsonObject> } {
  const valuesByKey = new Map<string, JsonObject>();
  let complete = true;
  const values = [
    ...asArray(pathItem.parameters),
    ...asArray(operation.parameters),
  ];
  for (const [index, value] of values.entries()) {
    const parameter = resolveReferencedObject(
      comparison,
      document,
      value,
      `${location} parameter ${index}`,
      'parameter'
    );
    if (!parameter) {
      complete = false;
      continue;
    }
    const key = parameterKey(parameter);
    if (key) {
      valuesByKey.set(key, parameter);
    } else {
      complete = false;
      comparison.add('ambiguous', {
        kind: 'invalid-parameter',
        location: `${location} parameter ${index}`,
        message: 'Parameter must declare string name and in fields',
      });
    }
  }
  return { complete, values: valuesByKey };
}

function compareParameters(
  comparison: Comparison,
  oldPath: JsonObject,
  oldOperation: JsonObject,
  newPath: JsonObject,
  newOperation: JsonObject,
  location: string
): void {
  const oldParameterMerge = mergeParameters(
    comparison,
    comparison.oldDocument,
    oldPath,
    oldOperation,
    location
  );
  const newParameterMerge = mergeParameters(
    comparison,
    comparison.newDocument,
    newPath,
    newOperation,
    location
  );
  const oldParameters = oldParameterMerge.values;
  const newParameters = newParameterMerge.values;

  for (const [key, oldParameter] of oldParameters) {
    const newParameter = newParameters.get(key);
    if (!newParameter) {
      if (!newParameterMerge.complete) continue;
      comparison.add('breaking', {
        kind: 'parameter-removed',
        location: `${location} parameter ${key}`,
        message: 'Operation parameter was removed',
      });
      continue;
    }
    compareUnsupportedFields(comparison, oldParameter, newParameter, {
      handled: ['name', 'in', 'required', 'schema'],
      ignored: ['description', 'example', 'examples'],
      location: `${location} parameter ${key}`,
      scope: 'parameter',
    });
    if (oldParameter.required !== true && newParameter.required === true) {
      comparison.add('breaking', {
        kind: 'required-parameter-added',
        location: `${location} parameter ${key}`,
        message: 'Existing parameter became required',
      });
    }
    compareSchema(
      comparison,
      oldParameter.schema,
      newParameter.schema,
      `${location} parameter ${key}`,
      'input'
    );
  }

  for (const [key, newParameter] of newParameters) {
    if (oldParameters.has(key)) continue;
    if (!oldParameterMerge.complete) continue;
    comparison.add(newParameter.required === true ? 'breaking' : 'additive', {
      kind:
        newParameter.required === true
          ? 'required-parameter-added'
          : 'parameter-added',
      location: `${location} parameter ${key}`,
      message:
        newParameter.required === true
          ? 'New operation parameter is required'
          : 'Optional operation parameter was added',
    });
  }
}

function compareContent(
  comparison: Comparison,
  oldContentValue: unknown,
  newContentValue: unknown,
  location: string,
  mode: SchemaMode
): void {
  const oldContent = asObject(oldContentValue) ?? {};
  const newContent = asObject(newContentValue) ?? {};
  for (const [mediaType, oldMediaValue] of Object.entries(oldContent)) {
    const newMediaValue = newContent[mediaType];
    if (newMediaValue === undefined) {
      comparison.add('breaking', {
        kind: 'media-type-removed',
        location: `${location} ${mediaType}`,
        message: 'Content media type was removed',
      });
      continue;
    }
    const oldMedia = asObject(oldMediaValue);
    const newMedia = asObject(newMediaValue);
    if (!oldMedia || !newMedia) {
      comparison.add('ambiguous', {
        kind: 'invalid-media-type',
        location: `${location} ${mediaType}`,
        message: 'Media type definition must be an object',
      });
      continue;
    }
    compareUnsupportedFields(comparison, oldMedia, newMedia, {
      handled: ['schema'],
      ignored: ['example', 'examples'],
      location: `${location} ${mediaType}`,
      scope: 'media-type',
    });
    compareSchema(
      comparison,
      oldMedia.schema,
      newMedia.schema,
      `${location} ${mediaType}`,
      mode
    );
  }
  for (const mediaType of Object.keys(newContent)) {
    if (!(mediaType in oldContent)) {
      comparison.add('additive', {
        kind: 'media-type-added',
        location: `${location} ${mediaType}`,
        message: 'Content media type was added',
      });
    }
  }
}

function effectiveSecurity(
  document: JsonObject,
  operation: JsonObject
): unknown {
  return Object.prototype.hasOwnProperty.call(operation, 'security')
    ? operation.security
    : document.security;
}

function compareOperation(
  comparison: Comparison,
  oldPath: JsonObject,
  oldOperation: JsonObject,
  newPath: JsonObject,
  newOperation: JsonObject,
  location: string
): void {
  compareUnsupportedFields(comparison, oldOperation, newOperation, {
    handled: [
      'operationId',
      'parameters',
      'requestBody',
      'responses',
      'security',
    ],
    ignored: ['tags', 'summary', 'description', 'externalDocs'],
    location,
    scope: 'operation',
  });

  if (stable(oldOperation.operationId) !== stable(newOperation.operationId)) {
    comparison.add('breaking', {
      kind: 'operation-id-changed',
      location,
      message: `operationId changed from ${oldOperation.operationId} to ${String(newOperation.operationId)}`,
    });
  }

  compareParameters(
    comparison,
    oldPath,
    oldOperation,
    newPath,
    newOperation,
    location
  );

  const oldBody =
    oldOperation.requestBody === undefined
      ? undefined
      : resolveReferencedObject(
          comparison,
          comparison.oldDocument,
          oldOperation.requestBody,
          `${location} request body`,
          'request-body'
        );
  const newBody =
    newOperation.requestBody === undefined
      ? undefined
      : resolveReferencedObject(
          comparison,
          comparison.newDocument,
          newOperation.requestBody,
          `${location} request body`,
          'request-body'
        );
  if (oldBody && !newBody) {
    comparison.add('breaking', {
      kind: 'request-body-removed',
      location,
      message: 'Request body support was removed',
    });
  } else if (!oldBody && newBody) {
    comparison.add(newBody.required === true ? 'breaking' : 'additive', {
      kind:
        newBody.required === true
          ? 'required-request-body-added'
          : 'request-body-added',
      location,
      message:
        newBody.required === true
          ? 'A required request body was added'
          : 'An optional request body was added',
    });
  } else if (oldBody && newBody) {
    compareUnsupportedFields(comparison, oldBody, newBody, {
      handled: ['required', 'content'],
      ignored: ['description'],
      location: `${location} request body`,
      scope: 'request-body',
    });
    if (oldBody.required !== true && newBody.required === true) {
      comparison.add('breaking', {
        kind: 'request-body-became-required',
        location,
        message: 'Request body became required',
      });
    }
    compareContent(
      comparison,
      oldBody.content,
      newBody.content,
      `${location} request`,
      'input'
    );
  }

  const oldResponses = asObject(oldOperation.responses) ?? {};
  const newResponses = asObject(newOperation.responses) ?? {};
  for (const [status, oldResponseValue] of Object.entries(oldResponses)) {
    const newResponseValue = newResponses[status];
    if (newResponseValue === undefined) {
      comparison.add('breaking', {
        kind: 'response-removed',
        location: `${location} response ${status}`,
        message: 'Documented response was removed',
      });
      continue;
    }
    const oldResponse = resolveReferencedObject(
      comparison,
      comparison.oldDocument,
      oldResponseValue,
      `${location} response ${status}`,
      'response'
    );
    const newResponse = resolveReferencedObject(
      comparison,
      comparison.newDocument,
      newResponseValue,
      `${location} response ${status}`,
      'response'
    );
    if (!oldResponse || !newResponse) continue;
    compareUnsupportedFields(comparison, oldResponse, newResponse, {
      handled: ['content'],
      ignored: ['description'],
      location: `${location} response ${status}`,
      scope: 'response',
    });
    compareContent(
      comparison,
      oldResponse.content,
      newResponse.content,
      `${location} response ${status}`,
      'output'
    );
  }
  for (const status of Object.keys(newResponses)) {
    if (!(status in oldResponses)) {
      resolveReferencedObject(
        comparison,
        comparison.newDocument,
        newResponses[status],
        `${location} response ${status}`,
        'response'
      );
      comparison.add('breaking', {
        kind: 'response-added',
        location: `${location} response ${status}`,
        message:
          'Documented response was added, widening the generated output union',
      });
    }
  }

  const oldSecurity = effectiveSecurity(comparison.oldDocument, oldOperation);
  const newSecurity = effectiveSecurity(comparison.newDocument, newOperation);
  if (stable(oldSecurity) !== stable(newSecurity)) {
    if (asArray(oldSecurity).length === 0 && asArray(newSecurity).length > 0) {
      comparison.add('breaking', {
        kind: 'security-required',
        location,
        message: 'Operation now requires authorization',
      });
    } else {
      comparison.add('ambiguous', {
        kind: 'security-changed',
        location,
        message: 'Operation security requirements changed',
      });
    }
  }
}

function comparePaths(comparison: Comparison): void {
  const oldPaths = asObject(comparison.oldDocument.paths) ?? {};
  const newPaths = asObject(comparison.newDocument.paths) ?? {};

  for (const [path, oldPathValue] of Object.entries(oldPaths)) {
    const oldPath = asObject(oldPathValue) ?? {};
    const newPath = asObject(newPaths[path]);
    if (newPath) {
      compareUnsupportedFields(comparison, oldPath, newPath, {
        handled: [...HTTP_METHODS, 'parameters'],
        ignored: ['summary', 'description'],
        location: `paths.${path}`,
        scope: 'path-item',
      });
    }
    for (const method of HTTP_METHODS) {
      const oldOperation = asObject(oldPath[method]);
      if (!oldOperation) continue;
      const location = `${method.toUpperCase()} ${path}`;
      const newOperation = newPath && asObject(newPath[method]);
      if (!newOperation || !newPath) {
        comparison.add('breaking', {
          kind: 'removed-operation',
          location,
          message: 'Operation was removed',
        });
        continue;
      }
      compareOperation(
        comparison,
        oldPath,
        oldOperation,
        newPath,
        newOperation,
        location
      );
    }
  }

  for (const [path, newPathValue] of Object.entries(newPaths)) {
    const oldPath = asObject(oldPaths[path]) ?? {};
    const newPath = asObject(newPathValue) ?? {};
    for (const method of HTTP_METHODS) {
      if (asObject(newPath[method]) && !asObject(oldPath[method])) {
        comparison.add('additive', {
          kind: 'added-operation',
          location: `${method.toUpperCase()} ${path}`,
          message: 'Operation was added',
        });
      }
    }
  }
}

function compareComponents(comparison: Comparison): void {
  const oldComponents = asObject(comparison.oldDocument.components) ?? {};
  const newComponents = asObject(comparison.newDocument.components) ?? {};
  compareUnsupportedFields(comparison, oldComponents, newComponents, {
    handled: ['schemas'],
    ignored: ['examples'],
    location: 'components',
    scope: 'components',
  });

  const oldSchemas = asObject(oldComponents.schemas) ?? {};
  const newSchemas = asObject(newComponents.schemas) ?? {};

  for (const [name, oldSchema] of Object.entries(oldSchemas)) {
    if (!(name in newSchemas)) {
      comparison.add('breaking', {
        kind: 'component-schema-removed',
        location: `components.schemas.${name}`,
        message: 'Exported component schema was removed',
      });
      continue;
    }
    const oldSchemaObject = asObject(oldSchema);
    const newSchemaObject = asObject(newSchemas[name]);
    if (
      oldSchemaObject &&
      newSchemaObject &&
      (comparison.hasSeen('input', oldSchemaObject, newSchemaObject) ||
        comparison.hasSeen('output', oldSchemaObject, newSchemaObject))
    ) {
      continue;
    }
    compareSchema(
      comparison,
      oldSchema,
      newSchemas[name],
      `components.schemas.${name}`,
      'output'
    );
  }
  for (const name of Object.keys(newSchemas)) {
    if (!(name in oldSchemas)) {
      comparison.add('additive', {
        kind: 'component-schema-added',
        location: `components.schemas.${name}`,
        message: 'Exported component schema was added',
      });
    }
  }
}

function validateDocument(value: unknown): JsonObject | undefined {
  const document = asObject(value);
  if (!document || typeof document.openapi !== 'string') return undefined;
  if (!asObject(document.paths)) return undefined;
  return document;
}

export function classifyOpenApiCompatibility(
  previousDocument: unknown,
  nextDocument: unknown
): CompatibilityResult {
  const next = validateDocument(nextDocument);
  if (!next) {
    return {
      classification: 'ambiguous',
      recommendedBump: null,
      changes: [
        {
          kind: 'invalid-next-schema',
          location: 'openapi',
          message: 'The fetched document is not a supported OpenAPI document',
        },
      ],
    };
  }

  const previous = validateDocument(previousDocument);
  if (!previous) {
    return {
      classification: 'ambiguous',
      recommendedBump: null,
      changes: [
        {
          kind: 'missing-baseline',
          location: 'openapi',
          message:
            'No trusted previous OpenAPI snapshot exists for compatibility comparison',
        },
      ],
    };
  }

  if (stable(previous) === stable(next)) {
    return {
      classification: 'unchanged',
      recommendedBump: null,
      changes: [],
    };
  }

  const comparison = new Comparison(previous, next);
  compareUnsupportedFields(comparison, previous, next, {
    handled: ['paths', 'components', 'security'],
    ignored: ['info', 'tags', 'externalDocs'],
    location: 'openapi',
    scope: 'openapi',
  });
  comparePaths(comparison);
  compareComponents(comparison);

  if (comparison.hasBreaking) {
    return {
      classification: 'breaking',
      recommendedBump: null,
      changes: comparison.changes,
    };
  }
  if (comparison.hasAmbiguous) {
    return {
      classification: 'ambiguous',
      recommendedBump: null,
      changes: comparison.changes,
    };
  }
  if (comparison.hasAdditive) {
    return {
      classification: 'additive',
      recommendedBump: 'minor',
      changes: comparison.changes,
    };
  }
  return {
    classification: 'compatible',
    recommendedBump: 'patch',
    changes: [],
  };
}
