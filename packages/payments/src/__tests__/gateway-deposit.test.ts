import { describe, expect, it, mock } from 'bun:test';
import { depositToGateway } from '../gateway/deposit';
import type { CircleGatewayClientDeps } from '../gateway/types';

const PRIVATE_KEY =
  '0x2222222222222222222222222222222222222222222222222222222222222222' as const;

function createDeps() {
  const gatewayConfigs: Array<{ chain: string; privateKey: string; rpcUrl?: string }> = [];
  const depositCalls: Array<{
    amount: string;
    options?: { approveAmount?: string; skipApprovalCheck?: boolean };
  }> = [];

  const deposit = mock(
    async (
      amount: string,
      options?: { approveAmount?: string; skipApprovalCheck?: boolean }
    ) => {
      depositCalls.push({ amount, options });
      return { depositTxHash: '0xdeposit', amount };
    }
  );

  class GatewayClient {
    constructor(config: { chain: string; privateKey: string; rpcUrl?: string }) {
      gatewayConfigs.push(config);
    }

    getBalances = mock(async () => ({}));
    deposit = deposit;
  }

  const deps: CircleGatewayClientDeps = {
    BatchEvmScheme: class {
      readonly scheme = 'exact';
      constructor(_signer: unknown) {}
    } as any,
    GatewayClient: GatewayClient as any,
  };

  return {
    deps,
    gatewayConfigs,
    depositCalls,
  };
}

describe('depositToGateway', () => {
  it('throws for empty amount', async () => {
    const { deps } = createDeps();
    await expect(
      depositToGateway(
        '',
        {
          privateKey: PRIVATE_KEY,
          chain: 'base',
        },
        deps
      )
    ).rejects.toThrow('depositToGateway requires a non-empty amount');
  });

  it('throws for empty private key', async () => {
    const { deps } = createDeps();
    await expect(
      depositToGateway(
        '1.0',
        {
          privateKey: '' as `0x${string}`,
          chain: 'base',
        },
        deps
      )
    ).rejects.toThrow('depositToGateway requires a non-empty privateKey');
  });

  it('normalizes base-sepolia and forwards deposit options', async () => {
    const { deps, gatewayConfigs, depositCalls } = createDeps();
    await depositToGateway(
      '1.25',
      {
        privateKey: PRIVATE_KEY,
        chain: 'base-sepolia',
        approveAmount: '2.0',
        skipApprovalCheck: true,
      },
      deps
    );

    expect(gatewayConfigs[0]?.chain).toBe('baseSepolia');
    expect(depositCalls[0]).toEqual({
      amount: '1.25',
      options: { approveAmount: '2.0', skipApprovalCheck: true },
    });
  });

  it('passes rpcUrl to GatewayClient and returns deposit result', async () => {
    const { deps, gatewayConfigs } = createDeps();
    const result = await depositToGateway(
      '3.0',
      {
        privateKey: PRIVATE_KEY,
        chain: 'base',
        rpcUrl: 'https://rpc.base.org',
      },
      deps
    );

    expect(gatewayConfigs[0]?.rpcUrl).toBe('https://rpc.base.org');
    expect(result).toEqual({ depositTxHash: '0xdeposit', amount: '3.0' });
  });

  it('throws on unsupported gateway chain', async () => {
    const { deps } = createDeps();
    await expect(
      depositToGateway(
        '1.0',
        {
          privateKey: PRIVATE_KEY,
          chain: 'unknown' as any,
        },
        deps
      )
    ).rejects.toThrow('Unsupported Circle Gateway chain');
  });
});
