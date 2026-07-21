import { readFile } from 'node:fs/promises';

import { parse, type ParseError, printParseErrorCode } from 'jsonc-parser';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasConfiguredVariables(value: unknown): boolean {
  return (
    value !== undefined && (!isRecord(value) || Object.keys(value).length > 0)
  );
}

function assertNoUnsafeValueBindings(
  config: Record<string, unknown>,
  scope: string
): void {
  if (!isRecord(config.unsafe)) return;
  if (
    Object.hasOwn(config.unsafe, 'bindings') ||
    Object.hasOwn(config.unsafe, 'metadata')
  ) {
    throw new Error(
      `${scope} must not define unsafe.bindings or unsafe.metadata; use the lucid.deploy.json allowlist instead.`
    );
  }
}

export async function validateProviderConfig(path: string): Promise<void> {
  const errors: ParseError[] = [];
  const config = parse(await readFile(path, 'utf8'), errors, {
    allowTrailingComma: true,
    disallowComments: false,
  }) as unknown;
  if (errors.length > 0) {
    const first = errors[0];
    throw new Error(
      `Could not parse provider config: ${first ? printParseErrorCode(first.error) : 'unknown JSONC error'}.`
    );
  }
  if (!isRecord(config)) {
    throw new Error('Provider config must be a JSON object.');
  }
  if (hasConfiguredVariables(config.vars)) {
    throw new Error(
      'Provider config must not define vars; use the lucid.deploy.json allowlist instead.'
    );
  }
  assertNoUnsafeValueBindings(config, 'Provider config');

  if (!isRecord(config.env)) return;
  for (const environment of Object.values(config.env)) {
    if (!isRecord(environment)) continue;
    if (hasConfiguredVariables(environment.vars)) {
      throw new Error(
        'Provider config environments must not define vars; use the lucid.deploy.json allowlist instead.'
      );
    }
    assertNoUnsafeValueBindings(environment, 'Provider config environments');
  }
}
