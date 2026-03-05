import { describe, expect, it, mock } from 'bun:test';
import { depositToGateway } from './deposit';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeDepositCtor(depositImpl?: (...args: unknown[]) => Promise<unknown>) {
  const depositFn = depositImpl ?? mock(async (amount: string, _opts?: unknown) => ({
    approvalTxHash: '0xapproval123' as `0x${string}`,
    depositTxHash: '0xdeposit456' as `0x${string}`,
    amount: BigInt(Math.floor(parseFloat(amount) * 1_000_000)),
    formattedAmount: amount,
    depositor: '0xdepositor' as `0x${string}`,
  }));

  const Ctor = mock(function MockGatewayClient(_cfg: unknown) {
    return { deposit: depositFn };
  }) as unknown as new (cfg: unknown) => { deposit: typeof depositFn };

  return { Ctor, depositFn };
}

const PK = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as `0x${string}`;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('depositToGateway', () => {
  it('calls GatewayClient.deposit() with correct amount', async () => {
    const { Ctor, depositFn } = makeDepositCtor();
    const result = await depositToGateway('10', 'base', PK, undefined, { GatewayClient: Ctor });

    expect(depositFn).toHaveBeenCalledTimes(1);
    expect(result.formattedAmount).toBe('10');
    expect(result.depositTxHash).toBe('0xdeposit456');
  });

  it('passes chain and privateKey to GatewayClient constructor', async () => {
    const { Ctor } = makeDepositCtor();
    await depositToGateway('5', 'baseSepolia', PK, undefined, { GatewayClient: Ctor });

    expect(Ctor).toHaveBeenCalledWith({ chain: 'baseSepolia', privateKey: PK });
  });

  it('returns deposit result with correct structure', async () => {
    const { Ctor } = makeDepositCtor();
    const result = await depositToGateway('100', 'arcTestnet', PK, undefined, { GatewayClient: Ctor });

    expect(result).toHaveProperty('depositTxHash');
    expect(result).toHaveProperty('amount');
    expect(result).toHaveProperty('formattedAmount');
    expect(result).toHaveProperty('depositor');
    expect(typeof result.depositTxHash).toBe('string');
    expect(typeof result.amount).toBe('bigint');
  });

  it('throws for amount of zero', async () => {
    await expect(depositToGateway('0', 'base', PK)).rejects.toThrow('positive amount');
  });

  it('throws for negative amount', async () => {
    await expect(depositToGateway('-5', 'base', PK)).rejects.toThrow('positive amount');
  });

  it('throws for missing chain', async () => {
    await expect(depositToGateway('10', '' as never, PK)).rejects.toThrow('chain');
  });

  it('throws for missing privateKey', async () => {
    await expect(depositToGateway('10', 'base', '' as `0x${string}`)).rejects.toThrow('privateKey');
  });

  it('forwards optional deposit options to GatewayClient.deposit()', async () => {
    const depositFn = mock(async (_amount: string, _opts?: unknown) => ({
      depositTxHash: '0xtest' as `0x${string}`,
      amount: 10_000_000n,
      formattedAmount: '10',
      depositor: '0xdepositor' as `0x${string}`,
    }));
    const Ctor = mock(function (_c: unknown) {
      return { deposit: depositFn };
    }) as unknown as new (c: unknown) => { deposit: typeof depositFn };

    await depositToGateway('10', 'base', PK, { approveAmount: '20', skipApprovalCheck: false }, { GatewayClient: Ctor });

    expect(depositFn).toHaveBeenCalledWith('10', { approveAmount: '20', skipApprovalCheck: false });
  });
});
