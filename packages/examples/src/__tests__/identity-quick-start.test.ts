import type {
  AgentIdentity,
  CreateAgentIdentityOptions,
} from '@lucid-agents/identity';
import { describe, expect, mock, test } from 'bun:test';

import { runIdentityQuickStart } from '../identity/quick-start';

describe('identity quick-start', () => {
  test('keeps default execution read-only even when a wallet is configured', async () => {
    const lookupIdentity = mock(
      async (options: CreateAgentIdentityOptions): Promise<AgentIdentity> => {
        expect(options.autoRegister).toBe(false);
        return { status: 'No identity resolved' };
      }
    );
    const registerIdentity = mock(
      async (): Promise<AgentIdentity> => ({
        status: 'Unexpected registration',
        didRegister: true,
      })
    );

    await runIdentityQuickStart({
      env: {
        AGENT_WALLET_TYPE: 'local',
        AGENT_WALLET_PRIVATE_KEY:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
        IDENTITY_AUTO_REGISTER: 'false',
      },
      lookupIdentity,
      registerIdentity,
      log: () => {},
    });

    expect(lookupIdentity).toHaveBeenCalledTimes(1);
    expect(registerIdentity).not.toHaveBeenCalled();
  });

  test('requires an explicit domain before entering the opt-in write flow', async () => {
    const registerIdentity = mock(
      async (): Promise<AgentIdentity> => ({
        status: 'Unexpected registration',
        didRegister: true,
      })
    );

    await expect(
      runIdentityQuickStart({
        env: { IDENTITY_AUTO_REGISTER: 'true' },
        lookupIdentity: async () => ({ status: 'No identity resolved' }),
        registerIdentity,
        log: () => {},
      })
    ).rejects.toThrow('AGENT_DOMAIN is required');

    expect(registerIdentity).not.toHaveBeenCalled();
  });
});
