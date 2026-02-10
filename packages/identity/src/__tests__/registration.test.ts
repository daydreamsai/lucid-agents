import { describe, expect, it } from 'bun:test';

import type { AgentIdentity } from '../init';
import { generateAgentRegistration } from '../init';

describe('generateAgentRegistration', () => {
  it('builds registration file with canonical services and trust info', () => {
    const identity: AgentIdentity = {
      status: 'ok',
      domain: 'agent.example.com',
      trust: {
        registrations: [
          {
            agentId: '1',
            agentRegistry:
              'eip155:84532:0x000000000000000000000000000000000000dead',
          },
        ],
        trustModels: ['feedback'],
      },
      record: {
        agentId: 1n,
        owner: '0x0000000000000000000000000000000000000001',
        agentURI:
          'https://agent.example.com/.well-known/agent-registration.json',
      },
    };

    const registration = generateAgentRegistration(identity, {
      name: 'My Agent',
      description: 'An intelligent assistant',
      image: 'https://agent.example.com/og.png',
      services: [
        {
          id: 'A2A',
          serviceEndpoint:
            'https://agent.example.com/.well-known/agent-card.json',
        },
      ],
      x402Support: true,
      active: true,
    });

    expect(registration.type).toBe(
      'https://eips.ethereum.org/EIPS/eip-8004#registration-v1'
    );
    expect(registration.name).toBe('My Agent');
    expect(registration.description).toBe('An intelligent assistant');
    expect(registration.image).toBe('https://agent.example.com/og.png');
    expect(registration.registrations).toEqual(identity.trust?.registrations);
    expect(registration.supportedTrust).toEqual(['feedback']);
    expect(registration.services?.some(s => s.name === 'A2A')).toBe(true);
    expect(registration.services?.some(s => s.name === 'web')).toBe(true);
    expect(registration.services?.find(s => s.name === 'A2A')?.endpoint).toBe(
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

    expect(registration.type).toBe(
      'https://eips.ethereum.org/EIPS/eip-8004#registration-v1'
    );
    expect(registration.name).toBe('Agent');
    expect(registration.description).toBe('An AI agent');
    expect(registration.domain).toBe('agent.example.com');
    expect(registration.services?.find(s => s.name === 'A2A')?.endpoint).toBe(
      'https://agent.example.com/.well-known/agent-card.json'
    );
    expect(registration.services?.find(s => s.name === 'web')?.endpoint).toBe(
      'https://agent.example.com/'
    );
  });

  it('supports explicit service selections for OASF, twitter, website, and email', () => {
    const identity: AgentIdentity = {
      status: 'ok',
      domain: 'agent.example.com',
    };

    const registration = generateAgentRegistration(identity, {
      selectedServices: ['OASF', 'twitter', 'email', 'web'],
      website: 'https://custom.example.com',
      twitter: '@lucidagents',
      email: 'contact@agent.example.com',
      oasf: {
        endpoint: 'ipfs://bafy-example',
        version: '0.8.0',
        skills: ['reasoning'],
        domains: ['finance'],
      },
    });

    expect(registration.services?.find(s => s.name === 'web')?.endpoint).toBe(
      'https://custom.example.com'
    );
    expect(
      registration.services?.find(s => s.name === 'twitter')?.endpoint
    ).toBe('https://x.com/lucidagents');
    expect(registration.services?.find(s => s.name === 'email')?.endpoint).toBe(
      'contact@agent.example.com'
    );
    expect(registration.services?.find(s => s.name === 'OASF')?.endpoint).toBe(
      'ipfs://bafy-example'
    );
    expect(registration.services?.find(s => s.name === 'OASF')?.version).toBe(
      '0.8.0'
    );
    expect(registration.services?.some(s => s.name === 'A2A')).toBe(false);
  });

  it('defaults OASF endpoint to /.well-known/oasf-record.json', () => {
    const identity: AgentIdentity = {
      status: 'ok',
      domain: 'agent.example.com',
    };

    const registration = generateAgentRegistration(identity, {
      selectedServices: ['OASF'],
      oasf: {
        authors: ['ops@agent.example.com'],
        skills: ['reasoning'],
        domains: ['finance'],
        modules: ['https://agent.example.com/modules/core'],
        locators: ['https://agent.example.com/.well-known/oasf-record.json'],
      },
    });

    expect(registration.services?.find(s => s.name === 'OASF')?.endpoint).toBe(
      'https://agent.example.com/.well-known/oasf-record.json'
    );
  });
});
