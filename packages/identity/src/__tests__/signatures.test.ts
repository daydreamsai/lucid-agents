import { describe, expect, it } from 'bun:test';

import { buildAgentWalletTypedData } from '../registries/signatures';

describe('buildAgentWalletTypedData', () => {
  it('builds typed data payload for agent wallet updates', () => {
    const typed = buildAgentWalletTypedData({
      agentId: 42n,
      newWallet: '0x000000000000000000000000000000000000beef',
      deadline: 123n,
      chainId: 84532,
      verifyingContract: '0x000000000000000000000000000000000000dEaD',
      name: 'ERC-8004 Identity Registry',
      version: '1',
    });

    expect(typed.primaryType).toBe('AgentWallet');
    expect(typed.domain.chainId).toBe(84532);
    expect(typed.message.agentId).toBe('42');
    expect(typed.message.newWallet).toBe('0x000000000000000000000000000000000000beef');
  });
});
