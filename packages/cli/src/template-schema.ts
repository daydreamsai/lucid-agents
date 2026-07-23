import fs from 'node:fs/promises';
import { join } from 'node:path';

type JsonObject = Record<string, unknown>;

type ValidationIssue = {
  path: string;
  message: string;
};

const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  '$schema',
  '$id',
  'title',
  'description',
  'default',
  'examples',
  'notes',
  'type',
  'enum',
  'const',
  'pattern',
  'format',
  'minLength',
  'allOf',
  'anyOf',
  'if',
  'then',
  'else',
  'properties',
  'required',
]);

const SUPPORTED_TYPES = new Set([
  'array',
  'boolean',
  'integer',
  'null',
  'number',
  'object',
  'string',
]);

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function schemaObject(value: unknown, location: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new Error(`Template schema is invalid at ${location}.`);
  }
  return value;
}

function schemaArray(
  value: unknown,
  keyword: string,
  location: string
): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Template schema keyword "${keyword}" must be an array at ${location}.`
    );
  }
  return value;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (
    (Array.isArray(left) && Array.isArray(right)) ||
    (isJsonObject(left) && isJsonObject(right))
  ) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return false;
}

function assertSupportedSchema(
  rawSchema: unknown,
  schemaLocation: string
): void {
  if (typeof rawSchema === 'boolean') {
    return;
  }
  const schema = schemaObject(rawSchema, schemaLocation);
  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED_SCHEMA_KEYWORDS.has(keyword)) {
      throw new Error(
        `Template schema declares unsupported keyword "${keyword}" at ${schemaLocation}.`
      );
    }
  }

  if (schema.type !== undefined) {
    if (typeof schema.type !== 'string' || !SUPPORTED_TYPES.has(schema.type)) {
      throw new Error(
        `Template schema declares unsupported type "${String(
          schema.type
        )}" at ${schemaLocation}.`
      );
    }
  }
  if (schema.format !== undefined && schema.format !== 'uri') {
    throw new Error(
      `Template schema declares unsupported format "${String(
        schema.format
      )}" at ${schemaLocation}.`
    );
  }
  if (schema.pattern !== undefined) {
    if (typeof schema.pattern !== 'string') {
      throw new Error(
        `Template schema keyword "pattern" must be a string at ${schemaLocation}.`
      );
    }
    try {
      new RegExp(schema.pattern, 'u');
    } catch {
      throw new Error(
        `Template schema contains an invalid pattern at ${schemaLocation}.`
      );
    }
  }
  if (
    schema.minLength !== undefined &&
    (typeof schema.minLength !== 'number' ||
      !Number.isInteger(schema.minLength) ||
      schema.minLength < 0)
  ) {
    throw new Error(
      `Template schema keyword "minLength" must be a non-negative integer at ${schemaLocation}.`
    );
  }
  if (schema.enum !== undefined) {
    const values = schemaArray(schema.enum, 'enum', schemaLocation);
    if (values.length === 0) {
      throw new Error(
        `Template schema keyword "enum" must not be empty at ${schemaLocation}.`
      );
    }
  }
  if (schema.required !== undefined) {
    const required = schemaArray(schema.required, 'required', schemaLocation);
    if (required.some(value => typeof value !== 'string')) {
      throw new Error(
        `Template schema keyword "required" must contain only strings at ${schemaLocation}.`
      );
    }
  }
  if (schema.properties !== undefined) {
    const properties = schemaObject(
      schema.properties,
      `${schemaLocation}.properties`
    );
    for (const [property, propertySchema] of Object.entries(properties)) {
      assertSupportedSchema(
        propertySchema,
        `${schemaLocation}.properties.${property}`
      );
    }
  }
  for (const keyword of ['allOf', 'anyOf'] as const) {
    if (schema[keyword] === undefined) continue;
    const branches = schemaArray(schema[keyword], keyword, schemaLocation);
    if (branches.length === 0) {
      throw new Error(
        `Template schema keyword "${keyword}" must not be empty at ${schemaLocation}.`
      );
    }
    branches.forEach((branch, index) => {
      assertSupportedSchema(branch, `${schemaLocation}.${keyword}[${index}]`);
    });
  }
  for (const keyword of ['if', 'then', 'else'] as const) {
    if (schema[keyword] !== undefined) {
      assertSupportedSchema(schema[keyword], `${schemaLocation}.${keyword}`);
    }
  }
}

