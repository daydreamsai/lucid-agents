import { describe, expect, it } from 'bun:test';

import {
  canonicalAmount,
  canonicalChainId,
  canonicalTransferBody,
  contractCallKeyMaterial,
  deriveContractCallKey,
  deriveTransferKey,
  encodeTaskId,
  normalizeAddress,
  sha256Hex,
  transferKeyMaterial,
} from '../client/idempotency';

const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const RECIPIENT = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';

describe("canonicalAmount (KeeperHub 'Choosing a stable key' rules)", () => {
  const cases: Array<[string, string]> = [
    ['0.0010', '0.001'],
    ['1.000', '1'],
    ['1.', '1'],
    ['.5', '0.5'],
    ['01.5', '1.5'],
    ['007', '7'],
    ['0', '0'],
    ['0.0', '0'],
    ['0.000', '0'],
    [' 0.10 ', '0.1'],
    ['100', '100'],
    ['10.05', '10.05'],
  ];
  for (const [input, expected] of cases) {
    it(`${input} -> ${expected}`, () => {
      expect(canonicalAmount(input)).toBe(expected);
    });
  }
  for (const input of ['+1', '-1', '1e3', '1,5', '', '.', 'abc', '0x10']) {
    it(`rejects ${JSON.stringify(input)}`, () => {
      expect(() => canonicalAmount(input)).toThrow();
    });
  }
});

describe('canonicalChainId', () => {
  it('resolves numbers, numeric strings and known names', () => {
    expect(canonicalChainId(8453)).toBe('8453');
    expect(canonicalChainId('0084532')).toBe('84532');
    expect(canonicalChainId('Base-Sepolia')).toBe('84532');
    expect(canonicalChainId('sepolia')).toBe('11155111');
    expect(() => canonicalChainId('mars')).toThrow(/unknown chain/);
    expect(() => canonicalChainId(1.5)).toThrow();
  });
});

describe('encodeTaskId and normalizeAddress', () => {
  it('escapes separators and lowercases addresses', () => {
    expect(encodeTaskId('8453|0xabc')).toBe('8453%7C0xabc');
    expect(encodeTaskId('50%')).toBe('50%25');
    expect(normalizeAddress(RECIPIENT)).toBe(RECIPIENT.toLowerCase());
    expect(() => normalizeAddress('0x123')).toThrow(/invalid EVM address/);
  });
});

describe('idempotency keys', () => {
  const input = {
    taskId: 'invoice-2026-09-06-001',
    chainId: 'base-sepolia',
    recipientAddress: RECIPIENT,
    amount: '0.010',
    tokenAddress: USDC_BASE_SEPOLIA,
  };

  it('joins canonical parts with a bare vertical bar', () => {
    expect(transferKeyMaterial(input)).toBe(
      `invoice-2026-09-06-001|84532|${RECIPIENT.toLowerCase()}|0.01|${USDC_BASE_SEPOLIA.toLowerCase()}`
    );
    const { tokenAddress: _omit, ...native } = input;
    expect(transferKeyMaterial(native)).toBe(
      `invoice-2026-09-06-001|84532|${RECIPIENT.toLowerCase()}|0.01|`
    );
  });

  it('is a lowercase sha256 of the material, stable across spellings, different for different work', async () => {
    const key = await deriveTransferKey(input);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toBe(await sha256Hex(transferKeyMaterial(input)));
    expect(
      await deriveTransferKey({ ...input, chainId: 84532, amount: '0.01' })
    ).toBe(key);
    expect(await deriveTransferKey({ ...input, amount: '0.02' })).not.toBe(key);
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('covers contract calls too', async () => {
    expect(
      contractCallKeyMaterial({
        taskId: 'job-1',
        chainId: 84532,
        contractAddress: USDC_BASE_SEPOLIA,
        functionName: ' transfer ',
        functionArgs: '["0xabc", "1000"]',
        value: '0.0',
      })
    ).toBe(
      `job-1|84532|${USDC_BASE_SEPOLIA.toLowerCase()}|transfer|["0xabc", "1000"]|0`
    );
    expect(
      await deriveContractCallKey({
        taskId: 'job-1',
        chainId: 84532,
        contractAddress: USDC_BASE_SEPOLIA,
        functionName: 'transfer',
      })
    ).toMatch(/^[0-9a-f]{64}$/);
  });

  it("canonicalises the body so a retry matches KeeperHub's stored hash", () => {
    const a = canonicalTransferBody({
      chainId: 'base-sepolia',
      recipientAddress: RECIPIENT,
      amount: '0.010',
      tokenAddress: USDC_BASE_SEPOLIA,
    });
    const b = canonicalTransferBody({
      chainId: 84532,
      recipientAddress: RECIPIENT.toLowerCase(),
      amount: '0.01',
      tokenAddress: USDC_BASE_SEPOLIA.toLowerCase(),
    });
    expect(a).toEqual(b);
  });
});
