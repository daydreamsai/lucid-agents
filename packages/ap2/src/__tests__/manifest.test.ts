import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import { describe, expect, it } from 'bun:test';

import { createAgentCardWithAP2 } from '../manifest';
import { AP2_EXTENSION_URI } from '../types';

describe('createAgentCardWithAP2', () => {
  const baseCard: AgentCardWithEntrypoints = {
    name: 'test-agent',
    version: '1.0.0',
    url: 'https://agent.example.com/',
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    skills: [],
    entrypoints: {},
  };

  it('creates new card with AP2 extension', () => {
    const enhanced = createAgentCardWithAP2(baseCard, {
      roles: ['merchant'],
      required: true,
    });

    expect(enhanced).not.toBe(baseCard);
    expect(enhanced.capabilities?.extensions).toBeDefined();
    expect(Array.isArray(enhanced.capabilities?.extensions)).toBe(true);
    expect(enhanced.capabilities?.extensions).toHaveLength(1);

    const ap2Extension = enhanced.capabilities?.extensions?.find(
      ext => 'uri' in ext && ext.uri === AP2_EXTENSION_URI
    );
    expect(ap2Extension).toBeDefined();
    expect(ap2Extension?.required).toBe(true);
  });

  it('is immutable - original card unchanged', () => {
    const original = { ...baseCard };
    createAgentCardWithAP2(baseCard, {
      roles: ['merchant'],
    });

    expect(baseCard.capabilities?.extensions).toBeUndefined();
    expect(baseCard).toEqual(original);
  });

  it('handles multiple roles', () => {
    const enhanced = createAgentCardWithAP2(baseCard, {
      roles: ['merchant', 'shopper'],
      required: false,
    });

    const ap2Extension = enhanced.capabilities?.extensions?.find(
      ext => 'uri' in ext && ext.uri === AP2_EXTENSION_URI
    ) as { params: { roles: string[] }; required?: boolean } | undefined;

    expect(ap2Extension?.params.roles).toEqual(['merchant', 'shopper']);
    expect(ap2Extension?.required).toBe(false);
  });

  it('defaults required to true when merchant role present', () => {
    const enhanced = createAgentCardWithAP2(baseCard, {
      roles: ['merchant'],
      // required not specified
    });

    const ap2Extension = enhanced.capabilities?.extensions?.find(
      ext => 'uri' in ext && ext.uri === AP2_EXTENSION_URI
    ) as { required?: boolean } | undefined;

    expect(ap2Extension?.required).toBe(true);
  });

  it('defaults required to false when merchant role not present', () => {
    const enhanced = createAgentCardWithAP2(baseCard, {
      roles: ['shopper'],
      // required not specified
    });

    const ap2Extension = enhanced.capabilities?.extensions?.find(
      ext => 'uri' in ext && ext.uri === AP2_EXTENSION_URI
    ) as { required?: boolean } | undefined;

    expect(ap2Extension?.required).toBe(false);
  });

  it('replaces existing AP2 extension', () => {
    const cardWithExisting: AgentCardWithEntrypoints = {
      ...baseCard,
      capabilities: {
        ...baseCard.capabilities!,
        extensions: [
          {
            uri: AP2_EXTENSION_URI,
            params: { roles: ['merchant'] },
            required: true,
          },
        ],
      },
    };

    const enhanced = createAgentCardWithAP2(cardWithExisting, {
      roles: ['shopper'],
      required: false,
    });

    expect(enhanced.capabilities?.extensions).toHaveLength(1);
    const ap2Extension = enhanced.capabilities?.extensions?.find(
      ext => 'uri' in ext && ext.uri === AP2_EXTENSION_URI
    ) as { params: { roles: string[] } } | undefined;

    expect(ap2Extension?.params.roles).toEqual(['shopper']);
  });

  it('preserves other extensions', () => {
    const cardWithOther: AgentCardWithEntrypoints = {
      ...baseCard,
      capabilities: {
        ...baseCard.capabilities!,
        extensions: [
          {
            uri: 'https://other-extension.example',
            params: {},
          },
        ],
      },
    };

    const enhanced = createAgentCardWithAP2(cardWithOther, {
      roles: ['merchant'],
    });

    expect(enhanced.capabilities?.extensions).toHaveLength(2);
    const otherExtension = enhanced.capabilities?.extensions?.find(
      ext => 'uri' in ext && ext.uri === 'https://other-extension.example'
    );
    expect(otherExtension).toBeDefined();
  });
});
