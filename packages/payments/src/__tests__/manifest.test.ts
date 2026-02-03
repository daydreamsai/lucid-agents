import { describe, expect, it } from 'bun:test';
import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import type { EntrypointDef } from '@lucid-agents/types/core';
import { z } from 'zod';

import { createAgentCardWithPayments } from '../manifest';
import type { PaymentsConfig } from '@lucid-agents/types/payments';

describe('createAgentCardWithPayments', () => {
  const baseCard: AgentCardWithEntrypoints = {
    name: 'test-agent',
    version: '1.0.0',
    url: 'https://agent.example.com/',
    entrypoints: {
      echo: {
        description: 'Echo endpoint',
        streaming: false,
        input_schema: {
          type: 'object',
          properties: { text: { type: 'string' } },
        },
        output_schema: {
          type: 'object',
          properties: { text: { type: 'string' } },
        },
      },
      stream: {
        description: 'Stream endpoint',
        streaming: true,
        input_schema: {
          type: 'object',
          properties: { text: { type: 'string' } },
        },
      },
    },
    skills: [],
  };

  const paymentsConfig: PaymentsConfig = {
    payTo: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
    facilitatorUrl: 'https://facilitator.daydreams.systems',
    network: 'eip155:84532',
  };

  const entrypoints: EntrypointDef[] = [
    {
      key: 'echo',
      description: 'Echo endpoint',
      input: z.object({ text: z.string() }),
      output: z.object({ text: z.string() }),
      price: '1000',
      handler: async () => ({ output: { text: 'echo' } }),
    },
    {
      key: 'stream',
      description: 'Stream endpoint',
      input: z.object({ text: z.string() }),
      stream: async () => ({ output: { text: 'stream' } }),
      price: { invoke: '2000', stream: '1500' },
      handler: async () => ({ output: { text: 'stream' } }),
    },
    {
      key: 'free',
      description: 'Free endpoint',
      input: z.object({ text: z.string() }),
      output: z.object({ text: z.string() }),
      handler: async () => ({ output: { text: 'free' } }),
    },
  ];

  it('creates new card with pricing and payments array', () => {
    const enhanced = createAgentCardWithPayments(baseCard, paymentsConfig, entrypoints);

    expect(enhanced).not.toBe(baseCard);
    expect(enhanced.payments).toBeDefined();
    expect(Array.isArray(enhanced.payments)).toBe(true);
    expect(enhanced.payments).toHaveLength(1);
  });

  it('is immutable - original card unchanged', () => {
    const original = { ...baseCard };
    createAgentCardWithPayments(baseCard, paymentsConfig, entrypoints);

    expect(baseCard.payments).toBeUndefined();
    expect(baseCard.entrypoints.echo.pricing).toBeUndefined();
  });

  it('adds pricing to entrypoints with prices', () => {
    const enhanced = createAgentCardWithPayments(baseCard, paymentsConfig, entrypoints);

    expect(enhanced.entrypoints.echo.pricing).toBeDefined();
    expect(enhanced.entrypoints.echo.pricing?.invoke).toBe('1000');

    expect(enhanced.entrypoints.stream.pricing).toBeDefined();
    expect(enhanced.entrypoints.stream.pricing?.invoke).toBe('2000');
    expect(enhanced.entrypoints.stream.pricing?.stream).toBe('1500');
  });

  it('does not add pricing to entrypoints without prices', () => {
    const enhanced = createAgentCardWithPayments(baseCard, paymentsConfig, entrypoints);

    expect(enhanced.entrypoints.free?.pricing).toBeUndefined();
  });

  it('adds x402 payment method to payments array', () => {
    const enhanced = createAgentCardWithPayments(baseCard, paymentsConfig, entrypoints);

    expect(enhanced.payments).toBeDefined();
    const payment = enhanced.payments?.[0];
    expect(payment?.method).toBe('x402');
    expect(payment?.payee).toBe(paymentsConfig.payTo);
    expect(payment?.network).toBe(paymentsConfig.network);
    expect((payment as { endpoint?: string }).endpoint).toBe(paymentsConfig.facilitatorUrl);
    expect((payment?.extensions as { x402?: { facilitatorUrl?: string } })?.x402?.facilitatorUrl).toBe(paymentsConfig.facilitatorUrl);
  });

  it('handles entrypoints with only invoke price', () => {
    const entrypointsInvokeOnly: EntrypointDef[] = [
      {
        key: 'invoke-only',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        price: '500',
        handler: async () => ({ output: { text: 'ok' } }),
      },
    ];

    const cardWithInvokeOnly: AgentCardWithEntrypoints = {
      ...baseCard,
      entrypoints: {
        'invoke-only': {
          description: 'Invoke only',
          streaming: false,
          input_schema: {},
          output_schema: {},
        },
      },
    };

    const enhanced = createAgentCardWithPayments(cardWithInvokeOnly, paymentsConfig, entrypointsInvokeOnly);

    expect(enhanced.entrypoints['invoke-only'].pricing?.invoke).toBe('500');
    expect(enhanced.entrypoints['invoke-only'].pricing?.stream).toBeUndefined();
  });
});

