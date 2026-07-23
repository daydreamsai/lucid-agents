import { describe, expect, test } from 'bun:test';

import { hashOpenApiSource, redactOpenApiSource } from '../openapi-provenance';

describe('OpenAPI provenance', () => {
  test('records a stable SHA-256 hash of the fetched bytes', () => {
    expect(
      hashOpenApiSource(new TextEncoder().encode('{"openapi":"3.1.0"}'))
    ).toBe('1f7b61c52c664d551376cf25d7c387f8c0832ba9fe00995f7d12dd1909ea0de5');
  });

  test('never records credentials, query tokens, or fragments from the source URL', () => {
    expect(
      redactOpenApiSource(
        'https://user:password@schemas.example.com/openapi.json?token=secret#fragment'
      )
    ).toBe('https://schemas.example.com/openapi.json');
  });
});
