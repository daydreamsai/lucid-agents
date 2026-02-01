import type { AgentChallengeResponse } from '@lucid-agents/types/wallets';
import { afterEach, describe, expect, it, mock } from 'bun:test';

import { ServerOrchestratorWalletConnector } from '../../connectors/server-orchestrator-connector';

const baseChallenge: AgentChallengeResponse['challenge'] = {
  id: 'challenge-1',
  credential_id: 'cred-1',
  payload: 'Sign this',
  payload_hash: '0x1234',
  nonce: 'nonce-1',
  scopes: ['wallet.sign'],
  issued_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  expires_at: new Date('2024-01-01T00:05:00Z').toISOString(),
  server_signature: '0xserver',
};

describe('ServerOrchestratorWalletConnector', () => {
  afterEach(() => {
    mock.restore();
  });

  it('delegates signing to the orchestrator endpoint', async () => {
    const fetch = mock(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        expect(body).toEqual(
          expect.objectContaining({
            message: 'Sign this',
            encoding: 'utf-8',
            idempotency_key: baseChallenge.id,
          })
        );

        return new Response(
          JSON.stringify({
            signed: { signature: '0xsigned' },
            wallet: { id: 'wallet-1', address: '0xabc', provider: 'lucid' },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        );
      }
    );

    const connector = new ServerOrchestratorWalletConnector({
      baseUrl: 'https://api.example',
      agentRef: 'agent-123',
      fetch,
    });

    connector.setAccessToken('test-token');

    const signature = await connector.signChallenge(baseChallenge);
    expect(signature).toBe('0xsigned');

    const metadata = await connector.getWalletMetadata();
    expect(metadata).toEqual(
      expect.objectContaining({ id: 'wallet-1', address: '0xabc' })
    );
  });

  it('throws when access token is missing', async () => {
    const connector = new ServerOrchestratorWalletConnector({
      baseUrl: 'https://api.example',
      agentRef: 'agent-123',
      fetch: async () => new Response(null, { status: 200 }),
    });

    await expect(connector.signChallenge(baseChallenge)).rejects.toThrow(
      /requires a bearer token/i
    );
  });
});
