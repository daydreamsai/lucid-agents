import { describe, expect, it } from 'bun:test';

import { createServicePayloadExample } from '../schema-example';

describe('createServicePayloadExample', () => {
  it('resolves references, JSON pointers, and composed object schemas', () => {
    const payload = createServicePayloadExample({
      allOf: [
        { $ref: '#/$defs/profile' },
        {
          type: 'object',
          required: ['count'],
          properties: { count: { oneOf: [{ const: 3 }, { const: 4 }] } },
        },
      ],
      $defs: {
        profile: {
          type: 'object',
          required: ['email', 'homepage'],
          properties: {
            email: { type: 'string', format: 'email' },
            homepage: { type: 'string', format: 'uri' },
          },
        },
      },
    });

    expect(JSON.parse(payload)).toEqual({
      input: {
        email: 'agent@example.com',
        homepage: 'https://example.com',
        count: 3,
      },
    });
  });

  it('handles arrays, additional properties, bounds, and recursive schemas', () => {
    const payload = createServicePayloadExample({
      type: 'object',
      required: ['items', 'metadata', 'next'],
      properties: {
        items: { type: 'array', items: { type: 'number', maximum: 9 } },
        metadata: { type: 'object', additionalProperties: { type: 'boolean' } },
        next: { $ref: '#' },
      },
    });

    expect(JSON.parse(payload)).toEqual({
      input: {
        items: [9],
        metadata: { example: false },
      },
    });
  });
});
