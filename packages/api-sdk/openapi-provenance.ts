import { createHash } from 'node:crypto';

export function hashOpenApiSource(source: Uint8Array): string {
  return createHash('sha256').update(source).digest('hex');
}

export function redactOpenApiSource(source: string): string {
  const parsed = new URL(source);
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}
