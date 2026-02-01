import { describe, expect, it } from 'bun:test';

import type { AgentIdentity } from '../init';
import { generateAgentRegistration } from '../init';

describe('generateAgentRegistration', () => {
  it('builds registration file with agent image and trust info', () => {
    const identity: AgentIdentity = {
      status: 'ok',
      domain: 'agent.example.com',
      trust: {
        registrations: [
          {
            agentId: '1',
            agentRegistry: 'eip155:84532:0x000000000000000000000000000000000000dead',
          },
        ],
        trustModels: ['feedback'],
      },
      record: {
        agentId: 1n,
        owner: '0x0000000000000000000000000000000000000001',
        agentURI: 'https://agent.example.com/.well-known/agent-registration.json',
      },
    };

    const registration = generateAgentRegistration(identity, {
      name: 'My Agent',
      description: 'An intelligent assistant',
      image: 'https://agent.example.com/og.png',
      services: [
        {
          id: 'a2a',
          type: 'a2a',
          serviceEndpoint: 'https://agent.example.com/.well-known/agent-card.json',
        },
      ],
      x402Support: true,
      active: true,
    });

    expect(registration.type).toBe('agent');
    expect(registration.name).toBe('My Agent');
    expect(registration.description).toBe('An intelligent assistant');
    expect(registration.image).toBe('https://agent.example.com/og.png');
    expect(registration.registrations).toEqual(identity.trust?.registrations);
    expect(registration.supportedTrust).toEqual(['feedback']);
    expect(registration.services?.[0].serviceEndpoint).toBe(
      'https://agent.example.com/.well-known/agent-card.json'
    );
    expect(registration.active).toBe(true);
  });

  it('uses defaults when options are missing', () => {
    const identity: AgentIdentity = {
      status: 'ok',
      domain: 'agent.example.com',
    };

    const registration = generateAgentRegistration(identity);

    expect(registration.type).toBe('agent');
    expect(registration.name).toBe('Agent');
    expect(registration.description).toBe('An AI agent');
    expect(registration.domain).toBe('agent.example.com');
  });
});