function matchesType(value: unknown, expected: string): boolean {
  switch (expected) {
    case 'array':
      return Array.isArray(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'null':
      return value === null;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'object':
      return isJsonObject(value);
    case 'string':
      return typeof value === 'string';
    default:
      throw new Error(
        `Template schema declares unsupported type "${expected}".`
      );
  }
}

function isValidUri(value: string): boolean {
  if (!/^[a-z][a-z0-9+.-]*:/iu.test(value)) {
    return false;
  }
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function validateNode(
  rawSchema: unknown,
  value: unknown,
  path: string,
  schemaLocation: string
): ValidationIssue[] {
  if (rawSchema === true) {
    return [];
  }
  if (rawSchema === false) {
    return [{ path, message: 'is not allowed' }];
  }

  const schema = schemaObject(rawSchema, schemaLocation);
  const issues: ValidationIssue[] = [];

  if (schema.allOf !== undefined) {
    const branches = schemaArray(schema.allOf, 'allOf', schemaLocation);
    branches.forEach((branch, index) => {
      issues.push(
        ...validateNode(
          branch,
          value,
          path,
          `${schemaLocation}.allOf[${index}]`
        )
      );
    });
  }

  if (schema.anyOf !== undefined) {
    const branches = schemaArray(schema.anyOf, 'anyOf', schemaLocation);
    const branchIssues = branches.map((branch, index) =>
      validateNode(branch, value, path, `${schemaLocation}.anyOf[${index}]`)
    );
    if (!branchIssues.some(result => result.length === 0)) {
      const reasons = branchIssues
        .map(result => result[0])
        .filter((issue): issue is ValidationIssue => issue !== undefined)
        .map(issue => `${issue.path} ${issue.message}`);
      issues.push({
        path,
        message:
          reasons.length > 0
            ? `must match at least one allowed configuration: ${reasons.join(
                ' or '
              )}`
            : 'must match at least one allowed configuration',
      });
    }
  }

  if (schema.if !== undefined) {
    const conditionMatches =
      validateNode(schema.if, value, path, `${schemaLocation}.if`).length === 0;
    if (conditionMatches && schema.then !== undefined) {
      issues.push(
        ...validateNode(schema.then, value, path, `${schemaLocation}.then`)
      );
    } else if (!conditionMatches && schema.else !== undefined) {
      issues.push(
        ...validateNode(schema.else, value, path, `${schemaLocation}.else`)
      );
    }
  }

  if (schema.type !== undefined) {
    if (typeof schema.type !== 'string') {
      throw new Error(
        `Template schema keyword "type" must be a string at ${schemaLocation}.`
      );
    }
    if (!matchesType(value, schema.type)) {
      issues.push({ path, message: `must be of type ${schema.type}` });
      return issues;
    }
  }

  if (schema.enum !== undefined) {
    const allowed = schemaArray(schema.enum, 'enum', schemaLocation);
    if (!allowed.some(candidate => valuesEqual(candidate, value))) {
      issues.push({ path, message: 'must be one of its declared values' });
    }
  }

  if (schema.const !== undefined && !valuesEqual(schema.const, value)) {
    issues.push({ path, message: 'must equal its required value' });
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined) {
      if (
        typeof schema.minLength !== 'number' ||
        !Number.isInteger(schema.minLength) ||
        schema.minLength < 0
      ) {
        throw new Error(
          `Template schema keyword "minLength" must be a non-negative integer at ${schemaLocation}.`
        );
      }
      if ([...value].length < schema.minLength) {
        issues.push({
          path,
          message: `must contain at least ${schema.minLength} characters`,
        });
      }
    }

    if (schema.pattern !== undefined) {
      if (typeof schema.pattern !== 'string') {
        throw new Error(
          `Template schema keyword "pattern" must be a string at ${schemaLocation}.`
        );
      }
      let pattern: RegExp;
      try {
        pattern = new RegExp(schema.pattern, 'u');
      } catch {
        throw new Error(
          `Template schema contains an invalid pattern at ${schemaLocation}.`
        );
      }
      if (!pattern.test(value)) {
        issues.push({
          path,
          message: `must match pattern ${JSON.stringify(schema.pattern)}`,
        });
      }
    }

    if (schema.format !== undefined) {
      if (schema.format !== 'uri') {
        throw new Error(
          `Template schema declares unsupported format "${String(
            schema.format
          )}" at ${schemaLocation}.`
        );
      }
      if (!isValidUri(value)) {
        issues.push({ path, message: 'must be a valid URI' });
      }
    }
  }

  if (isJsonObject(value)) {
    if (schema.required !== undefined) {
      const required = schemaArray(schema.required, 'required', schemaLocation);
      for (const property of required) {
        if (typeof property !== 'string') {
          throw new Error(
            `Template schema keyword "required" must contain only strings at ${schemaLocation}.`
          );
        }
        if (!Object.prototype.hasOwnProperty.call(value, property)) {
          issues.push({
            path: path === '$' ? property : `${path}.${property}`,
            message: 'is required',
          });
        }
      }
    }

    if (schema.properties !== undefined) {
      const properties = schemaObject(
        schema.properties,
        `${schemaLocation}.properties`
      );
      for (const [property, propertySchema] of Object.entries(properties)) {
        if (!Object.prototype.hasOwnProperty.call(value, property)) {
          continue;
        }
        const propertyPath = path === '$' ? property : `${path}.${property}`;
        issues.push(
          ...validateNode(
            propertySchema,
            value[property],
            propertyPath,
            `${schemaLocation}.properties.${property}`
          )
        );
      }
    }
  }

  return issues;
}

export async function validateTemplateConfiguration(
  templatePath: string,
  configuration: Record<string, unknown>
): Promise<void> {
  const schemaPath = join(templatePath, 'template.schema.json');
  let rawSchema: string;
  try {
    rawSchema = await fs.readFile(schemaPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Template schema not found at ${schemaPath}.`);
    }
    throw error;
  }

  let schema: unknown;
  try {
    schema = JSON.parse(rawSchema) as unknown;
  } catch {
    throw new Error(`Template schema at ${schemaPath} is not valid JSON.`);
  }

  assertSupportedSchema(schema, '$');
  const issues = validateNode(schema, configuration, '$', '$');
  if (issues.length === 0) {
    return;
  }

  const details = issues
    .map(issue => `- ${issue.path} ${issue.message}`)
    .join('\n');
  throw new Error(`Template configuration is invalid:\n${details}`);
}
