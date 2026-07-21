import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import { describe, expect, it } from 'bun:test';

import { buildServicePageModel } from '../service-page-model';

describe('buildServicePageModel', () => {
  it('turns the public agent card into a complete service storefront model', () => {
    const card: AgentCardWithEntrypoints = {
      name: 'Research Agent',
      version: '2.4.0',
      description: 'Answers research questions with cited evidence.',
      iconUrl: 'https://agent.example/icon.svg',
      supportedInterfaces: [
        {
          url: 'https://agent.example/api/agent/',
          protocolBinding: 'HTTP+JSON',
        },
      ],
      capabilities: {
        streaming: true,
        stateTransitionHistory: true,
        extensions: [
          {
            uri: 'https://github.com/google-agentic-commerce/ap2/tree/v0.1',
            description: 'Agent Payments Protocol',
            params: { roles: ['merchant'] },
          },
        ],
      },
      payments: [
        {
          method: 'x402',
          network: 'eip155:8453',
          payee: '0x0000000000000000000000000000000000000001',
        },
        {
          method: 'mpp',
          network: 'mpp',
          extensions: { mpp: { method: 'stripe', currency: 'usd' } },
        },
      ],
      registrations: [
        {
          agentId: 42,
          agentRegistry: 'eip155:8453:0xregistry',
        },
      ],
      trustModels: ['feedback'],
      signatures: [{ protected: 'header', signature: 'signature' }],
      entrypoints: {
        research: {
          description: 'Research a topic and return cited findings.',
          streaming: true,
          input_schema: {
            type: 'object',
            required: ['topic'],
            properties: { topic: { type: 'string' } },
          },
          output_schema: { type: 'object' },
          pricing: { invoke: '$0.10', stream: '$0.20' },
          payment_protocol: 'x402',
          network: 'eip155:8453',
          authorization: {
            siwx: {
              enabled: true,
              auth_only: false,
              statement: 'Sign in before researching',
            },
          },
        },
        profile: {
          description: 'Return the authenticated user profile.',
          streaming: false,
          authorization: {
            siwx: { enabled: true, auth_only: true },
          },
        },
      },
    };

    expect(
      buildServicePageModel(card, {
        health: { ok: true, version: '2.4.0' },
      })
    ).toEqual({
      agent: {
        name: 'Research Agent',
        version: '2.4.0',
        description: 'Answers research questions with cited evidence.',
        iconUrl: 'https://agent.example/icon.svg',
      },
      protocol: {
        interfaces: [
          {
            url: 'https://agent.example/api/agent/',
            protocolBinding: 'HTTP+JSON',
            preferred: true,
          },
        ],
        defaultInputModes: [],
        defaultOutputModes: [],
      },
      security: { schemes: [], requirements: [] },
      status: { state: 'online', label: 'Online' },
      trust: {
        registered: true,
        signed: true,
        registrations: [
          { agentId: 42, agentRegistry: 'eip155:8453:0xregistry' },
        ],
        models: ['feedback'],
      },
      capabilities: {
        streaming: true,
        tasks: true,
        pushNotifications: false,
        authenticatedExtendedCard: false,
        extensions: [
          {
            name: 'Agent Payments Protocol',
            uri: 'https://github.com/google-agentic-commerce/ap2/tree/v0.1',
            required: false,
          },
        ],
      },
      endpoints: {
        agentCard:
          'https://agent.example/api/agent/.well-known/agent-card.json',
        health: 'https://agent.example/api/agent/health',
        entrypoints: 'https://agent.example/api/agent/entrypoints',
        tasks: 'https://agent.example/api/agent/tasks',
      },
      payments: [
        {
          method: 'x402',
          network: 'eip155:8453',
          payee: '0x0000000000000000000000000000000000000001',
        },
        {
          method: 'mpp',
          network: 'mpp',
          detail: 'stripe · usd',
          extensions: { mpp: { method: 'stripe', currency: 'usd' } },
        },
      ],
      skills: [],
      offerings: [
        {
          key: 'research',
          title: 'Research',
          description: 'Research a topic and return cited findings.',
          streaming: true,
          inputSchema: {
            type: 'object',
            required: ['topic'],
            properties: { topic: { type: 'string' } },
          },
          outputSchema: { type: 'object' },
          authorization: {
            siwx: {
              enabled: true,
              authOnly: false,
              statement: 'Sign in before researching',
            },
          },
          payment: {
            required: true,
            protocol: 'x402',
            network: 'eip155:8453',
          },
          operations: {
            invoke: {
              method: 'POST',
              path: '/api/agent/entrypoints/research/invoke',
              url: 'https://agent.example/api/agent/entrypoints/research/invoke',
              price: '$0.10',
            },
            stream: {
              method: 'POST',
              path: '/api/agent/entrypoints/research/stream',
              url: 'https://agent.example/api/agent/entrypoints/research/stream',
              price: '$0.20',
            },
          },
        },
        {
          key: 'profile',
          title: 'Profile',
          description: 'Return the authenticated user profile.',
          streaming: false,
          authorization: {
            siwx: { enabled: true, authOnly: true },
          },
          payment: { required: false },
          operations: {
            invoke: {
              method: 'POST',
              path: '/api/agent/entrypoints/profile/invoke',
              url: 'https://agent.example/api/agent/entrypoints/profile/invoke',
            },
          },
        },
      ],
    });
  });

  it('represents unavailable and empty services without inventing capabilities', () => {
    const model = buildServicePageModel(
      { name: 'Bare Agent', entrypoints: {} },
      { health: null, baseUrl: 'https://bare.example/service' }
    );

    expect(model.status).toEqual({ state: 'unknown', label: 'Status unknown' });
    expect(model.offerings).toEqual([]);
    expect(model.payments).toEqual([]);
    expect(model.capabilities).toEqual({
      streaming: false,
      tasks: false,
      pushNotifications: false,
      authenticatedExtendedCard: false,
      extensions: [],
    });
    expect(model.endpoints.agentCard).toBe(
      'https://bare.example/service/.well-known/agent-card.json'
    );
  });

  it('preserves the complete public Agent Card contract for every renderer', () => {
    const model = buildServicePageModel(
      {
        protocolVersion: '1.0',
        name: 'Kitchen Sink Agent',
        version: '3.0.0',
        description: 'Publishes every supported service-page field.',
        provider: {
          organization: 'Lucid Research',
          url: 'https://lucid.example/about',
        },
        documentationUrl: 'https://lucid.example/docs',
        supportedInterfaces: [
          {
            url: 'https://agent.example/api/agent',
            protocolBinding: 'HTTP+JSON',
          },
          {
            url: 'https://agent.example/a2a',
            protocolBinding: 'JSONRPC',
          },
        ],
        defaultInputModes: ['application/json'],
        defaultOutputModes: ['application/json', 'text/event-stream'],
        securitySchemes: {
          bearer: { type: 'http', scheme: 'bearer' },
        },
        security: [{ bearer: [] }],
        capabilities: {
          streaming: true,
          pushNotifications: true,
          stateTransitionHistory: true,
        },
        supportsAuthenticatedExtendedCard: true,
        skills: [
          {
            id: 'research',
            name: 'Evidence research',
            description: 'Research with cited evidence.',
            tags: ['research', 'citations'],
            examples: ['Compare two primary sources'],
            inputModes: ['application/json'],
            outputModes: ['application/json', 'text/event-stream'],
            security: [{ bearer: [] }],
          },
          {
            id: 'discovery-only',
            name: 'Discovery-only skill',
            tags: ['catalog'],
          },
        ],
        payments: [
          {
            method: 'x402',
            network: 'eip155:8453',
            payee: '0x0000000000000000000000000000000000000001',
            endpoint: 'https://facilitator.example/settle',
            priceModel: { default: '$0.05' },
          },
        ],
        ValidationRequestsURI: 'https://agent.example/validation/requests',
        ValidationResponsesURI: 'https://agent.example/validation/responses',
        FeedbackDataURI: 'https://agent.example/feedback',
        entrypoints: {
          research: {
            description: 'Research an exact question.',
            streaming: true,
            pricing: { invoke: '$0.10' },
            payment_protocol: 'x402',
          },
        },
      },
      { health: { status: 'healthy' } }
    );

    expect(model).toMatchObject({
      agent: {
        provider: {
          organization: 'Lucid Research',
          url: 'https://lucid.example/about',
        },
        documentationUrl: 'https://lucid.example/docs',
      },
      protocol: {
        version: '1.0',
        interfaces: [
          {
            url: 'https://agent.example/api/agent',
            protocolBinding: 'HTTP+JSON',
            preferred: true,
          },
          {
            url: 'https://agent.example/a2a',
            protocolBinding: 'JSONRPC',
            preferred: false,
          },
        ],
        defaultInputModes: ['application/json'],
        defaultOutputModes: ['application/json', 'text/event-stream'],
      },
      security: {
        schemes: [
          {
            name: 'bearer',
            definition: { type: 'http', scheme: 'bearer' },
          },
        ],
        requirements: [{ bearer: [] }],
      },
      capabilities: {
        streaming: true,
        tasks: true,
        pushNotifications: true,
        authenticatedExtendedCard: true,
      },
      endpoints: {
        validationRequests: 'https://agent.example/validation/requests',
        validationResponses: 'https://agent.example/validation/responses',
        feedback: 'https://agent.example/feedback',
      },
      payments: [
        {
          method: 'x402',
          network: 'eip155:8453',
          payee: '0x0000000000000000000000000000000000000001',
          endpoint: 'https://facilitator.example/settle',
          defaultPrice: '$0.05',
        },
      ],
      skills: [
        {
          id: 'research',
          name: 'Evidence research',
          description: 'Research with cited evidence.',
          tags: ['research', 'citations'],
          examples: ['Compare two primary sources'],
          inputModes: ['application/json'],
          outputModes: ['application/json', 'text/event-stream'],
          security: [{ bearer: [] }],
        },
        {
          id: 'discovery-only',
          name: 'Discovery-only skill',
          tags: ['catalog'],
        },
      ],
      offerings: [
        {
          key: 'research',
          title: 'Evidence research',
          tags: ['research', 'citations'],
          examples: ['Compare two primary sources'],
          inputModes: ['application/json'],
          outputModes: ['application/json', 'text/event-stream'],
          security: [{ bearer: [] }],
          operations: {
            invoke: { method: 'POST' },
            stream: { method: 'POST' },
          },
        },
      ],
    });
  });
});
