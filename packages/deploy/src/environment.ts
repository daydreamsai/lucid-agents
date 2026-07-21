import { readFile } from 'node:fs/promises';

import type { ManifestEnvironment } from './manifest';
import { PREVIEW_SAFETY_VARIABLES } from './preview-policy';

export type UploadEnvironment = {
  plain: Map<string, string>;
  secrets: Map<string, string>;
};

export async function readEnvironmentFile(
  path: string,
  allowlist: ReadonlySet<string>
): Promise<Map<string, string>> {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
    throw error;
  }

  const values = new Map<string, string>();
  for (const [index, originalLine] of source.split(/\r?\n/u).entries()) {
    const line = originalLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const withoutExport = line.startsWith('export ') ? line.slice(7) : line;
    const separator = withoutExport.indexOf('=');
    if (separator <= 0) {
      if (allowlist.has(withoutExport.trim())) {
        throw new Error(
          `Invalid environment assignment at ${path}:${index + 1}.`
        );
      }
      continue;
    }
    const name = withoutExport.slice(0, separator).trim();
    if (!allowlist.has(name)) continue;
    const rawValue = withoutExport.slice(separator + 1).trim();
    values.set(name, parseEnvironmentValue(rawValue, path, index + 1));
  }
  return values;
}

function parseEnvironmentValue(
  rawValue: string,
  path: string,
  lineNumber: number
): string {
  if (rawValue.startsWith('"')) {
    if (!rawValue.endsWith('"')) {
      throw new Error(`Unclosed quoted value at ${path}:${lineNumber}.`);
    }
    try {
      return JSON.parse(rawValue) as string;
    } catch {
      throw new Error(`Invalid quoted value at ${path}:${lineNumber}.`);
    }
  }
  if (rawValue.startsWith("'")) {
    if (!rawValue.endsWith("'")) {
      throw new Error(`Unclosed quoted value at ${path}:${lineNumber}.`);
    }
    return rawValue.slice(1, -1);
  }
  const commentIndex = rawValue.search(/\s#/u);
  return (
    commentIndex === -1 ? rawValue : rawValue.slice(0, commentIndex)
  ).trim();
}

export function selectUploadEnvironment(
  manifest: ManifestEnvironment,
  fileEnvironment: Map<string, string>,
  processEnvironment: NodeJS.ProcessEnv
): UploadEnvironment {
  const secretNames = new Set([...manifest.secrets, ...manifest.signingKeys]);
  const plain = new Map<string, string>();
  const secrets = new Map<string, string>();

  for (const name of manifest.allowlist) {
    if (PREVIEW_SAFETY_VARIABLES.has(name)) continue;
    const processValue = processEnvironment[name];
    const value =
      typeof processValue === 'string'
        ? processValue
        : fileEnvironment.get(name);
    if (value === undefined || value.length === 0) continue;
    (secretNames.has(name) ? secrets : plain).set(name, value);
  }
  return { plain, secrets };
}
